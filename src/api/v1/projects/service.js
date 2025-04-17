// src/api/v1/projects/service.js
const { Project, Task, Job, Person, ProjectAssignment, Address, Status } = require('../../../models'); // Added Address, Status (Status was missing in original require but used later)
const { Op } = require('sequelize'); // For advanced filtering

// Helper function to build the where clause for filtering
const buildWhereClause = (filter = {}) => {
  const where = {};
  if (filter.name) {
    // Case-insensitive search for name
    where.name = { [Op.iLike]: `%${filter.name}%` };
  }
  if (filter.status_id) {
    // Allow filtering by multiple statuses if provided as comma-separated string or array
    const statusIds = typeof filter.status_id === 'string' ? filter.status_id.split(',') : filter.status_id;
    if (Array.isArray(statusIds) && statusIds.length > 0) {
       where.status_id = { [Op.in]: statusIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) };
    } else if (!isNaN(parseInt(filter.status_id, 10))) {
       where.status_id = parseInt(filter.status_id, 10);
    }
  }
  if (filter.project_open !== undefined) {
    // Ensure boolean conversion handles strings 'true'/'false'
    where.project_open = String(filter.project_open).toLowerCase() === 'true';
  }
  if (filter.archived !== undefined) {
     // Ensure boolean conversion handles strings 'true'/'false'
    where.archived = String(filter.archived).toLowerCase() === 'true';
  }
  if (filter.company_id) {
    where.company_id = parseInt(filter.company_id, 10);
  }
   if (filter.contract_id) {
    where.contract_id = parseInt(filter.contract_id, 10);
  }
  if (filter.created_by_user_id) {
    where.created_by_user_id = parseInt(filter.created_by_user_id, 10);
  }
  if (filter.project_category_id) {
    where.project_category_id = parseInt(filter.project_category_id, 10);
  }
  if (filter.customer_name_id) {
    where.customer_name_id = parseInt(filter.customer_name_id, 10);
  }
  if (filter.product_category_id) {
    where.product_category_id = parseInt(filter.product_category_id, 10);
  }

  // Date range filters - ensure valid dates before applying
  const parseDate = (dateStr) => {
      // Handle both Date objects and string representations
      if (dateStr instanceof Date) return dateStr;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
  }

  const applyDateRangeFilter = (field, from, to) => {
      const dateFrom = parseDate(from);
      const dateTo = parseDate(to);
      // Add time component to 'to' date to make it inclusive of the end day
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
  applyDateRangeFilter('closed_at', filter.closed_from, filter.closed_to);
  applyDateRangeFilter('modified_at', filter.modified_from, filter.modified_to);

  // Add more filters as needed based on Project model fields

  return where;
};

// Helper function to build the order clause for sorting
const buildOrderClause = (sort) => {
  // Expects sort to be a comma-separated string, e.g., "name:asc,createdAt:desc"
  // Default sort order
  if (!sort) {
    return [['created_at', 'DESC']];
  }

  const order = [];
  const sortFields = sort.split(',');
  // Define allowed fields based on the Project model
  const allowedSortFields = Object.keys(Project.rawAttributes);

  sortFields.forEach(field => {
    const [fieldName, direction = 'asc'] = field.trim().split(':');
    const lowerDirection = direction.toLowerCase();
    // Use underscored field name if model uses underscored: true
    const actualFieldName = Project.options.underscored ? fieldName : fieldName; // Adjust if needed based on model config

    if (allowedSortFields.includes(actualFieldName) && ['asc', 'desc'].includes(lowerDirection)) {
      order.push([actualFieldName, lowerDirection.toUpperCase()]);
    } else {
      console.warn(`Invalid sort field or direction ignored: ${field}`);
    }
  });

  // Add default sort if no valid fields were provided or if the array is empty
  if (order.length === 0) {
      order.push(['created_at', 'DESC']);
  }

  return order;
};

// Helper function to build the attributes clause for field selection
const buildAttributesClause = (fields) => {
  // Expects fields to be a comma-separated string or an array
  if (!fields) {
    return null; // Return all fields if not specified
  }
  const fieldList = typeof fields === 'string' ? fields.split(',') : fields;
  const allowedFields = Object.keys(Project.rawAttributes);
  // Filter requested fields against allowed fields
  const validFields = fieldList.map(f => f.trim()).filter(f => allowedFields.includes(f));

  if (validFields.length === 0) {
      console.warn('No valid fields requested for selection, returning default fields.');
      return null; // Return default fields if no valid ones are provided
  }
  // Ensure primary key 'id' is always included if specific fields are requested
  if (!validFields.includes('id')) {
      validFields.push('id');
  }
  return validFields;
};


// Service function to list projects with pagination, filtering, sorting, and field selection
const listProjects = async (options = {}) => {
  const { limit = 10, offset = 0, filter = {}, sort, fields, include } = options; // Added 'include'

  // Ensure limit and offset are numbers and within reasonable bounds
  const effectiveLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100); // Min 1, Max 100, Default 10
  const effectiveOffset = Math.max(0, parseInt(offset, 10) || 0); // Min 0, Default 0

  const whereClause = buildWhereClause(filter);
  const orderClause = buildOrderClause(sort);
  const attributesClause = buildAttributesClause(fields);
  const includeClause = buildIncludeClause(include); // Build include clause

  const queryOptions = {
    where: whereClause,
    order: orderClause,
    include: includeClause, // Add include clause to query options
    limit: effectiveLimit,
    offset: effectiveOffset,
    distinct: includeClause.length > 0, // Add distinct if includes are present to avoid duplicate parent rows
  };

  if (attributesClause) {
    queryOptions.attributes = attributesClause;
  }

  try {
    console.log('Executing Project.findAndCountAll with options:', JSON.stringify(queryOptions, null, 2));
    const { count, rows } = await Project.findAndCountAll(queryOptions);
    // Note: `count` might be inaccurate with `group` or complex `include`s without subqueries.
    // Consider alternative counting methods if needed.
    return { total: count, limit: effectiveLimit, offset: effectiveOffset, projects: rows };
  } catch (error) {
    console.error('Error fetching projects:', error);
    // Re-throw the error to be handled by the controller
    throw new Error(`Failed to retrieve projects: ${error.message}`);
  }
};

// Helper function to build the include clause for eager loading associations
const buildIncludeClause = (includeParam) => {
  if (!includeParam) {
    return [];
  }

  const requestedIncludes = typeof includeParam === 'string' ? includeParam.split(',') : includeParam;
  const includeClause = [];

  // Map requested include names to Sequelize model and alias
  const includeMap = {
    tasks: { model: Task, as: 'Tasks' },
    jobs: { model: Job, as: 'Jobs' },
    people: { model: Person, as: 'AssignedPeople', through: { attributes: [] } }, // Exclude junction table attributes
    status: { model: Status, as: 'Status' }, // Assuming Status model is imported and associated
    creator: { model: Person, as: 'Creator' }, // Assuming Person model is imported and associated
    modifier: { model: Person, as: 'Modifier' }, // Assuming Person model is imported and associated
    address: { model: Address, as: 'address' } // Added Address include (assuming 'address' alias)
    // Add other potential includes here
  };

  requestedIncludes.forEach(inc => {
    const key = inc.trim().toLowerCase();
    if (includeMap[key]) {
      includeClause.push(includeMap[key]);
    } else {
      console.warn(`Invalid include parameter ignored: ${inc}`);
    }
  });

  return includeClause;
};


// Service function to get a single project by ID with optional related data
const getProjectById = async (id, options = {}) => {
  const { include, fields } = options;
  const projectId = parseInt(id, 10);

  if (isNaN(projectId)) {
      throw new Error('Invalid project ID provided.'); // Or a custom validation error
  }

  const includeClause = buildIncludeClause(include);
  const attributesClause = buildAttributesClause(fields);

  const queryOptions = {
      include: includeClause,
  };

  if (attributesClause) {
      queryOptions.attributes = attributesClause;
  }

  try {
      console.log(`Executing Project.findByPk for ID: ${projectId} with options:`, JSON.stringify(queryOptions, null, 2));
      const project = await Project.findByPk(projectId, queryOptions);

      if (!project) {
          // Use a more specific error type if available (e.g., NotFoundError)
          const error = new Error(`Project with ID ${projectId} not found.`);
          error.statusCode = 404; // Attach status code for the controller
          throw error;
      }

      return project;
  } catch (error) {
      console.error(`Error fetching project with ID ${projectId}:`, error);
      // Re-throw the error, potentially enriching it
      if (!error.statusCode) { // Keep original status code if already set (like 404)
          error.message = `Failed to retrieve project with ID ${projectId}: ${error.message}`;
      }
      throw error;
  }
};

// Service function to list tasks associated with a specific project
const listTasksForProject = async (projectId, options = {}) => {
  const { limit = 10, offset = 0 /*, filter = {}, sort, fields */ } = options; // Basic pagination, add filter/sort/fields later if needed
  const projId = parseInt(projectId, 10);

  if (isNaN(projId)) {
      throw new Error('Invalid project ID provided.');
  }

  // Ensure project exists first (optional, but good practice)
  const projectExists = await Project.count({ where: { id: projId } });
  if (projectExists === 0) {
      const error = new Error(`Project with ID ${projId} not found.`);
      error.statusCode = 404;
      throw error;
  }

  // Basic pagination
  const effectiveLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  const effectiveOffset = Math.max(0, parseInt(offset, 10) || 0);

  // TODO: Add filtering, sorting, field selection for Tasks if required
  const queryOptions = {
      where: { project_id: projId },
      limit: effectiveLimit,
      offset: effectiveOffset,
      // order: buildOrderClauseForTasks(sort), // Example for future enhancement
      // attributes: buildAttributesClauseForTasks(fields), // Example for future enhancement
  };

  try {
      console.log(`Executing Task.findAndCountAll for Project ID: ${projId} with options:`, JSON.stringify(queryOptions, null, 2));
      const { count, rows } = await Task.findAndCountAll(queryOptions);
      return { total: count, limit: effectiveLimit, offset: effectiveOffset, tasks: rows };
  } catch (error) {
      console.error(`Error fetching tasks for project ID ${projId}:`, error);
      throw new Error(`Failed to retrieve tasks for project ID ${projId}: ${error.message}`);
  }
};

// Service function to list jobs associated with a specific project
const listJobsForProject = async (projectId, options = {}) => {
  const { limit = 10, offset = 0 /*, filter = {}, sort, fields */ } = options; // Basic pagination
  const projId = parseInt(projectId, 10);

  if (isNaN(projId)) {
      throw new Error('Invalid project ID provided.');
  }

  // Ensure project exists
  const projectExists = await Project.count({ where: { id: projId } });
  if (projectExists === 0) {
      const error = new Error(`Project with ID ${projId} not found.`);
      error.statusCode = 404;
      throw error;
  }

  // Basic pagination (declarations moved down)

  // NOTE: The current 'jobs' table schema does not have a 'project_id'.
  // Therefore, we cannot directly query jobs associated with a specific project via this field.
  // Returning an empty list to satisfy the endpoint contract for now.
  // TODO: Re-evaluate the Project-Job relationship and this endpoint's purpose if needed.
  const effectiveLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  const effectiveOffset = Math.max(0, parseInt(offset, 10) || 0);

  try {
      // Since there's no direct link, return empty results for this specific project ID.
      console.log(`Skipping Job.findAndCountAll for Project ID ${projId} as 'jobs' table lacks 'project_id'. Returning empty list.`);
      return { total: 0, limit: effectiveLimit, offset: effectiveOffset, jobs: [] };
  } catch (error) {
      // This catch block might not be strictly necessary anymore, but kept for safety.
      console.error(`Unexpected error in listJobsForProject for project ID ${projId}:`, error);
      throw new Error(`Failed to process job list request for project ID ${projId}: ${error.message}`);
  }
};

// Service function to list people assigned to a specific project
const listPeopleForProject = async (projectId, options = {}) => {
    const { limit = 10, offset = 0 /*, filter = {}, sort, fields */ } = options; // Basic pagination
    const projId = parseInt(projectId, 10);

    if (isNaN(projId)) {
        throw new Error('Invalid project ID provided.');
    }

    // Ensure project exists (check before complex query)
    const projectExists = await Project.count({ where: { id: projId } });
    if (projectExists === 0) {
        const error = new Error(`Project with ID ${projId} not found.`);
        error.statusCode = 404;
        throw error;
    }

    try {
        // Basic pagination variables
        const effectiveLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
        const effectiveOffset = Math.max(0, parseInt(offset, 10) || 0);

        // Debugging: Log the query we're about to make
        console.log(`Querying ProjectAssignment for project_id: ${projId}`);
        
        // Step 1: Fetch associated user IDs from the join table
        const assignments = await ProjectAssignment.findAll({
            where: { project_id: projId },
            attributes: ['user_id'],
            raw: true,
        });

        console.log(`Found ${assignments.length} assignments for project ID ${projId}`);
        
        // Map the user IDs
        const userIds = assignments.map(a => a.user_id);
        console.log(`Extracted user IDs: [${userIds.join(', ')}]`);

        // Step 2: Fetch the actual Person records using the retrieved IDs, with pagination
        let people = [];
        let totalCount = 0;

        if (userIds.length > 0) {
            const peopleQueryOptions = {
                where: {
                    employee_id: { [Op.in]: userIds }
                },
                limit: effectiveLimit,
                offset: effectiveOffset,
            };
            
            console.log(`Executing Person.findAndCountAll for User IDs: [${userIds.join(',')}] with options:`,
                JSON.stringify(peopleQueryOptions, null, 2));
                
            const result = await Person.findAndCountAll(peopleQueryOptions);
            people = result.rows;
            totalCount = result.count;
            
            console.log(`Found ${people.length} people records for the assigned user IDs`);
        } else {
            console.log(`No people assigned to project ID ${projId}. Skipping Person query.`);
        }

        return {
            total: totalCount,
            limit: effectiveLimit,
            offset: effectiveOffset,
            people: people
        };
    } catch (error) {
        console.error(`Error fetching people for project ID ${projId}:`, error);
        
        // Provide more context for specific errors
        if (error.message.includes('does not exist')) {
            console.error("Potential cause: Model definition mismatch, association key error, or incorrect alias.");
        }
        
        throw new Error(`Failed to retrieve people for project ID ${projId}: ${error.message}`);
    }
};

// --- Helper function placeholders (to be implemented) ---
// function buildWhereClause(filter) { ... }
// function buildIncludeClause(include) { ... }

// Service function to create a new project
const createProject = async (projectData, userId) => { // Accept userId as argument
  try {
    // Ensure only allowed fields from the model are used for creation
    // This prevents accidentally trying to set fields that don't exist
    // or are auto-generated (like id, created_at, modified_at)
    // Include status_id and other relevant fields from the model definition
    const allowedFields = [
        'name', 'clickup_space_id', 'clickup_id', 'status_id',
        'project_open', 'archived', 'company_id', 'contract_id',
        'project_category_id', 'customer_name_id', 'product_category_id',
        'start_date', 'due_date', 'closed_at', 'description', 'notes'
        // Add other mutable fields from the Project model as necessary
        // Exclude: id, created_at, modified_at, created_by_user_id (set explicitly below)
    ];
    const dataToCreate = {};
    allowedFields.forEach(field => {
      // Check if the field exists in the input data (null is a valid value to set)
      if (projectData.hasOwnProperty(field)) {
        dataToCreate[field] = projectData[field];
      }
    });

    // Explicitly set the creator ID
    dataToCreate.created_by_user_id = userId;

    // Validate foreign keys before creation (e.g., status_id)
    if (dataToCreate.hasOwnProperty('status_id') && dataToCreate.status_id !== null) {
        // Need to import Status model at the top of the file if not already done
        const { Status } = require('../../../models'); // Ensure Status is imported
        const statusExists = await Status.findByPk(dataToCreate.status_id);
        
        if (!statusExists) {
            const error = new Error(`Invalid Status ID provided: ${dataToCreate.status_id}`);
            error.statusCode = 400; // Bad Request
            throw error;
        }
    }
    // Add similar checks for other foreign keys if needed (company_id, etc.)

    // Create the project
    const newProject = await Project.create(dataToCreate);
    return newProject;
  } catch (error) {
    // If the error already has a statusCode, just rethrow it
    if (error.statusCode) {
        throw error;
    }
    
    // Check for specific Sequelize errors (like unique constraint)
    if (error.name === 'SequelizeUniqueConstraintError') {
      // Extract field information if possible (might vary based on DB/Sequelize version)
      const fields = error.fields ? Object.keys(error.fields).join(', ') : 'unique field';
      const specificError = new Error(`A project with the provided ${fields} already exists.`);
      specificError.statusCode = 409; // Conflict
      throw specificError;
    }
    
    // Re-throw a generic error for other issues with a statusCode
    const genericError = new Error(`Failed to create project: ${error.message}`);
    genericError.statusCode = 500; // Internal Server Error
    throw genericError;
  }
};

// Service function to update an existing project
const updateProject = async (id, projectData) => {
  const projectId = parseInt(id, 10);

  if (isNaN(projectId)) {
    // Use a specific error type or attach status code
    const error = new Error('Invalid project ID provided.');
    error.statusCode = 400; // Bad Request
    throw error;
  }

  try {
    // 1. Find the project first
    const project = await Project.findByPk(projectId);

    if (!project) {
      const error = new Error(`Project with ID ${projectId} not found.`);
      error.statusCode = 404; // Not Found
      throw error;
    }

    // 2. Define allowed fields for update (exclude immutable fields like id, created_at)
    //    Based on common practice and fields seen in filtering/creation.
    //    Adjust according to the actual Project model definition if needed.
    const allowedUpdateFields = [
        'name', 'clickup_space_id', 'clickup_id', 'status_id',
        'project_open', 'archived', 'company_id', 'contract_id',
        'project_category_id', 'customer_name_id', 'product_category_id',
        'start_date', 'due_date', 'closed_at', 'description', 'notes',
        // Add other mutable fields from the Project model as necessary
        // Exclude: id, created_at, modified_at, created_by_user_id (usually not updated directly here)
    ];
    const dataToUpdate = {};
    allowedUpdateFields.forEach(field => {
      // Check if the field exists in the input data (null is a valid value to set)
      if (projectData.hasOwnProperty(field)) {
        dataToUpdate[field] = projectData[field];
      }
    });

    // Check if there's anything actually to update
    if (Object.keys(dataToUpdate).length === 0) {
        console.log(`No valid fields provided for update on project ID ${projectId}. Returning existing project.`);
        // Return the unmodified project if no valid fields were passed
        return project;
    }

    console.log(`Attempting to update project ID ${projectId} with data:`, JSON.stringify(dataToUpdate, null, 2));

    // 3. Validate foreign keys before update (e.g., status_id)
    if (dataToUpdate.hasOwnProperty('status_id') && dataToUpdate.status_id !== null) {
        // Need to import Status model at the top of the file if not already done
        const { Status } = require('../../../models'); // Ensure Status is imported
        const statusExists = await Status.findByPk(dataToUpdate.status_id);
        if (!statusExists) {
            const error = new Error(`Invalid Status ID provided: ${dataToUpdate.status_id}`);
            error.statusCode = 400; // Bad Request
            throw error;
        }
    }
    // Add similar checks for other foreign keys if needed (company_id, etc.)


    // 4. Update the project instance
    // The 'update' method automatically handles setting 'modified_at' if timestamps are enabled
    await project.update(dataToUpdate); // Update the instance

    console.log(`Project ID ${projectId} updated successfully.`);
    // Reload the instance to get the latest data from the DB, including any default values or triggers
    await project.reload();
    // Add logging to inspect the reloaded project object
    console.log(`Reloaded project object before return (ID: ${projectId}):`, JSON.stringify(project, null, 2));
    return project; // Return the reloaded instance

  } catch (error) {
    console.error(`Error updating project with ID ${projectId}:`, error);
    // Re-throw the error, preserving status code if already set (like 404, 400)
    if (!error.statusCode) {
      // Check for specific DB errors like unique constraints if applicable during update
      if (error.name === 'SequelizeUniqueConstraintError') {
          const fields = error.fields ? Object.keys(error.fields).join(', ') : 'unique field';
          error.message = `Update failed: A project with the provided ${fields} already exists.`;
          error.statusCode = 409; // Conflict
      } else {
          error.message = `Failed to update project with ID ${projectId}: ${error.message}`;
          // Keep default 500 or let controller handle generic errors
      }
    }
    throw error;
  }
};

// Service function to delete a project
const deleteProject = async (id) => {
  const projectId = parseInt(id, 10);

  if (isNaN(projectId)) {
    const error = new Error('Invalid project ID provided.');
    error.statusCode = 400; // Bad Request
    throw error;
  }

  try {
    // 1. Find the project
    const project = await Project.findByPk(projectId);

    if (!project) {
      const error = new Error(`Project with ID ${projectId} not found.`);
      error.statusCode = 404; // Not Found
      throw error;
    }

    // 2. Check for dependencies (e.g., active tasks or assignments)
    // Check for associated tasks
    const taskCount = await Task.count({ where: { project_id: projectId } });
    if (taskCount > 0) {
      const error = new Error(`Cannot delete project ID ${projectId}: It has ${taskCount} associated task(s). Please resolve or reassign them first.`);
      error.statusCode = 409; // Conflict
      throw error;
    }

    // Check for assigned people via ProjectAssignment
    const assignmentCount = await ProjectAssignment.count({ where: { project_id: projectId } });
    if (assignmentCount > 0) {
      const error = new Error(`Cannot delete project ID ${projectId}: It has ${assignmentCount} assigned person(s). Please unassign them first.`);
      error.statusCode = 409; // Conflict
      throw error;
    }

    // Add checks for other potential dependencies (e.g., related Jobs if the relationship existed) here

    // 3. Delete the project if no dependencies found
    console.log(`Attempting to delete project ID ${projectId}...`);
    const deletedRowCount = await project.destroy(); // Sequelize destroy instance method

    if (deletedRowCount === 0) {
        // This case should theoretically not happen if findByPk succeeded, but good for safety
        console.warn(`Project ID ${projectId} was found but deletion returned 0 rows affected.`);
        const error = new Error(`Failed to delete project ID ${projectId}. Project might have been deleted by another process.`);
        error.statusCode = 404; // Or potentially 500 if unexpected
        throw error;
    }

    console.log(`Project ID ${projectId} deleted successfully.`);
    // Return a simple success indicator, the controller will format the final response
    return { deleted: true };

  } catch (error) {
    console.error(`Error deleting project with ID ${projectId}:`, error);
    // Re-throw the error, preserving status code if already set (404, 400, 409)
    if (!error.statusCode) {
      error.message = `Failed to delete project with ID ${projectId}: ${error.message}`;
      // Keep default 500 or let controller handle generic errors
    }
    throw error;
  }
};


module.exports = {
  listProjects,
  getProjectById,
  createProject,
  updateProject, // Export the new update function
  deleteProject, // Export the new delete function
  listTasksForProject,
  listJobsForProject,
  listPeopleForProject,
};