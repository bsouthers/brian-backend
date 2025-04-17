// direct-db-test.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

async function testConnection() {
  console.log('Environment variables:');
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '****' : 'Not set');
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_PORT:', process.env.DB_PORT);
  
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
      logging: console.log
    }
  );

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection successful.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
}

testConnection();