/**
 * Global Error Handling Middleware.
 * Catches errors passed via next(err) and sends a standardized JSON response.
 */
const errorHandler = (err, req, res, next) => {
  // Determine the status code - default to 500 if not set
  const statusCode = err.statusCode || 500;
  
  // Enhanced logging for debugging
  console.error('Global Error Handler:', {
    error: err,
    message: err.message,
    statusCode: statusCode,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Send a standardized error response to match the format used by responseHandlers.js
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message,
  });
};

module.exports = errorHandler;