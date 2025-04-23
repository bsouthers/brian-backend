'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('status', null, {});
    await queryInterface.bulkInsert('status', [
      { id: 1, name: 'Active', created_at: new Date(), modified_at: new Date() },
      { id: 2, name: 'Inactive', created_at: new Date(), modified_at: new Date() },
      { id: 3, name: 'Pending', created_at: new Date(), modified_at: new Date() }
      // Add more statuses if needed based on application requirements
    ], {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('status', null, {});
  }
};