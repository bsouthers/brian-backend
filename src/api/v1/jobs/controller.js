// C:\Apps\Brian\src\api\v1\jobs\controller.js
const jobService = require('./service');
// Removed incorrect asyncHandler import
// const { asyncHandler } = require('../../../middleware/error-handler');

// GET /api/v1/jobs
const listJobs = async (req, res, next) => { // Added next parameter
  try {
    // Pass query parameters to the service layer
    const jobs = await jobService.listJobs(req.query);
    // Use standard success response handler if available, otherwise send directly
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    // Pass error to the global error handler
    next(error);
  }
};

module.exports = {
  listJobs,
};