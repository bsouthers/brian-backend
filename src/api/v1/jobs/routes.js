// C:\Apps\Brian\src\api\v1\jobs\routes.js
const express = require('express');
const jobController = require('./controller');
const authenticate = require('../../../middleware/auth'); // Import the middleware function directly

const router = express.Router();

// Define job routes

/**
 * @openapi
 * /jobs:
 *   get:
 *     tags:
 *       - Jobs
 *     summary: Retrieve a list of jobs
 *     description: Returns a list of jobs, with optional filtering and inclusion of related data (e.g., project).
 *     parameters:
 *       - in: query
 *         name: include
 *         schema:
 *           type: string
 *         description: Comma-separated list of associations to include (e.g., project)
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to return for the Job model
 *       # Add other potential filter parameters here (e.g., status, projectId)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by job status
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: integer
 *         description: Filter by associated project ID
 *     responses:
 *       200:
 *         description: A list of jobs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job' # Assuming Job schema defined
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *     security:
 *       - bearerAuth: []
 */
// GET /api/v1/jobs - List all jobs (protected)
router.get('/', authenticate, jobController.listJobs);

// Add other job routes (POST, GET /:id, PUT /:id, DELETE /:id) here if needed in the future

module.exports = router;