'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
// Pick the real config if it exists, otherwise fall back to the CI stub
// Note: fs and path are already required above (lines 3 & 4)
const cfgPath = fs.existsSync(
  path.join(__dirname, '../../config/config.json')
)
  ? '../../config/config.json'
  : '../../config/config.ci.json';

const env  = process.env.NODE_ENV || 'development';
const fullConfig = require(cfgPath);          // whole JSON
if (!fullConfig[env]) {
  throw new Error(`Missing "${env}" section in ${cfgPath}`);
}
const useConfig = fullConfig[env];            // just once
console.log(`Using ${env.toUpperCase()} environment configuration from ${cfgPath}`);
const db = {}; // Define db object early
    // Prioritize env vars if specific ones exist, otherwise use development config or defaults

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