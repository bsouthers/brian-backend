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
    
    // Extract the message from the first validation error
    const firstErrorMsg = mappedErrors.length > 0 ? mappedErrors[0].msg : 'Validation failed';

    return res.status(400).json({
      success: false,
      // Use the specific message from the first error
      error: firstErrorMsg
    });
  }
  return next();
};