// src/middleware/rbac.js
const { forbidden } = require('../utils/responseHandlers');

/**
 * Role-based access-control middleware
 * @param {string|string[]} roles - allowed roles, e.g., 'admin' or ['admin','editor']
 */
function checkRole(roles = []) {
  if (typeof roles === 'string') roles = [roles];

  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      return forbidden(res, 'Insufficient permissions');
    }
    return next();
  };
}

module.exports = checkRole;