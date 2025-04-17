'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('status', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      modified_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    // Removed obsolete 'jobs' table creation

    await queryInterface.createTable('projects', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      clickup_space_id: {
        type: Sequelize.STRING,
        unique: true
      },
      clickup_id: {
        type: Sequelize.STRING,
        unique: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      modified_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.createTable('people', {
      employee_id: { // Changed from 'id' to match schema
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      // Removed job_id foreign key
      clickup_id: {
        type: Sequelize.STRING,
        unique: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      modified_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
      // password field intentionally omitted for baseline
    });

    await queryInterface.createTable('tasks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.TEXT // Changed from STRING to TEXT
      },
      description: {
        type: Sequelize.TEXT
      },
      status_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'status',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      project_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE' // Changed from SET NULL to CASCADE based on schema
      },
      clickup_id: {
        type: Sequelize.STRING,
        unique: true
      },
      clickup_task_id: { // Added based on schema
        type: Sequelize.STRING
      },
      clickup_list_id: { // Added based on schema
        type: Sequelize.STRING
      },
      clickup_folder_id: { // Added based on schema
        type: Sequelize.STRING
      },
      clickup_space_id: { // Added based on schema
        type: Sequelize.STRING
      },
      time_estimate_seconds: { // Added based on schema
        type: Sequelize.INTEGER
      },
      closed_at: { // Added based on schema
        type: Sequelize.DATE
      },
      task_open: { // Added based on schema
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      modified_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.createTable('project_assignments', {
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true, // Part of composite key
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      employee_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true, // Part of composite key
        references: {
          model: 'people',
          key: 'employee_id' // Reference the correct PK name
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      modified_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.createTable('task_assignments', {
      task_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true, // Part of composite key
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      employee_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true, // Part of composite key
        references: {
          model: 'people',
          key: 'employee_id' // Reference the correct PK name
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      modified_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });
  },

  async down (queryInterface, Sequelize) {
    // Drop tables in reverse order of creation due to foreign key constraints
    await queryInterface.dropTable('task_assignments');
    await queryInterface.dropTable('project_assignments');
    await queryInterface.dropTable('tasks');
    await queryInterface.dropTable('projects');      // drop the child first
    await queryInterface.dropTable('people');        // then the parent
    // Removed dropTable('jobs')
    await queryInterface.dropTable('status');
  }
};
