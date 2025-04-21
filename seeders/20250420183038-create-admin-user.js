'use strict';
const bcrypt = require('bcrypt');

module.exports = {
  async up (queryInterface) {
    if (process.env.NODE_ENV !== 'production') {
      // avoid duplicates if someone re‑runs seeds
      await queryInterface.bulkDelete('people', { email: 'dev@example.com' });

      await queryInterface.bulkInsert('people', [{
        first_name : 'Dev',
        last_name  : 'Admin',
        email      : 'dev@example.com',
        password   : await bcrypt.hash('password123', 10),
        role       : 'admin'
        // removed created_at and modified_at as they don't exist in the table
      }]);
    }
  },

  async down (queryInterface) {
    await queryInterface.bulkDelete('people', { email: 'dev@example.com' });
  }
};
