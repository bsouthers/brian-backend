// src/api/v1/projects/controller.js
const service = require('./service');
const { handleResponse, handleError } = require('../../../utils/responseHandlers'); // Assuming a utility handler exists
const { validationResult } = require('express-validator'); // For handling validation results

// Controller function to list projects with filtering, sorting, pagination, and field selection
const listProjects = async (req, res) => {
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

    const result = await service.listProjects(options);
    handleResponse(res, result); // Assumes handleResponse formats the output { success: true, data: result }
  } catch (error) {
    handleError(res, error); // Assumes handleError sends appropriate error response
  }
};

// Controller function to get a single project by ID, optionally including related data
const getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { include, fields } = req.query; // Extract include and fields from query

    const options = {
      include,
      fields,
    };

    const project = await service.getProjectById(id, options);
    handleResponse(res, project);
  } catch (error) {
    handleError(res, error);
  }
};

// Controller function to list tasks for a specific project
const listProjectTasks = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit, offset /*, filter, sort, fields */ } = req.query; // Basic pagination

    const options = { limit, offset }; // Add filter/sort/fields later if needed

    const result = await service.listTasksForProject(id, options);
    handleResponse(res, result);
  } catch (error) {
    handleError(res, error);
  }
};

// Controller function to list jobs for a specific project
const listProjectJobs = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit, offset /*, filter, sort, fields */ } = req.query; // Basic pagination

    const options = { limit, offset }; // Add filter/sort/fields later if needed

    const result = await service.listJobsForProject(id, options);
    handleResponse(res, result);
  } catch (error) {
    handleError(res, error);
  }
};

// Controller function to list people assigned to a specific project
const listProjectPeople = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit, offset /*, filter, sort, fields */ } = req.query; // Basic pagination

    const options = { limit, offset }; // Add filter/sort/fields later if needed

    const result = await service.listPeopleForProject(id, options);
    handleResponse(res, result);
  } catch (error) {
    handleError(res, error);
  }
};

// Controller function to create a new project
const createProject = async (req, res) => {
  // 1. Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Format errors for consistent response
    const formattedErrors = errors.array().map(err => ({ field: err.param, message: err.msg }));
    // Use 400 for validation errors
    return handleError(res, { message: 'Validation failed', errors: formattedErrors }, 400);
  }

  // 2. Proceed if validation passes
  try {
    const projectData = req.body;
    const userId = req.user?.id; // Get user ID from authenticated user context
    console.log(`[Controller.createProject] User ID from token: ${userId}`); // Log User ID

    if (!userId) {
        console.error('[Controller.createProject] Authentication error: User ID not found in req.user.');
        // This should ideally not happen if auth middleware is working, but good practice
        return handleError(res, { message: 'Authentication error: User ID not found.' }, 401);
    }

    console.log(`[Controller.createProject] Calling service.createProject with data: ${JSON.stringify(projectData)} and userId: ${userId}`);
    // Pass both project data and the user ID to the service
    const newProject = await service.createProject(projectData, userId);
    console.log(`[Controller.createProject] service.createProject returned: ${newProject ? `Project ID ${newProject.id}` : 'null/undefined'}`); // Log service result
    
    // Use 201 Created status for successful creation
    console.log(`[Controller.createProject] Calling handleResponse with status 201 and project ID: ${newProject?.id}`);
    handleResponse(res, newProject, 201);
  } catch (error) {
    // --- Start Fix 4: Handle FK constraint for status_id ---
    if (error.name === 'SequelizeForeignKeyConstraintError' && error.message.includes('status_id')) {
        // Specific handling for invalid status_id foreign key
        console.error(`[Controller.createProject] Caught FK constraint error for status_id: ${error.message}`);
        return handleError(res, { message: `Invalid Status ID: The provided status_id does not exist.` }, 400);
    }
    // --- End Fix 4 ---

    // Let the generic error handler manage other service/database errors
    console.error(`[Controller.createProject] Caught generic error: ${error.message}`, error.stack); // Log other errors
    handleError(res, error);
  }
};

// Controller function to update an existing project
const updateProject = async (req, res) => {
  // 1. Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.param || 'general', // Use 'general' if param is not specific (e.g., body validation)
      message: err.msg,
    }));
    return handleError(res, { message: 'Validation failed', errors: formattedErrors }, 400);
  }

  // 2. Proceed if validation passes
  try {
    const { id } = req.params;
    const projectData = req.body;

    // Call the service to update the project
    // The service should handle 'not found' errors
    const updatedProject = await service.updateProject(id, projectData);

    // Handle case where service returns null/undefined if project not found (alternative to throwing error)
    // Although the service is expected to throw a specific error for not found
    if (!updatedProject) {
       // This path might not be reached if service throws NotFoundError
      return handleError(res, { message: 'Project not found' }, 404);
    }

    handleResponse(res, updatedProject); // Default 200 OK for updates
  } catch (error) {
    // Let the generic error handler manage service/database errors
    // Including specific errors like NotFoundError from the service
    handleError(res, error);
  }
};

// Controller function to delete a project
const deleteProject = async (req, res) => {
  // 1. Check for validation errors (primarily for the ID format)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.param || 'id', // Assume error is related to 'id' if not specified
      message: err.msg,
    }));
    return handleError(res, { message: 'Validation failed', errors: formattedErrors }, 400);
  }

  // 2. Proceed if validation passes
  try {
    const { id } = req.params;

    // Call the service to delete the project
    // The service handles 'not found' and 'conflict' (dependency) errors
    const result = await service.deleteProject(id); // Service returns { deleted: true } on success

    // Use 204 No Content for successful DELETE operations as per REST standards
    res.status(204).send();

  } catch (error) {
    // Let the generic error handler manage service/database errors
    // Including specific errors like NotFoundError or ConflictError from the service
    handleError(res, error);
  }
};

module.exports = {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject, // Export the new delete function
  listProjectTasks,
  listProjectJobs,
  listProjectPeople,
};