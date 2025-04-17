const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { Sequelize } = require('sequelize');

// Log environment variables for debugging (optional, remove in production)
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '******' : 'Not Set');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false, // Disable logging or use console.log for debugging
    // Add other options like pool configuration if needed
    // pool: {
    //   max: 5,
    //   min: 0,
    //   acquire: 30000,
    //   idle: 10000
    // }
  }
);

// Export the Sequelize instance directly
module.exports = sequelize;