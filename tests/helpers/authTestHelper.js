// tests/helpers/authTestHelper.js
const bcrypt = require('bcrypt');
const db = require('../../src/models');          // <- your Sequelize models
const { generateTestToken } = require('../test-helpers');

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
    token: generateTestToken(user.employee_id)   // employee_id is PK in your schema
  };
}

// Keep the names the failing spec expects:
module.exports = {
  createTestUser,
  generateToken: generateTestToken
};