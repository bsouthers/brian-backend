'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('projects', null, {});
    await queryInterface.bulkInsert('projects', [
      {
        name: 'Website Redesign',
        status_id: 1, // Active
        description: 'Complete overhaul of the corporate website design and user experience.',
        active: true, // Assuming 'active' boolean field, NOT NULL
        start_date: new Date(), // Assuming 'start_date' date field, NOT NULL
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'API Integration',
        status_id: 1, // Active
        description: 'Integrate third-party CRM API with our internal systems.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Mobile App Launch',
        status_id: 1, // Active
        description: 'Develop and launch the new iOS and Android mobile application.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Data Warehouse Migration',
        status_id: 1, // Active
        description: 'Migrate existing data warehouse to a new cloud platform.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Customer Portal Development',
        status_id: 1, // Active
        description: 'Build a new self-service portal for customers.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Marketing Campaign Automation',
        status_id: 1, // Active
        description: 'Implement a new system for automating marketing campaigns.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Internal Wiki Setup',
        status_id: 1, // Active
        description: 'Set up and populate an internal knowledge base wiki.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Security Audit',
        status_id: 1, // Active
        description: 'Conduct a comprehensive security audit of all systems.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Legacy System Decommission',
        status_id: 2, // Archived
        description: 'Plan and execute the decommissioning of the old accounting system.',
        active: false, // Archived projects are likely inactive
        start_date: new Date(), // Still needs a start date
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Office Network Upgrade',
        status_id: 2, // Archived
        description: 'Upgrade the internal office network infrastructure (completed last year).',
        active: false,
        start_date: new Date(), // Needs a start date, even if archived
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down (queryInterface, Sequelize) {
    // Keep the down migration simple: delete all projects seeded by this file.
    // It's harder to reliably delete only the specific IDs 1-10 if they might
    // have been modified or if other data exists.
    await queryInterface.bulkDelete('projects', null, {});
  }
};
