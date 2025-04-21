'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('people', 'clickup_id', {
      type: Sequelize.STRING, // Assuming ClickUp ID is a string
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('people', 'clickup_id');
  }
};
