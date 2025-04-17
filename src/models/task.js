'use strict';
const { DataTypes } = require('sequelize');

// Export a function that defines the model
module.exports = (sequelize) => {
  // Define the model using the passed sequelize instance
  const Task = sequelize.define('Task', {
    // Columns based on the baseline migration for 'tasks' table
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
      field: 'id' // Explicit field mapping
    },
    name: {
      type: DataTypes.TEXT, // Matches migration
      field: 'name'
    },
    description: {
      type: DataTypes.TEXT, // Matches migration
      field: 'description'
    },
    status_id: {
      type: DataTypes.INTEGER,
      // References defined in associate method
      field: 'status_id'
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false, // Assuming tasks must belong to a project
      // References defined in associate method
      field: 'project_id'
    },
    clickup_id: {
      type: DataTypes.STRING, // Matches migration
      unique: true,
      field: 'clickup_id'
    },
    clickup_task_id: {
      type: DataTypes.STRING, // Matches migration
      field: 'clickup_task_id'
    },
    clickup_list_id: {
      type: DataTypes.STRING, // Matches migration
      field: 'clickup_list_id'
    },
    clickup_folder_id: {
      type: DataTypes.STRING, // Matches migration
      field: 'clickup_folder_id'
    },
    clickup_space_id: {
      type: DataTypes.STRING, // Matches migration
      field: 'clickup_space_id'
    },
    time_estimate_seconds: {
      type: DataTypes.INTEGER, // Matches migration
      field: 'time_estimate_seconds'
    },
    closed_at: {
      type: DataTypes.DATE, // Matches migration
      field: 'closed_at'
    },
    task_open: {
      type: DataTypes.BOOLEAN, // Matches migration
      defaultValue: true,
      field: 'task_open'
    },
    created_at: {
      allowNull: false,
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW, // Use Sequelize default
      field: 'created_at'
    },
    modified_at: { // Renamed from updated_at in old model to match migration
      allowNull: false,
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW, // Use Sequelize default
      field: 'modified_at'
    },
    created_by_user_id: { // Added back
      type: DataTypes.INTEGER,
      allowNull: true, // Or false if required by your logic/db schema
      references: {
        model: 'people', // Target table name
        key: 'employee_id' // Target column name
      },
      field: 'created_by_user_id'
    },
    modified_by_user_id: { // Added back
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'people', // Target table name
        key: 'employee_id' // Target column name
      },
      field: 'modified_by_user_id'
    }
    // Removed columns not in migration: hours, start_date, updated_at (use modified_at), archived, due_date,
    // task_type_id, payment_status_id, priority_id, notes, assignee, job_id
  }, {
    tableName: 'tasks',
    timestamps: true, // Enable timestamps as columns exist
    createdAt: 'created_at', // Map to correct column name
    updatedAt: 'modified_at', // Map to correct column name (migration uses modified_at)
    underscored: true
  });

  // Define associations
  Task.associate = (models) => {
    Task.belongsTo(models.Project, {
      foreignKey: 'project_id',
      as: 'Project' // Optional alias
    });
    Task.belongsTo(models.Status, {
      foreignKey: 'status_id',
      as: 'Status' // Optional alias
    });
    // Add TaskAssignment association if needed for assignees
    Task.belongsToMany(models.Person, {
        through: models.TaskAssignment, // Assuming TaskAssignment model exists and is correct
        foreignKey: 'task_id',
        otherKey: 'employee_id', // Check TaskAssignment model/migration for correct keys
        as: 'Assignees' // Alias for the N:M relationship
    });
    // Association for Creator
    Task.belongsTo(models.Person, {
      foreignKey: 'created_by_user_id',
      as: 'Creator' // Alias for the creator
    });
    // Association for Modifier
    Task.belongsTo(models.Person, {
      foreignKey: 'modified_by_user_id',
      as: 'Modifier' // Alias for the last modifier
    });
    // Add other associations based on FKs if necessary (e.g., TaskType, Priority)
  };

  return Task;
};