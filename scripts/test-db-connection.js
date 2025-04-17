// C:\Apps\Brian\scripts\test-db-connection.js

// Import the Sequelize instance and models
// Assuming src/models/index.js exports an object 'db' containing sequelize and models
const db = require('../src/models/index.js'); // Relative path from scripts/ to src/

async function testDatabaseConnection() {
  console.log('Attempting to connect to the database...');
  try {
    // 1. Test the connection using authenticate()
    await db.sequelize.authenticate();
    console.log('✅ Database connection successful.');

    // 2. Test model loading and basic query
    console.log('Attempting a simple query to verify model loading...');
    // Using Person model as an example, adjust if needed
    const person = await db.Person.findOne({ attributes: ['employee_id'] }); // Simple query
    console.log('✅ Simple query executed successfully. Models seem loaded correctly.');
    // Optional: Log the result count or a specific field if needed for more detail
    // console.log(`Found at least one person record (or null if table is empty).`);

    console.log('\n🎉 Database connection and model loading test passed!');
    process.exit(0); // Exit with success code
  } catch (error) {
    console.error('❌ Database test failed:');
    if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeConnectionRefusedError' || error.name === 'SequelizeHostNotFoundError' || error.name === 'SequelizeAccessDeniedError') {
        console.error('   Error connecting to the database:', error.message);
    } else if (error.name === 'SequelizeDatabaseError') {
        console.error('   Error during query execution (check model definitions and table existence):', error.message);
        console.error('   Original Error:', error.original); // Log original DB error if available
    }
     else {
        console.error('   An unexpected error occurred:', error);
    }
    process.exit(1); // Exit with error code
  }
}

testDatabaseConnection();