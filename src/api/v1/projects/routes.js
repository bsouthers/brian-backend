// src/api/v1/projects/routes.js
const express = require('express');
const { query, param, body, validationResult } = require('express-validator'); // Import body for POST validation
const controller = require('./controller');
const authenticateToken = require('../../../middleware/auth'); // Import authentication middleware
const { handleError } = require('../../../utils/responseHandlers'); // Import CORRECT error response handler

const router = express.Router();

// Middleware to handle validation errors using the new helper
const firstErrMsg = require('../../../middleware/validationMessage'); // Path adjusted from src/api/v1/projects/

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(firstErrMsg(errors.array())); // ← field‑specific message
    err.statusCode = 400;
    err.errors = errors.array();                         // keep full details
    return next(err); // Pass to the central error handler
  }
  next();
};

// Common validation rules
const paginationValidation = [
  query('limit').optional().isInt({ min: 0 }).withMessage('Invalid limit'), // Match test regex
  query('offset').optional().isInt({ min: 0 }).withMessage('Invalid offset'), // Match test regex
];

const projectListFilterSortValidation = [
  query('status_id').optional().isInt().withMessage('Invalid filter value'), // Match test regex
  query('sort').optional().isString().isIn(['name', 'created_at', 'updated_at']).withMessage('Invalid sort field'), // Match test regex
  query('order').optional().isString().isIn(['asc', 'desc']).withMessage('Invalid sort order'), // Match test regex
];

const projectIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid project ID'), // Match test regex
];

// Validation rules for POST /projects
const createProjectValidation = [
  body('name').notEmpty().withMessage('Project name is required').isString().withMessage('Project name must be a string'),
  // Make clickup fields required as per test expectations and likely DB constraints
  body('clickup_space_id').notEmpty().withMessage('ClickUp Space ID is required').isString().withMessage('ClickUp Space ID must be a string'),
  body('clickup_id').notEmpty().withMessage('ClickUp ID is required').isString().withMessage('ClickUp ID must be a string'),
  // Add validation for status_id (assuming it's required for creation)
  body('status_id').notEmpty().withMessage('Status ID is required').isInt({ min: 1 }).withMessage('Invalid Status ID'),
];

// Validation rules for PUT /projects/:id
const updateProjectValidation = [
  // ID validation is handled separately by projectIdValidation
  // Body fields are optional for PUT, only validate if present
  body('name').optional().isString().notEmpty().withMessage('Project name cannot be empty if provided'),
  body('clickup_space_id').optional({ nullable: true }).isString().withMessage('ClickUp Space ID must be a string'),
  body('clickup_id').optional({ nullable: true }).isString().withMessage('ClickUp ID must be a string'),
  body('status_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid Status ID'),
  body('project_open').optional().isBoolean().withMessage('Project Open must be a boolean'),
  body('archived').optional().isBoolean().withMessage('Archived must be a boolean'),
  body('company_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid Company ID'),
  body('contract_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid Contract ID'),
  body('project_category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid Project Category ID'),
  body('customer_name_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid Customer Name ID'),
  body('product_category_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Invalid Product Category ID'),
  body('start_date').optional({ nullable: true }).isISO8601().toDate().withMessage('Invalid Start Date format (YYYY-MM-DD)'),
  body('due_date').optional({ nullable: true }).isISO8601().toDate().withMessage('Invalid Due Date format (YYYY-MM-DD)'),
  body('closed_at').optional({ nullable: true }).isISO8601().toDate().withMessage('Invalid Closed At date format (YYYY-MM-DD)'),
  body('description').optional({ nullable: true }).isString().withMessage('Description must be a string'),
  body('notes').optional({ nullable: true }).isString().withMessage('Notes must be a string'),
  // Add other updatable fields from the model here with appropriate validation
];


// Apply authentication middleware to all routes in this router
router.use(authenticateToken);

// Define project routes with validation

/**
 * @openapi
 * /projects:
 *   get:
 *     tags:
 *       - Projects
 *     summary: Retrieve a list of projects
 *     description: Returns a paginated list of projects, with optional filtering and sorting.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of projects to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of projects to skip
 *       - in: query
 *         name: include
 *         schema:
 *           type: string
 *         description: Comma-separated list of associations to include (e.g., tasks, jobs, people, status, creator, modifier, address)
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to return
 *       # Add other filter/sort parameters here as needed based on buildWhereClause/buildOrderClause
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by project name (case-insensitive, partial match)
 *       - in: query
 *         name: status_id
 *         schema:
 *           type: integer
 *         description: Filter by status ID
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field and direction (e.g., name:asc, created_at:desc)
 *     responses:
 *       200:
 *         description: A list of projects.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     projects:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Project' # Assuming a Project schema is defined elsewhere or will be generated
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/',
    paginationValidation,
    projectListFilterSortValidation,
    handleValidationErrors,
    controller.listProjects
);

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     tags:
 *       - Projects
 *     summary: Retrieve a single project by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the project to retrieve
 *       - in: query
 *         name: include
 *         schema:
 *           type: string
 *         description: Comma-separated list of associations to include (e.g., tasks, jobs, people, status, creator, modifier, address)
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to return
 *     responses:
 *       200:
 *         description: Project details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid project ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id',
    projectIdValidation,
    handleValidationErrors,
    controller.getProject
);

/**
 * @openapi
 * /projects/{id}/tasks:
 *   get:
 *     tags:
 *       - Projects
 *       - Tasks
 *     summary: Retrieve tasks associated with a specific project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the project whose tasks to retrieve
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of tasks to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of tasks to skip
 *     responses:
 *       200:
 *         description: A list of tasks for the project.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     tasks:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Task' # Assuming Task schema defined
 *       400:
 *         description: Invalid project ID or query parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id/tasks',
    projectIdValidation,
    paginationValidation, // Apply pagination validation
    handleValidationErrors,
    controller.listProjectTasks
);
router.get(
    '/:id/jobs',
    projectIdValidation,
    paginationValidation, // Apply pagination validation
    handleValidationErrors,
    controller.listProjectJobs
);
router.get(
    '/:id/people',
    projectIdValidation,
    paginationValidation, // Apply pagination validation
    handleValidationErrors,
    controller.listProjectPeople
);

// POST / - Create a new project
/**
 * @openapi
 * /projects:
 *   post:
 *     tags:
 *       - Projects
 *     summary: Create a new project
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - clickup_space_id
 *               - clickup_id
 *               - status_id
 *             properties:
 *               name:
 *                 type: string
 *                 example: New Website Build
 *               clickup_space_id:
 *                 type: string
 *                 example: 'space123'
 *               clickup_id:
 *                 type: string
 *                 example: 'proj456'
 *               status_id:
 *                 type: integer
 *                 example: 1
 *               # Add other optional properties from createProjectValidation schema
 *               description:
 *                 type: string
 *                 example: Build the new company website.
 *               project_open:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Project created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Conflict (e.g., unique constraint violation)
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/',
    authenticateToken,           // <-- Added
    createProjectValidation, // Apply validation rules for creation
    handleValidationErrors,  // Handle any validation errors
    controller.createProject // Call the controller function
);

// PUT /:id - Update an existing project
/**
 * @openapi
 * /projects/{id}:
 *   put:
 *     tags:
 *       - Projects
 *     summary: Update an existing project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the project to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               # List optional properties from updateProjectValidation schema
 *               name:
 *                 type: string
 *                 example: Updated Website Build
 *               status_id:
 *                 type: integer
 *                 example: 2
 *               project_open:
 *                 type: boolean
 *                 example: false
 *               archived:
 *                 type: boolean
 *                 example: true
 *               # Add other updatable fields...
 *     responses:
 *       200:
 *         description: Project updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid input data or project ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/:id',
    authenticateToken,           // <-- Added
    projectIdValidation,      // Validate the ID in the path
    updateProjectValidation,  // Validate the request body
    handleValidationErrors,   // Handle any validation errors
    controller.updateProject  // Call the controller function
);

// DELETE /:id - Delete an existing project
/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     tags:
 *       - Projects
 *     summary: Delete a project by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the project to delete
 *     responses:
 *       200:
 *         description: Project deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Project deleted successfully
 *       400:
 *         description: Invalid project ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *     security:
 *       - bearerAuth: []
 */
router.delete(
    '/:id',
    authenticateToken,           // <-- Added
    projectIdValidation,      // Validate the ID in the path
    handleValidationErrors,   // Handle any validation errors
    controller.deleteProject  // Call the controller function
);

module.exports = router;