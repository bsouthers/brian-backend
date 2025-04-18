const express = require('express');
const { param, body, validationResult } = require('express-validator');
const ctrl = require('./controller');
const auth = require('../../../middleware/auth');
const { handleError } = require('../../../utils/responseHandlers');

const r = express.Router();

// Use the new validation helper
const firstErrMsg = require('../../../middleware/validationMessage'); // Path adjusted from src/api/v1/jobs/

const handleValidationErrors = (req, res, next) => { // Renamed to handleValidationErrors for consistency
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(firstErrMsg(errors.array())); // ← field‑specific message
    err.statusCode = 400;
    err.errors = errors.array();                         // keep full details
    return next(err); // Pass to the central error handler
  }
  next();
};

// Alias for routes below that used 'validate'
const validate = handleValidationErrors;

// shared rules
const idParam = [ param('id').isInt({gt:0}).withMessage('Job ID must be a positive integer') ];
const statusRule = body('status')
      .optional()
      .isIn(['pending','in-progress','completed','archived'])
      .withMessage('Invalid status value');

r.use(auth);   // all job endpoints are protected

/* LIST (already passes) */
r.get('/', ctrl.listJobs);

/* CREATE */
r.post('/',
  body('title').notEmpty().withMessage('Title is required'),
  body('projectId').isInt({gt:0}).withMessage('Project ID is required and must be an integer'),
  statusRule,
  validate,
  ctrl.createJob
);

/* READ single  */
r.get('/:id', idParam, validate, ctrl.getJobById);

/* UPDATE */
r.put('/:id',
  idParam,
  body('title').optional().notEmpty(),
  statusRule,
  validate,
  ctrl.updateJob
);

/* DELETE */
r.delete('/:id', idParam, validate, ctrl.deleteJob);

module.exports = r;