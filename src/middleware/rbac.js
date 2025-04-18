// src/middleware/rbac.js
// Removed import of potentially injected 'forbidden' function from responseHandlers
/**
 * Role-based access-control middleware
 * @param {string|string[]} roles - allowed roles, e.g., 'admin' or ['admin','editor']
 */
function checkRole(roles = []) {
  if (typeof roles === 'string') roles = [roles];

  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      // Send 403 Forbidden directly instead of using potentially injected response handler
      return res.status(403).send('Insufficient permissions');
    }
    return next();
  };
}

module.exports = checkRole;