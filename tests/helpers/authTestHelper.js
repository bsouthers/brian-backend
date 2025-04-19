// tests/helpers/authTestHelper.js
const bcrypt = require('bcrypt');
const db = require('../../src/models');          // <- your Sequelize models
const jwt = require('jsonwebtoken'); // Add jwt require

// Helper function to generate a valid JWT for testing
// Helper function to generate a valid JWT for testing, now includes role
const generateTestToken = (userId, role = 'tester') => { // Add role parameter with default
  // Use a real user ID from your test setup or seed data if necessary
  const payload = {
    id: userId,
    email: `user${userId}@test.com`,
    role: role // Include role in the payload
  };
  // JWT secret is now accessed via process.env.JWT_SECRET set in setup.js
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

/**
 * Inserts a throw-away user into the test DB and returns both the row and a JWT.
 * Adjust field names if your Person model differs.
 */
async function createTestUser() {
  const user = await db.Person.create({
    first_name: 'Test',
    last_name:  'User',
    email:      `test.user.${Date.now()}@example.com`,
    password:   await bcrypt.hash('password', 10),
    is_active:  true
  });

  return {
    user,
    // Pass the user's role (assuming user object has it, otherwise defaults to 'tester')
    token: generateTestToken(user.employee_id, user.role)
  };
}

// Keep the names the failing spec expects:
module.exports = {
  createTestUser,
  generateToken: generateTestToken
};