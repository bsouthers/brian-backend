const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth'); // Import the auth middleware

const router = express.Router();

// Public route: Login
router.post('/login', authController.login);

// Protected route: Get current user details
// The authenticateToken middleware runs first to verify the JWT
router.get('/me', authenticateToken, authController.getMe);

// Public route: Logout (basic implementation)
router.post('/logout', authController.logout);

module.exports = router;