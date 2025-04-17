'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Helper function to add a column and handle "already exists" errors
    async function safeAddColumn(table, column, options) {
      try {
        await queryInterface.addColumn(table, column, options);
        console.log(`Added column ${column} to ${table} table`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`Column ${column} already exists in ${table} table, skipping`);
        } else {
          // If it's a different error, rethrow it
          throw error;
        }
      }
    }

    // Add status_id column
    await safeAddColumn('projects', 'status_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'status', // table name (singular, not plural)
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add created_by_user_id column
    await safeAddColumn('projects', 'created_by_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'people',
        key: 'employee_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add description column
    await safeAddColumn('projects', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add notes column
    await safeAddColumn('projects', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add project_open column
    await safeAddColumn('projects', 'project_open', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    });

    // Add archived column
    await safeAddColumn('projects', 'archived', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    });

    // Add start_date column
    await safeAddColumn('projects', 'start_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add due_date column
    await safeAddColumn('projects', 'due_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add closed_at column
    await safeAddColumn('projects', 'closed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    // Commented out removeColumn calls as the 'projects' table is dropped by the baseline migration's down function
    // await queryInterface.removeColumn('projects', 'status_id');
    // await queryInterface.removeColumn('projects', 'created_by_user_id');
    // await queryInterface.removeColumn('projects', 'description');
    // await queryInterface.removeColumn('projects', 'notes');
    // await queryInterface.removeColumn('projects', 'project_open');
    // await queryInterface.removeColumn('projects', 'archived');
    // await queryInterface.removeColumn('projects', 'start_date');
    // await queryInterface.removeColumn('projects', 'due_date');
    // await queryInterface.removeColumn('projects', 'closed_at');
    // Remove other columns if added above
  }
};
