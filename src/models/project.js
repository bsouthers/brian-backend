'use strict';
const { DataTypes } = require('sequelize');

// Define the model structure matching the migration
const ProjectDefinition = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false, // Added based on migration
    field: 'name'
  },
  clickup_space_id: { // Added based on migration
    type: DataTypes.STRING,
    unique: true,
    field: 'clickup_space_id'
  },
  clickup_id: { // Added based on migration
    type: DataTypes.STRING,
    unique: true,
    field: 'clickup_id'
  },
  // Fields expected by tests and likely present in DB schema
  status_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // Or false if required by DB/logic
    references: {
      model: 'statuses', // Ensure this matches the Status table name
      key: 'id',
    },
    field: 'status_id'
  },
  created_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // Or false if required by DB/logic
    references: {
      model: 'people', // Ensure this matches the Person table name
      key: 'employee_id', // Ensure this matches the Person primary key field name
    },
    field: 'created_by_user_id'
  },
  // Consider adding modified_by_user_id if needed for updates
  // modified_by_user_id: {
  //   type: DataTypes.INTEGER,
  //   allowNull: true,
  //   references: {
  //     model: 'people',
  //     key: 'employee_id',
  //   },
  //   field: 'modified_by_user_id'
  // },
  // Other potentially relevant fields based on tests/logic (add if needed)
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description'
  },
  notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes'
  },
  project_open: {
      type: DataTypes.BOOLEAN,
      allowNull: true, // Or false + defaultValue if needed
      field: 'project_open'
  },
  archived: {
      type: DataTypes.BOOLEAN,
      allowNull: true, // Or false + defaultValue if needed
      field: 'archived'
  },
  start_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'start_date'
  },
  due_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'due_date'
  },
  closed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'closed_at'
  },
  // Add other foreign keys if they exist and are needed
  // company_id: { type: DataTypes.INTEGER, field: 'company_id', references: { model: 'companies', key: 'id' } },
  // contract_id: { type: DataTypes.INTEGER, field: 'contract_id', references: { model: 'contracts', key: 'id' } },
  // project_category_id: { type: DataTypes.INTEGER, field: 'project_category_id', references: { model: 'project_categories', key: 'id' } },
  // customer_name_id: { type: DataTypes.INTEGER, field: 'customer_name_id', references: { model: 'customer_names', key: 'id' } },
  // product_category_id: { type: DataTypes.INTEGER, field: 'product_category_id', references: { model: 'product_categories', key: 'id' } },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false, // Added based on migration
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  modified_at: {
    type: DataTypes.DATE,
    allowNull: false, // Added based on migration
    defaultValue: DataTypes.NOW,
    field: 'modified_at'
  }
};

const ProjectOptions = {
  tableName: 'projects',
  timestamps: true, // Enable timestamps as columns exist
  createdAt: 'created_at',
  updatedAt: 'modified_at',
  underscored: true
};

// Export a function that initializes the model
module.exports = (sequelize) => {
  const Project = sequelize.define('Project', ProjectDefinition, ProjectOptions);

  // Define associations here based on remaining columns and other models
  Project.associate = (models) => {
    // Associations based on columns that *do* exist in the migration:
    // None apparent that directly use FKs defined *in this table* by the migration.

    // Associations based on FKs *in other tables* pointing to this one:
    Project.hasMany(models.Task, { foreignKey: 'project_id', as: 'Tasks' }); // Assumes Task model has project_id
    Project.hasMany(models.Job, { foreignKey: 'projectId', as: 'Jobs' }); // Added association to Job model
    Project.belongsToMany(models.Person, {
        through: models.ProjectAssignment,
        foreignKey: 'project_id',
        otherKey: 'user_id', // Match the original attribute name in ProjectAssignment
        as: 'AssignedPeople' // Add alias back to match service include logic
    });

    // Associations based on columns added back:
    Project.belongsTo(models.Status, { foreignKey: 'status_id', as: 'Status' });
    Project.belongsTo(models.Person, { foreignKey: 'created_by_user_id', as: 'Creator' });
    // Uncomment if modified_by_user_id is added and needed
    // Project.belongsTo(models.Person, { foreignKey: 'modified_by_user_id', as: 'Modifier' });
  };

  return Project;
};