'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.renameColumn('people', 'is_active', 'active');
  },
  async down (queryInterface, Sequelize) {
    await queryInterface.renameColumn('people', 'active', 'is_active');
  }
};