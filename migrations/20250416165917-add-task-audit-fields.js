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

    // Add created_by_user_id column
    await safeAddColumn('tasks', 'created_by_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true, // Using true for existing data compatibility
      references: {
        model: 'people',
        key: 'employee_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add modified_by_user_id column
    await safeAddColumn('tasks', 'modified_by_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'people',
        key: 'employee_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove columns in reverse order
    // Commented out removeColumn calls as the 'tasks' table is dropped by the baseline migration's down function
    // await queryInterface.removeColumn('tasks', 'modified_by_user_id');
    // await queryInterface.removeColumn('tasks', 'created_by_user_id');
  }
};