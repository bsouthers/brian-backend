'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development'; // Default to development if NODE_ENV is not set
// Load the base config object containing all environments
const config = require(path.join(__dirname, '..', '..', 'config', 'config.json'));
const db = {}; // Define db object early
let useConfig;

if (env === 'test') {
  // Ensure we're using the test config from config.json
  if (!config.test) {
    throw new Error("Test configuration missing in config/config.json");
  }
  useConfig = config.test;
  console.log("Using TEST environment configuration from config.json");
} else {
  // Use env vars primarily, fallback to development config if env vars are missing
  const devConfig = config.development || {}; // Fallback if development config is missing

  useConfig = {
    database: process.env.DB_NAME || devConfig.database,
    username: process.env.DB_USER || devConfig.username,
    password: process.env.DB_PASSWORD || devConfig.password,
    host: process.env.DB_HOST || devConfig.host,
    port: process.env.DB_PORT || devConfig.port,
    dialect: process.env.DB_DIALECT || devConfig.dialect || 'postgres', // Default dialect
    // Carry over other potential settings like pool, logging, etc.
    // Prioritize env vars if specific ones exist, otherwise use development config or defaults
    pool: devConfig.pool || { max: 5, min: 0, acquire: 30000, idle: 10000 },
    // Adjust logging based on environment variable or development config setting
    logging: (process.env.DB_LOGGING === 'true' || (env !== 'test' && devConfig.logging === true)) ? console.log : false,
    // Add any other necessary properties from config.development or env vars
  };
  console.log(`Using ${env} environment configuration (prioritizing environment variables)`);
}

// Now, initialize Sequelize using the determined 'useConfig'
let sequelize;
// Check if a database URL environment variable should be used (like the old config.use_env_variable logic)
// Use DATABASE_URL for non-test environments if it's set
if (process.env.DATABASE_URL && env !== 'test') {
  console.log(`Connecting using DATABASE_URL for ${env} environment`);
  sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: useConfig.dialect, // Still might need dialect and other options
      logging: useConfig.logging,
      pool: useConfig.pool,
      // Add other relevant options from useConfig if needed when using DATABASE_URL
  });
} else {
  // Standard initialization using discrete parameters from useConfig
  if (!useConfig.database || !useConfig.username /* password can be null/empty for some setups */) {
     // Added a check for essential parameters
     throw new Error(`Missing essential database configuration for environment: ${env}. Check config.json and .env variables (DB_NAME=${useConfig.database}, DB_USER=${useConfig.username}).`);
  }
  sequelize = new Sequelize(useConfig.database, useConfig.username, useConfig.password, {
    host: useConfig.host,
    port: useConfig.port,
    dialect: useConfig.dialect,
    // Use the logging setting determined in the useConfig block
    logging: useConfig.logging,
    pool: useConfig.pool,
    // Add any other options supported by Sequelize constructor based on useConfig
  });
}

// Import all model definition functions/files from the current directory
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const modelDefinition = require(path.join(__dirname, file));
    let model;

    // Check the type of export
    if (typeof modelDefinition === 'function') {
        // Check if it's a Model Class itself or a definition function
        if (modelDefinition.prototype instanceof Sequelize.Model) {
            // It's a Model Class exported directly (legacy pattern)
            console.warn(`Model ${file} is exported directly as a class.`);
            // We need to initialize it with the current sequelize instance
            // This assumes the class definition doesn't rely on an old/different instance
            model = modelDefinition.init(
                modelDefinition.rawAttributes, // Get attributes from the class
                { ...modelDefinition.options, sequelize } // Get options and pass current sequelize
            );
        } else {
            // It's a definition function (like status.js)
            model = modelDefinition(sequelize, Sequelize.DataTypes);
        }
    } else if (modelDefinition && modelDefinition.prototype instanceof Sequelize.Model) {
       // This case might be redundant now but kept for safety
       console.warn(`Model ${file} seems to be an uninitialized model class.`);
       model = modelDefinition.init(modelDefinition.rawAttributes, { ...modelDefinition.options, sequelize });
    }

    if (model && model.name) { // Ensure model has a name
       db[model.name] = model;
    } else {
       console.warn(`File ${file} could not be loaded as a valid Sequelize model.`);
    }
  });

// Define Associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    console.log(`Associating model: ${modelName}`);
    db[modelName].associate(db);
  }
});

// --- DIAGNOSTIC LOGGING ---
if (db.Project && db.Project.associations && db.Project.associations.AssignedPeople) {
  console.log('--- Association Check (Project -> AssignedPeople) ---');
  console.log('Association Type:', db.Project.associations.AssignedPeople.associationType);
  console.log('Target Model:', db.Project.associations.AssignedPeople.target.name);
  console.log('Through Model:', db.Project.associations.AssignedPeople.through.model.name);
  console.log('Through Model Table Name:', db.Project.associations.AssignedPeople.through.model.getTableName());
  console.log('Foreign Key:', db.Project.associations.AssignedPeople.foreignKey);
  console.log('Other Key:', db.Project.associations.AssignedPeople.otherKey);
  console.log('----------------------------------------------------');
} else {
  // It's possible associations aren't set up yet when this file is first required by globalSetup
  // console.warn('--- Association Check SKIPPED: Project -> AssignedPeople association not found yet! ---');
}
if (db.ProjectAssignment) {
    console.log('--- ProjectAssignment Model Check ---');
    console.log('Model Name:', db.ProjectAssignment.name);
    console.log('Table Name:', db.ProjectAssignment.getTableName());
    console.log('-----------------------------------');
} else {
    // console.warn('--- ProjectAssignment Model Check SKIPPED: Model not found in db object yet! ---');
}
// --- END DIAGNOSTIC LOGGING ---


// Add sequelize instance and Sequelize library to the db object
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;