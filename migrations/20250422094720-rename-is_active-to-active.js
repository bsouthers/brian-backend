'use strict';
module.exports = {
  async up (queryInterface) {
    const table = await queryInterface.describeTable('people');
    if (!table.active && table.is_active) {
      await queryInterface.renameColumn('people', 'is_active', 'active');
      console.log('Renamed is_active → active');
    } else {
      console.log('Column already correct – skipping');
    }
  },
  async down (queryInterface) {
    const table = await queryInterface.describeTable('people');
    if (!table.is_active && table.active) {
      await queryInterface.renameColumn('people', 'active', 'is_active');
    }
  }
};