'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('projects', [
      {
        project_id: 1,
        name: 'Website Redesign',
        status_id: 1, // Active
        description: 'Complete overhaul of the corporate website design and user experience.',
        created_by_user_id: 1,
        active: true, // Assuming 'active' boolean field, NOT NULL
        start_date: new Date(), // Assuming 'start_date' date field, NOT NULL
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 2,
        name: 'API Integration',
        status_id: 1, // Active
        description: 'Integrate third-party CRM API with our internal systems.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 3,
        name: 'Mobile App Launch',
        status_id: 1, // Active
        description: 'Develop and launch the new iOS and Android mobile application.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 4,
        name: 'Data Warehouse Migration',
        status_id: 1, // Active
        description: 'Migrate existing data warehouse to a new cloud platform.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 5,
        name: 'Customer Portal Development',
        status_id: 1, // Active
        description: 'Build a new self-service portal for customers.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 6,
        name: 'Marketing Campaign Automation',
        status_id: 1, // Active
        description: 'Implement a new system for automating marketing campaigns.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 7,
        name: 'Internal Wiki Setup',
        status_id: 1, // Active
        description: 'Set up and populate an internal knowledge base wiki.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 8,
        name: 'Security Audit',
        status_id: 1, // Active
        description: 'Conduct a comprehensive security audit of all systems.',
        created_by_user_id: 1,
        active: true,
        start_date: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 9,
        name: 'Legacy System Decommission',
        status_id: 2, // Archived
        description: 'Plan and execute the decommissioning of the old accounting system.',
        created_by_user_id: 1,
        active: false, // Archived projects are likely inactive
        start_date: new Date(), // Still needs a start date
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        project_id: 10,
        name: 'Office Network Upgrade',
        status_id: 2, // Archived
        description: 'Upgrade the internal office network infrastructure (completed last year).',
        created_by_user_id: 1,
        active: false,
        start_date: new Date(), // Needs a start date, even if archived
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('projects', null, {});
  }
};
