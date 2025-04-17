// src/api/v1/tasks/controller.js
const service = require('./service');
const { handleResponse, handleError } = require('../../../utils/responseHandlers'); // Assuming utility handler exists
// const { validationResult } = require('express-validator'); // Validation handled in routes/middleware later

// Controller function to list tasks with filtering, sorting, pagination
const listTasks = async (req, res) => {
  try {
    // Extract query parameters
    const { limit, offset, sort, fields, ...filterParams } = req.query;

    const options = {
      limit,
      offset,
      sort,
      fields,
      filter: filterParams, // Pass remaining query params as filters
    };

    const result = await service.listTasks(options);
    handleResponse(res, result);
  } catch (error) {
    handleError(res, error);
  }
};

// Controller function to get a single task by ID, optionally including related data
const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const { include, fields } = req.query; // Extract include and fields from query

    const options = {
      include,
      fields,
    };

    const task = await service.getTaskById(id, options);
    handleResponse(res, task);
  } catch (error) {
    handleError(res, error);
  }
};

// Controller function to create a new task
const createTask = async (req, res) => {
  // Validation errors would be checked here via middleware in a real scenario
  // const errors = validationResult(req);
  // if (!errors.isEmpty()) { ... }

  try {
    const taskData = req.body;
    const creatorUserId = req.user?.id; // Use id (PK) from the authenticated user object

    // Basic check, though auth middleware should guarantee this
    if (!creatorUserId) {
        return handleError(res, { message: 'Authentication error: User ID (employee_id) not found.' }, 401);
    }

    // Pass task data and creator user ID to the service
    const newTask = await service.createTask(taskData, creatorUserId);
    // console.log('[Controller:createTask] Service call successful. newTask object:', JSON.stringify(newTask, null, 2)); // Removed log

    // Use 201 Created status for successful creation
    // Explicitly call toJSON() before passing to handleResponse
    handleResponse(res, newTask ? newTask.toJSON() : null, 201);
  } catch (error) {
    // Add detailed logging for debugging
    console.error('Controller createTask Catch:', {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack
    });
    // Explicitly pass the status code from the error object to handleError
    handleError(res, error, error.statusCode || 500);
  }
};

// Controller function to update an existing task
const updateTask = async (req, res) => {
  // Validation errors check
  // const errors = validationResult(req);
  // if (!errors.isEmpty()) { ... }

  try {
    const { id } = req.params;
    const taskData = req.body;
    const modifierUserId = req.user?.id; // User performing the update

    if (!modifierUserId) {
        return handleError(res, { message: 'Authentication error: User ID (employee_id) not found.' }, 401);
    }

    // Call the service to update the task
    const updatedTask = await service.updateTask(id, taskData, modifierUserId);

    // Service should throw NotFoundError if task doesn't exist
    // Explicitly call toJSON() before passing to handleResponse
    handleResponse(res, updatedTask ? updatedTask.toJSON() : null); // Default 200 OK for updates
  } catch (error) {
    // Add detailed logging for debugging
    console.error('Controller updateTask Catch:', {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack
    });
    // Explicitly pass the status code from the error object to handleError
    handleError(res, error, error.statusCode || 500);
  }
};

// Controller function to delete a task
const deleteTask = async (req, res) => {
  // Validation errors check (e.g., for ID format)
  // const errors = validationResult(req);
  // if (!errors.isEmpty()) { ... }

  try {
    const { id } = req.params;

    // Call the service to delete the task
    // Service handles 'not found' errors
    await service.deleteTask(id);

    // Use 204 No Content for successful DELETE operations
    res.status(204).send();
  } catch (error) {
    // Add detailed logging for debugging
    console.error('Controller deleteTask Catch:', {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack
    });
    // Explicitly pass the status code from the error object to handleError
    handleError(res, error, error.statusCode || 500);
  }
};

// Controller function to assign a user to a task
const assignUserToTask = async (req, res) => {
  try {
    const { id } = req.params; // Task ID from route params
    const { user_id } = req.body; // User ID from request body
    const assignerId = req.user?.id; // User performing the assignment

    if (!assignerId) {
        return handleError(res, { message: 'Authentication error: User ID (employee_id) not found.' }, 401);
    }

    if (!user_id) {
        return handleError(res, { message: 'User ID is required for assignment' }, 400);
    }

    // Call the service to handle the assignment logic
    const { assignment, created } = await service.assignUserToTask(id, user_id, assignerId);

    if (created) {
      // Newly created assignment
      handleResponse(res, assignment, 201); // 201 Created
    } else {
      // Assignment already existed - Conflict
      // Use handleError or a specific response for conflict
      handleError(res, { message: `User ${user_id} is already assigned to task ${id}.` }, 409); // 409 Conflict
    }
  } catch (error) {
    // Let handleError manage other errors (like 404s from service)
    handleError(res, error);
  }
};

// Controller function to unassign a user from a task
const unassignUserFromTask = async (req, res) => {
  try {
    const { id, userId } = req.params; // Both IDs from route params
    const unassignerId = req.user?.id; // User performing the unassignment

    if (!unassignerId) {
        return handleError(res, { message: 'Authentication error: User ID (employee_id) not found.' }, 401);
    }

    // Call the service to handle the unassignment logic
    await service.unassignUserFromTask(id, userId, unassignerId);

    // Use 204 No Content for successful unassignment
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
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