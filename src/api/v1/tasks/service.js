// src/api/v1/tasks/service.js
const { Task, Project, Person, TaskAssignment, Status, Job } = require('../../../models'); // Added Job model
const { Op } = require('sequelize');
const sequelize = require('../../../models').sequelize; // Import sequelize instance for transactions if needed

// --- Helper Functions (Adapted for Tasks) ---

// Helper function to build the where clause for filtering Tasks
const buildTaskWhereClause = (filter = {}) => {
  const where = {};

  // Direct Task fields
  if (filter.name) {
    where.name = { [Op.iLike]: `%${filter.name}%` };
  }
  if (filter.project_id) {
    where.project_id = parseInt(filter.project_id, 10);
  }
  if (filter.status_id) {
    const statusIds = typeof filter.status_id === 'string' ? filter.status_id.split(',') : filter.status_id;
    if (Array.isArray(statusIds) && statusIds.length > 0) {
       where.status_id = { [Op.in]: statusIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) };
    } else if (!isNaN(parseInt(filter.status_id, 10))) {
       where.status_id = parseInt(filter.status_id, 10);
    }
  }
  if (filter.priority) {
    where.priority = filter.priority;
  }
  if (filter.archived !== undefined) {
    where.archived = String(filter.archived).toLowerCase() === 'true';
  }
   if (filter.created_by_user_id) {
    where.created_by_user_id = parseInt(filter.created_by_user_id, 10);
  }

  // Date range filters
  const parseDate = (dateStr) => {
      if (dateStr instanceof Date) return dateStr;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
  }
  const applyDateRangeFilter = (field, from, to) => {
      const dateFrom = parseDate(from);
      const dateTo = parseDate(to);
      const inclusiveDateTo = dateTo ? new Date(dateTo.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
      if (dateFrom && inclusiveDateTo) {
          where[field] = { [Op.between]: [dateFrom, inclusiveDateTo] };
      } else if (dateFrom) {
          where[field] = { [Op.gte]: dateFrom };
      } else if (inclusiveDateTo) {
          where[field] = { [Op.lte]: inclusiveDateTo };
      }
  }
  applyDateRangeFilter('created_at', filter.created_from, filter.created_to);
  applyDateRangeFilter('start_date', filter.start_from, filter.start_to);
  applyDateRangeFilter('due_date', filter.due_from, filter.due_to);
  applyDateRangeFilter('completed_at', filter.completed_from, filter.completed_to);
  applyDateRangeFilter('modified_at', filter.modified_from, filter.modified_to);

  // Filter by assigned user requires a subquery or join handled in listTasks

  return where;
};

// Helper function to build the order clause for sorting Tasks
const buildTaskOrderClause = (sort) => {
  if (!sort) {
    return [['created_at', 'DESC']]; // Default sort
  }
  const order = [];
  const sortFields = sort.split(',');
  const allowedSortFields = Object.keys(Task.rawAttributes); // Use Task model attributes

  sortFields.forEach(field => {
    const [fieldName, direction = 'asc'] = field.trim().split(':');
    const lowerDirection = direction.toLowerCase();
    const actualFieldName = Task.options.underscored ? fieldName : fieldName; // Adjust if needed

    // --- Start Fix 1d: Validate sort order ---
    const allowedOrder = ['asc','desc'];
    if (!allowedOrder.includes(lowerDirection)) {
      const error = new Error('Invalid sort order');
      error.statusCode = 400;
      throw error;
    }
    // --- End Fix 1d ---

    // --- Start Fix 1c: Validate sort field ---
    if (!allowedSortFields.includes(actualFieldName)) {
        const error = new Error('Invalid sort field');
        error.statusCode = 400;
        throw error;
    }
    // --- End Fix 1c ---

    // If validation passes, push the order
    order.push([actualFieldName, lowerDirection.toUpperCase()]);

    // Removed the old 'else' block that just warned
    // else {
    //   console.warn(`Invalid sort field or direction ignored for Task: ${field}`);
    // }
  });

  if (order.length === 0 && sortFields.length > 0) { // Only default if no valid fields were provided *and* sort was attempted
      // If sort was attempted but all fields were invalid, we should have already thrown an error.
      // If sort was not attempted (sort is null/empty), the default is applied before this loop.
      // This block might be redundant now due to the error throwing, but kept for safety.
      // If we reach here with an empty order after processing, it implies an issue.
      // However, the initial check at line 68 handles the !sort case.
      // Let's refine the logic: if sort was provided but resulted in empty order (shouldn't happen with throws), maybe default?
      // Reverting to original default logic placement seems safer. The throws handle invalid cases.
  } else if (order.length === 0) { // Apply default if no sort specified or if sort resulted in empty (though throws should prevent this)
      order.push(['created_at', 'DESC']);
  }
  return order;
};

// Helper function to build the attributes clause for Task field selection
const buildTaskAttributesClause = (fields) => {
  if (!fields) return null; // Return all fields
  const fieldList = typeof fields === 'string' ? fields.split(',') : fields;
  const allowedFields = Object.keys(Task.rawAttributes);
  const validFields = fieldList.map(f => f.trim()).filter(f => allowedFields.includes(f));

  if (validFields.length === 0) {
      console.warn('No valid fields requested for Task selection, returning default fields.');
      return null;
  }
  if (!validFields.includes('id')) {
      validFields.push('id'); // Always include primary key
  }
  return validFields;
};

// Helper function to build the include clause for Task eager loading
const buildTaskIncludeClause = (includeParam, filter = {}) => {
  const includeClause = [];
  const requestedIncludes = typeof includeParam === 'string' ? includeParam.split(',') : (includeParam || []);

  // Define possible includes for Task
  const includeMap = {
    // --- Start Fix 1e: Exclude password ---
    project: { model: Project, as: 'Project' },
    status: { model: Status, as: 'Status' },
    creator: {
        model: Person,
        as: 'Creator', // Assumes 'Creator' alias is defined in Task model association
        attributes: { exclude: ['password'] }
    },
    modifier: {
        model: Person,
        as: 'Modifier', // Assumes 'Modifier' alias is defined
        attributes: { exclude: ['password'] }
    },
    assignees: {
        model: Person,
        as: 'Assignees', // FIX: Match alias defined in Task model ('Assignees')
        through: { attributes: [] }, // Don't include TaskAssignment attributes
        attributes: { exclude: ['password'] }
    },
    job: { model: Job, as: 'job' } // Added Job include (assuming 'job' alias)
    // --- End Fix 1e ---
  };

  requestedIncludes.forEach(inc => {
    const key = inc.trim().toLowerCase();
    if (includeMap[key]) {
      includeClause.push(includeMap[key]);
    } else {
      console.warn(`Invalid include parameter ignored for Task: ${inc}`);
    }
  });

  // Special handling for filtering by assigned_user_id
  // If filtering by assigned user, we MUST include the association to filter on it
  if (filter.assigned_user_id) {
      // --- Start Fix 1e: Exclude password (also needed for filter join) ---
      const assigneeInclude = {
          model: Person,
          as: 'Assignees', // FIX: Match alias defined in Task model ('Assignees')
          where: { employee_id: parseInt(filter.assigned_user_id, 10) },
          required: true, // Makes it an INNER JOIN
          through: { attributes: [] },
          attributes: { exclude: ['password'] } // Exclude password here too
      };
      // --- End Fix 1e ---
      // Avoid adding duplicate include if 'assignees' was already requested
      if (!includeClause.some(inc => inc.as === 'Assignees')) { // FIX: Check for correct alias
          includeClause.push(assigneeInclude);
      } else {
          // If 'assignees' was requested, merge the where clause into it
          const existingInclude = includeClause.find(inc => inc.as === 'Assignees'); // FIX: Find correct alias
          existingInclude.where = { employee_id: parseInt(filter.assigned_user_id, 10) };
          existingInclude.required = true;
          // --- Start Fix 1e: Exclude password (when merging filter) ---
          if (!existingInclude.attributes) {
              existingInclude.attributes = {};
          }
          existingInclude.attributes.exclude = [...(existingInclude.attributes.exclude || []), 'password'];
          // Ensure uniqueness in exclude array if merging multiple times (though unlikely here)
          existingInclude.attributes.exclude = [...new Set(existingInclude.attributes.exclude)];
          // --- End Fix 1e ---
      }
  }


  return includeClause;
};


// --- Service Functions ---

// Service function to list tasks with pagination, filtering, sorting, and field selection
const listTasks = async (options = {}) => {
  const { limit = 10, offset = 0, filter = {}, sort, fields, include } = options;

  const effectiveLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  const effectiveOffset = Math.max(0, parseInt(offset, 10) || 0);

  // Build clauses, passing filter to include builder for assignee filtering
  const whereClause = buildTaskWhereClause(filter);
  const orderClause = buildTaskOrderClause(sort);
  const attributesClause = buildTaskAttributesClause(fields);
  const includeClause = buildTaskIncludeClause(include, filter); // Pass filter here

  const queryOptions = {
    where: whereClause,
    order: orderClause,
    limit: effectiveLimit,
    offset: effectiveOffset,
    include: includeClause,
    distinct: true, // Necessary when using include with limit/offset and filtering on associations
  };

  if (attributesClause) {
    queryOptions.attributes = attributesClause;
  }

  try {
    console.log('Executing Task.findAndCountAll with options:', JSON.stringify(queryOptions, null, 2));
    // Need to count separately when using 'distinct' and 'include' with required: true for filtering
    // Count without limit/offset/attributes/order but with where and include (for filtering join)
    const countOptions = { where: whereClause, include: includeClause, distinct: true, col: 'id' }; // Count based on primary key
    const totalCount = await Task.count(countOptions);

    const rows = await Task.findAll(queryOptions);

    return { total: totalCount, limit: effectiveLimit, offset: effectiveOffset, tasks: rows };
  } catch (error) {
    console.error('Error fetching tasks:', error);
    throw new Error(`Failed to retrieve tasks: ${error.message}`);
  }
};

// Service function to get a single task by ID with optional related data
const getTaskById = async (id, options = {}) => {
  const { include, fields } = options;
  const taskId = parseInt(id, 10);

  if (isNaN(taskId)) {
      throw Object.assign(new Error('Invalid task ID provided.'), { statusCode: 400 });
  }

  const includeClause = buildTaskIncludeClause(include); // No filter needed here
  const attributesClause = buildTaskAttributesClause(fields);

  const queryOptions = {
      include: includeClause,
  };

  if (attributesClause) {
      queryOptions.attributes = attributesClause;
  }

  try {
      console.log(`Executing Task.findByPk for ID: ${taskId} with options:`, JSON.stringify(queryOptions, null, 2));
      const task = await Task.findByPk(taskId, queryOptions);

      if (!task) {
          throw Object.assign(new Error(`Task with ID ${taskId} not found.`), { statusCode: 404 });
      }
      return task;
  } catch (error) {
      console.error(`Error fetching task with ID ${taskId}:`, error);
      if (!error.statusCode) {
          error.message = `Failed to retrieve task with ID ${taskId}: ${error.message}`;
      }
      throw error;
  }
};

// Service function to create a new task
const createTask = async (taskData, creatorUserId) => {
  try {
    // Define allowed fields for creation
    const allowedFields = [
        'name', 'description', 'project_id', 'status_id', 'priority',
        'start_date', 'due_date', 'estimated_hours', 'archived'
        // Add other mutable fields from Task model
    ];
    const dataToCreate = {};
    allowedFields.forEach(field => {
      if (taskData.hasOwnProperty(field)) {
        dataToCreate[field] = taskData[field];
      }
    });

    // Set creator ID
    dataToCreate.created_by_user_id = creatorUserId;

    // --- Validate Foreign Keys ---
    try {
        console.log(`[Service:createTask] Validating FKs for data:`, JSON.stringify(dataToCreate)); // Log input data
        if (dataToCreate.project_id) {
            console.log(`[Service:createTask] Checking Project ID: ${dataToCreate.project_id}`);
            const projectExists = await Project.findByPk(dataToCreate.project_id);
            console.log(`[Service:createTask] Project ID ${dataToCreate.project_id} exists:`, !!projectExists);
            if (!projectExists) {
                console.error(`[Service:createTask] Invalid Project ID detected: ${dataToCreate.project_id}. Throwing 400.`); // Log before throwing
                throw Object.assign(new Error(`Invalid Project ID: ${dataToCreate.project_id}`), { statusCode: 400 });
            }
        } else {
             console.log(`[Service:createTask] No project_id provided in data.`);
        }

        if (dataToCreate.status_id) {
            console.log(`[Service:createTask] Checking Status ID: ${dataToCreate.status_id}`);
            const statusExists = await Status.findByPk(dataToCreate.status_id);
            console.log(`[Service:createTask] Status ID ${dataToCreate.status_id} exists:`, !!statusExists);
            if (!statusExists) {
                console.error(`[Service:createTask] Invalid Status ID detected: ${dataToCreate.status_id}. Throwing 400.`); // Log before throwing
                throw Object.assign(new Error(`Invalid Status ID: ${dataToCreate.status_id}`), { statusCode: 400 });
            }
        } else {
             console.log(`[Service:createTask] No status_id provided in data.`);
        }
        // --- End Validation ---

        console.log('[Service:createTask] FK Validation passed. Attempting Task.create...');
        const newTask = await Task.create(dataToCreate);
        console.log('[Service:createTask] Task.create successful. Task ID:', newTask.id);
        
        // Return raw object immediately after creation for maximum simplification
        return newTask;
        // return getTaskById(newTask.id, { include: 'Project' }); // Previous attempt
        // return getTaskById(newTask.id, { include: 'Project,Status,Creator' }); // Original attempt after case fix
        // return newTask.reload(); // Reverted change
    } catch (dbError) {
        // Handle specific database errors
        if (dbError.name === 'SequelizeValidationError') {
            // console.log('[Service:createTask] Caught SequelizeValidationError. Throwing 400.'); // Removed log
            throw Object.assign(new Error(`Task creation validation failed: ${dbError.errors.map(e => e.message).join(', ')}`), { statusCode: 400 });
        } else if (dbError.name === 'SequelizeForeignKeyConstraintError') {
            // console.log('[Service:createTask] Caught SequelizeForeignKeyConstraintError. Throwing 400.'); // Removed log
            throw Object.assign(new Error(`Task creation failed due to invalid foreign key: ${dbError.message}`), { statusCode: 400 });
        } else if (dbError.name === 'SequelizeUniqueConstraintError') {
            // console.log('[Service:createTask] Caught SequelizeUniqueConstraintError. Throwing 409.'); // Removed log
            throw Object.assign(new Error(`Task creation failed due to unique constraint: ${dbError.message}`), { statusCode: 409 });
        } else if (dbError.message && (
            dbError.message.includes('Invalid Project ID') ||
            dbError.message.includes('Invalid Status ID')
        )) {
            // Catch our custom validation errors and ensure they have 400 status
            throw Object.assign(new Error(dbError.message), { statusCode: 400 });
        }
        // Re-throw with proper status code
        throw Object.assign(new Error(`Database error: ${dbError.message}`), { statusCode: 500 });
    }
  } catch (error) {
    console.error('Error creating task:', error);
    // Re-throw with statusCode if it already has one, otherwise set to 500
    if (!error.statusCode) {
        error.statusCode = 500;
        error.message = `Failed to create task: ${error.message}`;
    }
    throw error;
  }
};

// Service function to update an existing task
const updateTask = async (id, taskData, modifierUserId) => {
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
      throw Object.assign(new Error('Invalid task ID provided.'), { statusCode: 400 });
  }

  try {
    const task = await Task.findByPk(taskId);
    if (!task) {
      // console.log(`[Service:updateTask] Task ID ${taskId} not found. Throwing 404.`); // Ensure log is removed
      throw Object.assign(new Error(`Task with ID ${taskId} not found.`), { statusCode: 404 });
    }

    // Define allowed fields for update
    const allowedUpdateFields = [
        'name', 'description', 'project_id', 'status_id', 'priority',
        'start_date', 'due_date', 'completed_at', 'estimated_hours', 'actual_hours', 'archived'
        // Add other mutable fields
    ];
    const dataToUpdate = {};
    allowedUpdateFields.forEach(field => {
      if (taskData.hasOwnProperty(field)) {
        dataToUpdate[field] = taskData[field];
      }
    });

    // Set modifier ID
    dataToUpdate.modified_by_user_id = modifierUserId;
    // modified_at is handled by Sequelize timestamps: true

    try {
        // --- Handle immutable fields ---
        // Remove any attempts to update immutable fields
        if (dataToUpdate.project_id && dataToUpdate.project_id !== task.project_id) {
            console.log(`Ignoring attempt to update immutable field project_id from ${task.project_id} to ${dataToUpdate.project_id}`);
            delete dataToUpdate.project_id;
        }
        
        // --- Validate Foreign Keys if changed ---
        if (dataToUpdate.status_id && dataToUpdate.status_id !== task.status_id) {
            const statusExists = await Status.findByPk(dataToUpdate.status_id);
            if (!statusExists) throw Object.assign(new Error(`Invalid Status ID: ${dataToUpdate.status_id}`), { statusCode: 400 });
        }
        // --- End Validation ---

        await task.update(dataToUpdate);
        // Return raw object immediately after update for maximum simplification
        return task;
        // return getTaskById(taskId, { include: 'Project' }); // Previous attempt
        // return getTaskById(taskId, { include: 'Project,Status,Creator,Modifier,Assignees' }); // Original attempt after case fix
        // return task.reload(); // Reverted change
    } catch (dbError) {
        // Handle specific database errors
        if (dbError.name === 'SequelizeValidationError') {
            throw Object.assign(new Error(`Task update validation failed: ${dbError.errors.map(e => e.message).join(', ')}`), { statusCode: 400 });
        } else if (dbError.name === 'SequelizeForeignKeyConstraintError') {
            throw Object.assign(new Error(`Task update failed due to invalid foreign key: ${dbError.message}`), { statusCode: 400 });
        } else if (dbError.name === 'SequelizeUniqueConstraintError') {
            throw Object.assign(new Error(`Task update failed due to unique constraint: ${dbError.message}`), { statusCode: 409 });
        } else if (dbError.message && (
            dbError.message.includes('Invalid Project ID') ||
            dbError.message.includes('Invalid Status ID')
        )) {
            // Catch our custom validation errors and ensure they have 400 status
            throw Object.assign(new Error(dbError.message), { statusCode: 400 });
        }
        // Re-throw with proper status code
        throw Object.assign(new Error(`Database error: ${dbError.message}`), { statusCode: 500 });
    }
  } catch (error) {
    console.error(`Error updating task ID ${taskId}:`, error);
    // Re-throw with statusCode if it already has one, otherwise set to 500
    if (!error.statusCode) {
        error.statusCode = 500;
        error.message = `Failed to update task ID ${taskId}: ${error.message}`;
    }
    throw error;
  }
};

// Service function to delete a task
const deleteTask = async (id) => {
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
      throw Object.assign(new Error('Invalid task ID provided.'), { statusCode: 400 });
  }

  // Optional: Use a transaction if deleting related data (like assignments)
  // const transaction = await sequelize.transaction();

  try {
    const task = await Task.findByPk(taskId /*, { transaction }*/);
    if (!task) {
      // await transaction.rollback(); // Rollback if using transaction
      // console.log(`[Service:deleteTask] Task ID ${taskId} not found. Throwing 404.`); // Ensure log is removed
      throw Object.assign(new Error(`Task with ID ${taskId} not found.`), { statusCode: 404 });
    }

    // Optional: Delete related TaskAssignments first if required by constraints/logic
    // await TaskAssignment.destroy({ where: { task_id: taskId }, transaction });

    await task.destroy(/*{ transaction }*/);
    // await transaction.commit(); // Commit if using transaction

    return { deleted: true }; // Indicate success
  } catch (error) {
    // await transaction.rollback(); // Rollback on error if using transaction
    console.error(`Error deleting task ID ${taskId}:`, error);
    // Ensure statusCode is set if not already present (but respect existing 404)
    if (!error.statusCode) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            error.statusCode = 409;
            error.message = `Cannot delete task ID ${taskId} due to existing dependencies.`;
        } else {
            // Default to 500 for any other unexpected error caught here
            error.statusCode = 500;
            error.message = `Failed to delete task ID ${taskId}: ${error.message}`;
        }
    }
    // Re-throw the error, now guaranteed to have a statusCode
    throw error;
  }
};

// Service function to assign a user to a task
const assignUserToTask = async (taskId, userId, assignerId) => {
    const tId = parseInt(taskId, 10);
    const uId = parseInt(userId, 10); // Assuming userId is the Person's employee_id

    if (isNaN(tId) || isNaN(uId)) {
        throw Object.assign(new Error('Invalid Task ID or User ID provided.'), { statusCode: 400 });
    }

    try {
        // 1. Verify Task exists
        const taskExists = await Task.count({ where: { id: tId } });
        if (taskExists === 0) {
            throw Object.assign(new Error(`Task with ID ${tId} not found.`), { statusCode: 404 });
        }

        // 2. Verify Person exists (using employee_id)
        const personExists = await Person.count({ where: { employee_id: uId } });
        if (personExists === 0) {
            throw Object.assign(new Error(`Person with User ID ${uId} not found.`), { statusCode: 404 });
        }

        // 3. Create or find the assignment
        try {
            const [assignment, created] = await TaskAssignment.findOrCreate({
                where: { task_id: tId, employee_id: uId }, // Correct field name
                defaults: {
                    task_id: tId,
                    employee_id: uId, // Correct field name
                    // Optionally set assigned_by_user_id if the model supports it
                    // assigned_by_user_id: assignerId
                }
            });

            return { assignment, created }; // Return the assignment record and whether it was newly created
        } catch (dbError) {
            // Handle specific database errors
            if (dbError.name === 'SequelizeUniqueConstraintError') {
                throw Object.assign(new Error(`User ${uId} is already assigned to task ${tId}.`), { statusCode: 409 });
            }
            // Re-throw any other database errors with proper status code
            throw Object.assign(new Error(`Database error: ${dbError.message}`), { statusCode: 500 });
        }

    } catch (error) {
        console.error(`Error assigning user ${uId} to task ${tId}:`, error);
        // Re-throw with statusCode if it already has one, otherwise set to 500
        if (!error.statusCode) {
            error.statusCode = 500;
            error.message = `Failed to assign user to task: ${error.message}`;
        }
        throw error;
    }
};

// Service function to unassign a user from a task
const unassignUserFromTask = async (taskId, userId, unassignerId) => {
    const tId = parseInt(taskId, 10);
    const uId = parseInt(userId, 10); // Assuming userId is the Person's employee_id

    if (isNaN(tId) || isNaN(uId)) {
        throw Object.assign(new Error('Invalid Task ID or User ID provided.'), { statusCode: 400 });
    }

    try {
        // First verify the task exists
        const taskExists = await Task.count({ where: { id: tId } });
        if (taskExists === 0) {
            throw Object.assign(new Error(`Task with ID ${tId} not found.`), { statusCode: 404 });
        }

        // Then verify the user exists
        const personExists = await Person.count({ where: { employee_id: uId } });
        if (personExists === 0) {
            throw Object.assign(new Error(`Person with User ID ${uId} not found.`), { statusCode: 404 });
        }

        // Find and delete the specific assignment
        try {
            const result = await TaskAssignment.destroy({
                where: {
                    task_id: tId,
                    employee_id: uId // Correct field name
                }
            });

            if (result === 0) {
                // Assignment didn't exist - this is a 404 scenario
                throw Object.assign(new Error(`Assignment for Task ID ${tId} and User ID ${uId} not found.`), { statusCode: 404 });
            }
            // If destroy was successful (result > 0)
            return { deleted: true }; // Indicate success
        } catch (dbError) {
            // Catch potential errors during the destroy operation itself
            console.error(`Database error during TaskAssignment.destroy: ${dbError.message}`);
            // Check if this is a "not found" error and return 404 instead of 500
            if (dbError.message && dbError.message.includes('not found')) {
                throw Object.assign(new Error(`Assignment for Task ID ${tId} and User ID ${uId} not found.`), { statusCode: 404 });
            } else {
                throw Object.assign(new Error(`Database error during unassignment: ${dbError.message}`), { statusCode: 500 });
            }
        }

    } catch (error) {
        // Catch errors from the initial checks (task/person existence) or the re-thrown 404/500 from the inner try/catch
        console.error(`Error unassigning user ${uId} from task ${tId}:`, error);
        // Ensure statusCode is propagated or default to 500
        if (!error.statusCode) {
            error.statusCode = 500; // Default for unexpected errors
            error.message = `Failed to unassign user from task: ${error.message}`;
        }
        throw error; // Re-throw the error with potentially added statusCode
    }
};


module.exports = {
  listTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  assignUserToTask,
  unassignUserFromTask,
};