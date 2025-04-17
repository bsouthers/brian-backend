'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Job extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Job.belongsTo(models.Project, {
        foreignKey: 'projectId',
        as: 'ProjectDetails', // Changed alias from 'project'
        onDelete: 'CASCADE', // Optional: Define deletion behavior
      });
    }
  }
  Job.init({
    // Define model attributes according to project needs
    // Example attributes:
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending', // Example default status
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'projects', // Corrected to lowercase to match migration
        key: 'id',
      },
    },
  }, {
    sequelize,
    modelName: 'Job',
    // Optional: Define table name if different from pluralized model name
    // tableName: 'jobs',
  });
  return Job;
};