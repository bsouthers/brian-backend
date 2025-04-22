'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up (queryInterface) {
    const table = await queryInterface.describeTable('people');

    // add created_at if missing OR make it nullable+default now()
    if (!table.created_at) {
      await queryInterface.addColumn('people', 'created_at', {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      });
    } else if (table.created_at.allowNull === false && table.created_at.defaultValue === null) {
      await queryInterface.changeColumn('people', 'created_at', {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      });
    }

    // same treatment for modified_at
    if (!table.modified_at) {
      await queryInterface.addColumn('people', 'modified_at', {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      });
    } else if (table.modified_at.allowNull === false && table.modified_at.defaultValue === null) {
      await queryInterface.changeColumn('people', 'modified_at', {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      });
    }
  },

  async down (queryInterface) {
    const table = await queryInterface.describeTable('people');
    if (table.created_at) {
      await queryInterface.removeColumn('people', 'created_at');
    }
    if (table.modified_at) {
      await queryInterface.removeColumn('people', 'modified_at');
    }
  }
};