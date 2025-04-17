// C:\Apps\Brian\src\api\v1\jobs\service.js
const { Job, Project } = require('../../../models'); // Adjust path as needed
const { Op } = require('sequelize');

const VALID_STATUSES = ['pending', 'in-progress', 'completed', 'archived']; // Added constant

/**
 * Builds the include clause for Sequelize queries based on the 'include' query parameter.
 * @param {string|string[]} includeParam - The 'include' query parameter.
 * @returns {Array} An array of include options for Sequelize.
 */
const buildJobIncludeClause = (includeParam) => {
  const includes = [];
  if (!includeParam) {
    return includes;
  }

  const relations = Array.isArray(includeParam) ? includeParam : includeParam.split(',');

  if (relations.includes('project')) { // Keep checking for 'project' in query param
    includes.push({
      model: Project,
      as: 'ProjectDetails', // Changed alias to match the Job model association
      attributes: ['id', 'name'], // Specify attributes to include for Project
    });
  }

  // Add more relations here if needed in the future

  return includes;
};

/**
 * Lists jobs based on provided query parameters.
 * @param {object} queryParams - Query parameters from the request.
 * @returns {Promise<Array<Job>>} A promise that resolves to an array of jobs.
 */
const listJobs = async (queryParams) => {
  const { include, /* other potential filters like status, projectId, etc. */ } = queryParams;

  const findOptions = {
    include: buildJobIncludeClause(include),
    // Add where clauses based on other queryParams if needed
    // where: { ... build where clause ... }
  };

  try {
    const jobs = await Job.findAll(findOptions);
    return jobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    // Re-throw or handle error appropriately
    throw new Error('Failed to retrieve jobs.');
  }
};

/**
 * Creates a new job.
 * @param {object} data - Job data from the request body.
 * @param {number} userId - The ID of the user creating the job.
 * @returns {Promise<Job>} The created job instance.
 */
const createJob = async (data, userId) => {
  const allowedFields = ['title', 'projectId', 'description', 'status'];
  const receivedFields = Object.keys(data);

  // Reject unknown fields
  const unknownFields = receivedFields.filter(field => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    const error = new Error(`Unknown fields provided: ${unknownFields.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const { title, projectId, description, status = 'pending' } = data; // Default status to 'pending'

  // Required fields check (basic)
  if (!title || !projectId) {
    const error = new Error('Missing required fields: title and projectId are required.');
    error.statusCode = 400;
    throw error;
  }

  // Validate status
  if (status && !VALID_STATUSES.includes(status)) {
    const error = new Error(`Invalid status provided: ${status}. Must be one of ${VALID_STATUSES.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  // Validate projectId existence
  const project = await Project.findByPk(projectId);
  if (!project) {
    const error = new Error(`Project with ID ${projectId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  try {
    const newJob = await Job.create({
      title,
      projectId,
      description,
      status,
      createdBy: userId, // Assuming 'createdBy' field exists
    });
    return newJob;
  } catch (error) {
    console.error('Error creating job:', error);
    // Handle potential Sequelize validation errors or other DB issues
    const err = new Error('Failed to create job.');
    err.statusCode = 500; // Internal Server Error
    // You might want more specific error handling based on Sequelize error types
    if (error.name === 'SequelizeValidationError') {
        err.message = `Validation error: ${error.errors.map(e => e.message).join(', ')}`;
        err.statusCode = 400;
    }
    throw err;
  }
};

/**
 * Updates an existing job.
 * @param {number} id - The ID of the job to update.
 * @param {object} data - Job data from the request body.
 * @returns {Promise<Job>} The updated job instance.
 */
const updateJob = async (id, data) => {
  const job = await Job.findByPk(id);
  if (!job) {
    const error = new Error(`Job with ID ${id} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const allowedUpdateFields = ['title', 'description', 'status'];
  const updateData = {};

  // Filter data to only include allowed fields
  for (const field of allowedUpdateFields) {
    if (data.hasOwnProperty(field)) {
      updateData[field] = data[field];
    }
  }

  // Validate status if provided
  if (updateData.status && !VALID_STATUSES.includes(updateData.status)) {
    const error = new Error(`Invalid status provided: ${updateData.status}. Must be one of ${VALID_STATUSES.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  try {
    await job.update(updateData);
    // Fetch the updated instance again to ensure we return the latest state
    // (some ORMs might not return the fully updated object directly)
    const updatedJob = await Job.findByPk(id);
    return updatedJob;
  } catch (error) {
    console.error(`Error updating job ${id}:`, error);
     // Handle potential Sequelize validation errors or other DB issues
    const err = new Error('Failed to update job.');
    err.statusCode = 500; // Internal Server Error
    if (error.name === 'SequelizeValidationError') {
        err.message = `Validation error: ${error.errors.map(e => e.message).join(', ')}`;
        err.statusCode = 400;
    }
    throw err;
  }
};

/**
 * Deletes a job by its ID.
 * @param {number} id - The ID of the job to delete.
 * @returns {Promise<void>}
 */
const deleteJob = async (id) => {
  const job = await Job.findByPk(id);
  if (!job) {
    const error = new Error(`Job with ID ${id} not found.`);
    error.statusCode = 404;
    throw error;
  }

  try {
    await job.destroy();
    // No return value needed for successful deletion
  } catch (error) {
    console.error(`Error deleting job ${id}:`, error);
    const err = new Error('Failed to delete job.');
    err.statusCode = 500;
    throw err;
  }
};

/**
 * Retrieves a job by its ID.
 * @param {number} id - The ID of the job to retrieve.
 * @param {string|string[]} [includeParam] - Optional include parameter for associations.
 * @returns {Promise<Job>} The job instance.
 */
const getJobById = async (id, includeParam) => {
  const findOptions = {
    include: buildJobIncludeClause(includeParam),
  };

  const job = await Job.findByPk(id, findOptions);
  if (!job) {
    const error = new Error(`Job with ID ${id} not found.`);
    error.statusCode = 404;
    throw error;
  }
  return job;
};


module.exports = {
  listJobs,
  buildJobIncludeClause,
  createJob,
  updateJob,
  deleteJob,
  getJobById,
};