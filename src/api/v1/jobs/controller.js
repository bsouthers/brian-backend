// src/api/v1/jobs/controller.js
const { handleResponse, handleError } = require('../../../utils/responseHandlers');
const jobService = require('./service'); // now use the real names that service.js exports

/**
 * Creates a new job.
 * Handles POST /api/v1/jobs
 */
const createJob = async (req, res) => {
  try {
    // Assuming validation is done in routes/middleware
    const jobData = req.body;
    const userId = req.user?.id; // Assuming user ID is available on req.user (optional chaining for safety)
    const newJob = await jobService.createJob(jobData, userId);
    handleResponse(res, newJob, 201);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Retrieves a job by its ID.
 * Handles GET /api/v1/jobs/:id
 */
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await jobService.getJobById(id, req.query.include);
    if (!job) {
      // Handle case where job is not found by the service
      return handleError(res, { statusCode: 404, message: 'Job not found' });
    }
    handleResponse(res, job);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Updates an existing job.
 * Handles PUT /api/v1/jobs/:id
 */
const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user?.id; // Assuming user ID for authorization/logging
    const updatedJob = await jobService.updateJob(id, updateData, userId);
     if (!updatedJob) {
       // Handle case where job to update is not found by the service
       return handleError(res, { statusCode: 404, message: 'Job not found for update' });
     }
    handleResponse(res, updatedJob);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Deletes a job by its ID.
 * Handles DELETE /api/v1/jobs/:id
 */
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id; // Assuming user ID for authorization/logging
    await jobService.deleteJob(id);
    res.status(204).send(); // No-content response
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Lists all jobs, potentially with filtering/pagination.
 * Handles GET /api/v1/jobs
 */
const listJobs = async (req, res) => {
  try {
    // Add query parameter handling if needed (e.g., req.query for pagination/filtering)
    const jobs = await jobService.listJobs(req.query); // Pass query params to service
    handleResponse(res, jobs); // default 200
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  createJob,
  getJobById,
  updateJob,
  deleteJob,
  listJobs,
};