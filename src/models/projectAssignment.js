'use strict';
const { DataTypes } = require('sequelize');

// Export a function that defines the model
module.exports = (sequelize) => {
  // Define the model using the passed sequelize instance
  const ProjectAssignment = sequelize.define('ProjectAssignment', {
    // Attributes defined here
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true, // Part of composite primary key
      references: {
        model: 'projects', // Name of the target table
        key: 'id',       // Name of the target column
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      field: 'project_id' // Matches the column name in the join table
    },
    user_id: { // Attribute name matches DB column name
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true, // Part of composite primary key
      references: {
        model: 'people', // Name of the target table
        key: 'employee_id', // Name of the target column in the people table
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      field: 'user_id' // Explicitly map attribute to column, just in case
    },
    created_at: {
      allowNull: false, // As per migration
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW, // Use Sequelize.NOW for consistency
      field: 'created_at' // Matches migration column
    },
    updated_at: { // Renamed from modified_at to match migration
      allowNull: false, // As per migration
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW, // Use Sequelize.NOW for consistency
      field: 'updated_at' // Matches migration column
    }
  }, {
    // Options defined here
    tableName: 'project_assignments',
    timestamps: true, // Let Sequelize manage createdAt/updatedAt based on columns
    createdAt: 'created_at', // Explicitly map to column name
    updatedAt: 'updated_at', // Explicitly map to column name
    underscored: true
    // No need to define primaryKey here as it's handled by the column definitions above
  });

  // Associations could be defined here if ProjectAssignment needed them,
  // but for a simple join table, it often doesn't need its own .associate method.
  // ProjectAssignment.associate = (models) => {
  //   // Example: ProjectAssignment.belongsTo(models.Project, { foreignKey: 'project_id' });
  //   // Example: ProjectAssignment.belongsTo(models.Person, { foreignKey: 'user_id' });
  // };

  return ProjectAssignment;
};