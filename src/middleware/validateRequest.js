// Centralised middleware to surface express-validator errors
const { validationResult } = require('express-validator');

module.exports = function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Map the validation errors to match what the tests expect
    // The tests expect 'param' but express-validator uses 'path'
    const mappedErrors = errors.array().map(err => ({
      ...err,
      param: err.path // Add param property that points to the path
    }));
    
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        errors: mappedErrors,
      },
    });
  }
  return next();
};