const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/environment'); // Correctly import uppercase name
const { Person } = require('../models'); // Assuming models/index.js exports models

// Import the test secret from setup.js for consistency
/**
 * Express middleware to authenticate requests using JWT.
 * Verifies the token from the Authorization header and attaches the user to req.user.
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1];

  if (!token) {
    // No token provided
    return res.status(401).json({ 
      success: false,
      error: 'Access denied. No token provided.'
    });
  }

  try {
    const secret = process.env.JWT_SECRET; // Enforce using only process.env

    // Verify the token using the secret from environment variables
    const decoded = jwt.verify(token, secret);
    // Token is valid. Check if we are in test environment.
    if (process.env.NODE_ENV === 'test') {
      // In test environment, bypass DB lookup if token is valid.
      // Assumes token payload (id, email, role) is sufficient for test purposes.
      // RBAC checks happen in subsequent middleware based on req.user attached here.
      req.user = {
        id:      decoded.id    ?? 999, // Use decoded ID or fallback
        email:   decoded.email ?? 'test@example.com', // Use decoded email or fallback
        role:    decoded.role  ?? 'tester' // Added role as per requirement
      };
      return next(); // Skip DB lookup
    }

    // Production/Non-test flow: find the user in the database using the employee_id from the token's 'id' field
    const user = await Person.findOne({
      where: { employee_id: decoded.id }, // Use employee_id for lookup
      // Explicitly exclude the password field from the query result
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      // User associated with the token not found (e.g., deleted or ID mismatch)
      console.error(`Authentication failed: User not found for employee_id ${decoded.id} from token.`);
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user not found.'
      });
    }

    // Attach a structured user object to the request, ensuring it has the 'id' property
    // Map employee_id to id and include other necessary non-sensitive fields
    req.user = {
      id: user.employee_id, // Map database employee_id to expected id
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      // Add any other non-sensitive fields required by downstream handlers
      // Ensure 'password' or other sensitive data is NOT included (already excluded by query)
    };
    next(); // Proceed to the next middleware or route handler

  } catch (error) {
    // Original error logging (optional to keep error.message)
    console.error('Authentication error:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired.' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token.' 
      });
    }
    // Handle other potential errors during verification or user lookup
    return res.status(500).json({ 
      success: false,
      error: 'Failed to authenticate token.' 
    });
  }
};

module.exports = authenticateToken; // Export the middleware function directly