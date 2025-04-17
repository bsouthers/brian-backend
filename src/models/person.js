'use strict';
const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

// Define the model structure matching the migration
const PersonDefinition = {
  employee_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'employee_id'
  },
  first_name: {
    type: DataTypes.STRING(255), // Assuming max length
    allowNull: false,
    field: 'first_name'
  },
  last_name: {
    type: DataTypes.STRING(255), // Assuming max length
    allowNull: false,
    field: 'last_name'
  },
  // Removed company_id
  email: {
    type: DataTypes.STRING(255), // Assuming max length
    allowNull: false,
    unique: true, // Added based on migration
    field: 'email'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true // Password added by separate migration
    // field: 'password' // Matches attribute name
  },
  // Removed obsolete job_id attribute
  clickup_id: { // Added based on migration
    type: DataTypes.STRING,
    unique: true,
    field: 'clickup_id'
  },
  is_active: { // Renamed from 'active' and added based on migration
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  // Removed created_by_user_id
  // Removed modified_by_user_id
  // Removed team
  created_at: { // Added based on migration
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  modified_at: { // Added based on migration
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'modified_at'
  }
};

const PersonOptions = {
  tableName: 'people',
  timestamps: true, // Enable timestamps as columns exist
  createdAt: 'created_at',
  updatedAt: 'modified_at',
  underscored: true,
  hooks: {
    beforeSave: async (person, options) => {
      if (person.changed('password')) {
        if (person.password) {
          const salt = await bcrypt.genSalt(10);
          person.password = await bcrypt.hash(person.password, salt);
        } else {
          person.password = null;
        }
      }
    }
  }
};

// Export a function that initializes the model
module.exports = (sequelize) => {
  const Person = sequelize.define('Person', PersonDefinition, PersonOptions);

  // Instance method to compare passwords
  Person.prototype.comparePassword = async function (candidatePassword) {
    if (!this.password) {
      return false;
    }
    return bcrypt.compare(candidatePassword, this.password);
  };

  // Define associations here
  Person.associate = (models) => {
    // Removed obsolete belongsTo Job association
    // Many-to-Many associations defined in index.js or the other models
    Person.belongsToMany(models.Project, { through: models.ProjectAssignment, foreignKey: 'user_id', otherKey: 'project_id', as: 'AssignedProjects' });
    // Person.belongsToMany(models.Task, { through: models.TaskAssignment, foreignKey: 'employee_id', otherKey: 'task_id', as: 'AssignedTasks' });
  };

  return Person;
};