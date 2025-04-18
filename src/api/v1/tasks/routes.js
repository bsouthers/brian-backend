// src/api/v1/tasks/routes.js
const express = require('express');
const { query, param, body, validationResult } = require('express-validator');
const controller = require('./controller');
const authenticateToken = require('../../../middleware/auth'); // Placeholder for auth middleware
const { handleError } = require('../../../utils/responseHandlers'); // Error handler

const router = express.Router();

// Middleware to handle validation errors (similar to projects)
const handleValidationErrors = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  // Extract the message from the first validation error
  const errorsArray = result.array();
  const firstErrorMsg = errorsArray.length > 0 ? errorsArray[0].msg : 'Validation failed'; // Default fallback

  return res.status(400).json({
    success: false,
    // Use the specific message from the first error
    error: firstErrorMsg
  });
};

// Middleware to handle validation errors specifically for POST /tasks (returns errors array)
const handlePostValidationErrors = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errorsArray = result.array();
  return res.status(400).json({
    success: false,
    errors: errorsArray // Return the full array
  });
};

// --- Validation Rules ---

// Custom validator for 'sort' query parameter
const isValidSort = (value) => {
  if (!value) return true; // Optional field is valid if not provided
  // Define allowed fields based on Task model attributes commonly used for sorting
  const allowedFields = ['id', 'name', 'status_id', 'project_id', 'created_at', 'modified_at', 'due_date'];
  const sortFields = value.split(',');
  for (const field of sortFields) {
    const parts = field.trim().split(':');
    const fieldName = parts[0];
    const direction = (parts[1] || 'asc').toLowerCase(); // Default to asc

    // --- Start Fix 3: Specific sort errors ---
    if (!allowedFields.includes(fieldName)) {
        throw new Error('Invalid sort field'); // Specific error for field
    }
    if (!['asc', 'desc'].includes(direction)) {
        throw new Error('Invalid sort order'); // Specific error for direction
    }
    // --- End Fix 3 ---
  }
  return true; // Validation passed
};

// Custom validator for 'include' query parameter
const isValidInclude = (value) => {
  if (!value) return true; // Optional field is valid if not provided
  // Define allowed includes based on Task model associations
  const allowedIncludes = ['project', 'status', 'creator', 'modifier', 'assignees'];
  const includes = value.split(',');
  for (const inc of includes) {
    if (!allowedIncludes.includes(inc.trim().toLowerCase())) {
      throw new Error(`Invalid include parameter value: ${inc.trim()}`);
    }
  }
  return true; // Validation passed
};

// Validation rules specific to the GET /tasks list route
const listTasksValidation = [
  query('limit').optional().isInt({ min: 0 }).withMessage('Invalid limit value'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Invalid offset value'),
  // Add validation for known filter parameters
  query('status_id').optional().custom(value => {
    const intValue = parseInt(value, 10);
    // Return false if parsing fails or value is out of range
    if (isNaN(intValue) || intValue < 1 || intValue > 5) {
      return false;
    }
    // Return true if validation passes
    return true;
  }).withMessage('Invalid status_id filter value (must be an integer between 1 and 5)'),
  query('project_id').optional().isInt().withMessage('Invalid project_id filter value'),
  query('assigned_user_id').optional().isInt().withMessage('Invalid assigned_user_id filter value'),
  // Add validation for sort and include using custom validators
  query('sort').optional().custom(isValidSort),
  // Add validation for the 'order' parameter (asc/desc)
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Invalid sort order — must be asc or desc'),
  query('include').optional().custom(isValidInclude)
];


const taskIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid task ID'),
];

const userIdValidation = [
    param('userId').isInt({ min: 1 }).withMessage('Invalid user ID'),
];

// Validation for POST /
const createTaskValidation = [
  body('name').notEmpty().withMessage('Task name is required').isString(),
  body('project_id').notEmpty().withMessage('Project ID is required').isInt({ min: 1 }),
  body('status_id').notEmpty().withMessage('Status ID is required').isInt({ min: 1 }),
  // Add other required fields as necessary
  // body('description').optional().isString(),
  // body('due_date').optional().isISO8601().toDate(),
];

// Validation for PUT /:id
const updateTaskValidation = [
  // ID validation handled by taskIdValidation
  body('name').optional().isString().notEmpty().withMessage('Task name cannot be empty if provided'),
  body('project_id').optional().isInt({ min: 1 }).withMessage('Invalid Project ID'),
  body('status_id').optional().isInt({ min: 1 }).withMessage('Invalid Status ID'),
  body('description').optional({ nullable: true }).isString(),
  body('due_date').optional({ nullable: true }).isISO8601().toDate().withMessage('Invalid Due Date format (YYYY-MM-DD)'),
  // Add other updatable fields
];

// Validation for POST /:id/assign
const assignUserValidation = [
    // ID validation handled by taskIdValidation
    body('user_id').notEmpty().withMessage('User ID is required for assignment').isInt({ min: 1 }),
];


// --- Apply Authentication Middleware ---
// This assumes all task routes require authentication
router.use(authenticateToken);


// --- Define Task Routes ---

// GET / - List tasks (with pagination/filtering)
/**
 * @openapi
 * /tasks:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Retrieve a list of tasks
 *     description: Returns a paginated list of tasks, with optional filtering, sorting, and inclusion of related data.
 *     parameters:
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
 *       - in: query
 *         name: include
 *         schema:
 *           type: string
 *         description: Comma-separated list of associations to include (e.g., project, status, creator, modifier, assignees, job)
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to return
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: integer
 *         description: Filter by project ID
 *       - in: query
 *         name: status_id
 *         schema:
 *           type: integer
 *         description: Filter by status ID
 *       - in: query
 *         name: assigned_user_id
 *         schema:
 *           type: integer
 *         description: Filter by assigned user ID
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort field and direction (e.g., name:asc, due_date:desc)
 *     responses:
 *       200:
 *         description: A list of tasks.
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
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/',
    listTasksValidation, // Use specific validation for this route
    handleValidationErrors,
    controller.listTasks
);

// POST / - Create a new task
/**
 * @openapi
 * /tasks:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create a new task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - project_id
 *               - status_id
 *             properties:
 *               name:
 *                 type: string
 *                 example: Design Homepage Mockup
 *               project_id:
 *                 type: integer
 *                 example: 1
 *               status_id:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *                 example: Create high-fidelity mockups for the new homepage.
 *               due_date:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-05-01T00:00:00Z'
 *               # Add other optional fields from createTaskValidation
 *     responses:
 *       201:
 *         description: Task created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid input data (e.g., missing required fields, invalid IDs)
 *       401:
 *         description: Unauthorized
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/',
    createTaskValidation,
    handlePostValidationErrors, // Use the specific handler for POST
    controller.createTask
);

// GET /:id - Get a specific task by ID
/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Retrieve a single task by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the task to retrieve
 *       - in: query
 *         name: include
 *         schema:
 *           type: string
 *         description: Comma-separated list of associations to include (e.g., project, status, creator, modifier, assignees, job)
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated list of fields to return
 *     responses:
 *       200:
 *         description: Task details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid task ID or include parameter
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id',
    taskIdValidation,
    handleValidationErrors,
    // --- Start Fix 1f: Validate include parameter for GET /:id ---
    (req, res, next) => {
      const includeParam = req.query.include;
      if (includeParam) {
        const allowedIncludes = ['assignees', 'project']; // Only these are valid for GET /:id per instruction
        const requestedIncludes = includeParam.split(',').map(s => s.trim().toLowerCase());
        const invalidIncludes = requestedIncludes.filter(inc => !allowedIncludes.includes(inc));

        if (invalidIncludes.length > 0) {
          // Found an invalid include parameter
          return res.status(400).json({ success: false, error: 'Invalid include parameter' });
        }
      }
      // If include is not present or all parts are valid, proceed
      next();
    },
    // --- End Fix 1f ---
    controller.getTaskById
);

// PUT /:id - Update an existing task
/**
 * @openapi
 * /tasks/{id}:
 *   put:
 *     tags:
 *       - Tasks
 *     summary: Update an existing task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the task to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               # List optional properties from updateTaskValidation schema
 *               name:
 *                 type: string
 *                 example: Finalize Homepage Design
 *               status_id:
 *                 type: integer
 *                 example: 3 # e.g., Completed
 *               description:
 *                 type: string
 *               due_date:
 *                 type: string
 *                 format: date-time
 *               # Add other updatable fields...
 *     responses:
 *       200:
 *         description: Task updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid input data or task ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/:id',
    taskIdValidation,
    updateTaskValidation,
    handleValidationErrors,
    controller.updateTask
);

// DELETE /:id - Delete an existing task
/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags:
 *       - Tasks
 *     summary: Delete a task by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the task to delete
 *     responses:
 *       200:
 *         description: Task deleted successfully.
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
 *                   example: Task deleted successfully
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 *       409:
 *         description: Conflict (e.g., cannot delete due to dependencies)
 *     security:
 *       - bearerAuth: []
 */
router.delete(
    '/:id',
    taskIdValidation,
    handleValidationErrors,
    controller.deleteTask
);

// POST /:id/assign - Assign a user to a task
router.post(
    '/:id/assign',
    taskIdValidation,
    assignUserValidation,
    handleValidationErrors,
    controller.assignUserToTask
);

// DELETE /:id/assign/:userId - Unassign a user from a task
router.delete(
    '/:id/assign/:userId',
    taskIdValidation,
    userIdValidation, // Validate userId from param
    handleValidationErrors,
    controller.unassignUserFromTask
);


module.exports = router;