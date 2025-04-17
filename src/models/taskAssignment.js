'use strict';
const { DataTypes } = require('sequelize');

// Export a function that defines the model
module.exports = (sequelize) => {
  // Define the model using the passed sequelize instance
  const TaskAssignment = sequelize.define('TaskAssignment', {
    // Columns based on the baseline migration for 'task_assignments' table
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true, // Part of composite primary key
      references: {
        model: 'tasks', // Name of the target table
        key: 'id'       // Name of the target column
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      field: 'task_id' // Explicit field mapping
    },
    employee_id: { // Matches migration column name
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true, // Part of composite primary key
      references: {
        model: 'people', // Name of the target table
        key: 'employee_id' // Name of the target column in the people table
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      field: 'employee_id' // Explicit field mapping
    },
    created_at: {
      allowNull: false, // As per migration
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW, // Use Sequelize default
      field: 'created_at'
    },
    modified_at: { // Matches migration column name
      allowNull: false, // As per migration
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW, // Use Sequelize default
      field: 'modified_at'
    }
    // Removed columns not in migration: created_by_user_id, modified_by_user_id
  }, {
    tableName: 'task_assignments',
    timestamps: true, // Enable timestamps as columns exist
    createdAt: 'created_at', // Map to correct column name
    updatedAt: 'modified_at', // Map to correct column name (migration uses modified_at)
    underscored: true
    // No need to define primaryKey here as it's handled by the column definitions above
  });

  // No .associate method needed for this simple join table model itself.

  return TaskAssignment;
};