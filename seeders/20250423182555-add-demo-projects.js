'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('projects', [
      {
        id: 1, // Renamed from project_id
        name: 'Website Redesign',
        status_id: 1, // Active
        description: 'Complete overhaul of the corporate website design and user experience.',
        active: true, // Assuming 'active' boolean field, NOT NULL
        start_date: new Date(), // Assuming 'start_date' date field, NOT NULL
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2, // Renamed from project_id
        name: 'API Integration',
        status_id: 1, // Active
        description: 'Integrate third-party CRM API with our internal systems.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 3, // Renamed from project_id
        name: 'Mobile App Launch',
        status_id: 1, // Active
        description: 'Develop and launch the new iOS and Android mobile application.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 4, // Renamed from project_id
        name: 'Data Warehouse Migration',
        status_id: 1, // Active
        description: 'Migrate existing data warehouse to a new cloud platform.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 5, // Renamed from project_id
        name: 'Customer Portal Development',
        status_id: 1, // Active
        description: 'Build a new self-service portal for customers.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 6, // Renamed from project_id
        name: 'Marketing Campaign Automation',
        status_id: 1, // Active
        description: 'Implement a new system for automating marketing campaigns.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 7, // Renamed from project_id
        name: 'Internal Wiki Setup',
        status_id: 1, // Active
        description: 'Set up and populate an internal knowledge base wiki.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 8, // Renamed from project_id
        name: 'Security Audit',
        status_id: 1, // Active
        description: 'Conduct a comprehensive security audit of all systems.',
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 9, // Renamed from project_id
        name: 'Legacy System Decommission',
        status_id: 2, // Archived
        description: 'Plan and execute the decommissioning of the old accounting system.',
        active: false, // Archived projects are likely inactive
        start_date: new Date(), // Still needs a start date
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 10, // Renamed from project_id
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
