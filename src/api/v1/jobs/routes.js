const express = require('express');
const { param, body, validationResult } = require('express-validator');
const ctrl = require('./controller');
const auth = require('../../../middleware/auth');
const { handleError } = require('../../../utils/responseHandlers');

const r = express.Router();

// validate helper
const validate = (req,res,next)=>{
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Map the validation errors to match what the tests expect
    // The tests expect 'param' but express-validator uses 'path'
    const mappedErrors = errors.array().map(err => ({
      ...err,
      param: err.path // Add param property that points to the path
    }));
    
    // Return the mapped validation errors
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        errors: mappedErrors
      }
    });
  }
  next();
};

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