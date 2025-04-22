'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('people');
    if (!table.clickup_id) {
      await queryInterface.addColumn('people', 'clickup_id', {
        type: Sequelize.STRING, // Assuming ClickUp ID is a string
        allowNull: true
      });
    }
  },

  async down (queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('people');
    if (table.clickup_id) {
      await queryInterface.removeColumn('people', 'clickup_id');
    }
  }
};
