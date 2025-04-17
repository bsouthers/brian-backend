'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    // Check if password column already exists
    try {
      // Try to add the column, but catch the error if it already exists
      await queryInterface.addColumn('people', 'password', {
        type: Sequelize.STRING,
        allowNull: true, // Allow null initially for existing users
      });
      console.log('Added password column to people table');
    } catch (error) {
      // If the error is because the column already exists, just log and continue
      if (error.message.includes('already exists')) {
        console.log('Password column already exists in people table, skipping');
      } else {
        // If it's a different error, rethrow it
        throw error;
      }
    }
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    // Commented out removeColumn as the 'people' table is dropped by the baseline migration's down function
    // await queryInterface.removeColumn('people', 'password');
  }
};
