'use strict';
const { DataTypes } = require('sequelize'); // Only need DataTypes here

module.exports = (sequelize) => { // Export a function that accepts the sequelize instance
  const Status = sequelize.define('Status', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      field: 'id'
    },
    name: { // Kept as 'name' to align with migration
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'name'
    },
    // Removed created_by_user_id and modified_by_user_id as they don't exist in the migration
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
      field: 'created_at'
    },
    modified_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
      field: 'modified_at'
    }
  }, {
    tableName: 'status',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'modified_at',
    underscored: true
  });

  // Associations involving created_by/modified_by should also be removed or adjusted if they existed
  // Status.associate = (models) => {
  //   // Example: Remove associations if they relied on the removed columns
  // };

  return Status;
};