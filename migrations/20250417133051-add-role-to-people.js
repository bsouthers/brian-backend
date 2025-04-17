'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('people', 'role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'user' // Added a sensible default
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('people', 'role');
  }
};