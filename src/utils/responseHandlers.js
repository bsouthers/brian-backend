// src/utils/responseHandlers.js

/**
 * Sends a standardized success response.
 * @param {object} res - Express response object.
 * @param {object|array} data - The data payload to send.
 * @param {number} [statusCode=200] - HTTP status code (default is 200).
 */
const handleResponse = (res, data, statusCode = 200) => {
  // Check if data is a Sequelize instance or array of instances and convert to JSON
  let responseData = data;
  if (data && typeof data.toJSON === 'function') {
    // Single Sequelize instance
    responseData = data.toJSON();
  } else if (Array.isArray(data) && data.length > 0 && typeof data[0].toJSON === 'function') {
    // Array of Sequelize instances
    responseData = data.map(item => item.toJSON());
  }
  // Handle cases where data might have a 'tasks' property (like from listTasks)
  else if (data && data.tasks && Array.isArray(data.tasks)) {
     responseData = {
       ...data,
       tasks: data.tasks.map(item => (item && typeof item.toJSON === 'function' ? item.toJSON() : item))
     };
  }


  res.status(statusCode).json({
    success: true,
    data: responseData, // Send the plain JSON data
  });
};

/**
 * Sends a standardized error response.
 * Logs the error internally.
 * @param {object} res - Express response object.
 * @param {Error} error - The error object.
 * @param {string} [defaultMessage='An unexpected error occurred'] - Default message if error.message is not specific.
 */
const handleError = (res, error, statusCodeParam) => {
  // Determine status code with priority:
  // 1. Explicitly passed statusCode parameter
  // 2. error.statusCode property
  // 3. Default to 500
  const statusCode = statusCodeParam || error.statusCode || 500;
  
  // Enhanced logging for debugging purposes
  console.error('handleError:', {
    error: error,
    status: statusCode,
    message: error.message,
    name: error.name,
    stack: error.stack
  });

  // Determine error message
  let message;
  if (typeof error === 'string') {
    message = error;
  } else if (error.message) {
    message = error.message;
  } else {
    message = 'An unexpected error occurred';
  }

  // console.log(`[handleError] Sending response with statusCode: ${statusCode}, message: ${message}`); // Removed log
  res.status(statusCode).json({
    success: false,
    error: message,
    // Optionally include error code or type in development/staging
    ...(process.env.NODE_ENV !== 'production' && error.name ? { errorType: error.name } : {}),
  });
};

module.exports = {
  handleResponse,
  handleError,
};