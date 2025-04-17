// tests/setup.js
if (process.env.NODE_ENV === 'test') {
  process.env.JWT_SECRET = require('../config/test').JWT_SECRET;
}

const { sequelize } = require('../src/models'); // Import sequelize instance from models/index.js
const app = require('../src/index'); // Import the Express app

// The JWT secret is now set via process.env.JWT_SECRET in the block above

// Optional: Define a global variable for the app instance if needed in tests
// global.app = app;

beforeAll(async () => {
  // Optional: Ensure database connection is established before running tests
  try {
    await sequelize.authenticate();
    console.log('Test DB Connection has been established successfully.');
    // Optional: Run migrations or sync database if using a separate test DB
    // await sequelize.sync({ force: true }); // Use with caution: drops existing tables!
  } catch (error) {
    console.error('Unable to connect to the test database:', error);
    process.exit(1); // Exit if DB connection fails
  }
});

afterAll(async () => {
  // Close the database connection after all tests are done
  try {
    await sequelize.close();
    console.log('Test DB Connection has been closed successfully.');
  } catch (error) {
    console.error('Error closing the test database connection:', error);
  }
  // Optional: Close the server if it was explicitly started
  // if (global.server && global.server.close) {
  //   global.server.close();
  // }
});

// Add any other global setup/teardown logic here