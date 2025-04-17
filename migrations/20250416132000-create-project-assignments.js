'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Check if the table exists by querying the information schema
      const [tables] = await queryInterface.sequelize.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         AND table_name = 'project_assignments'`
      );
      
      if (tables.length === 0) {
        // Table doesn't exist, create it
        await queryInterface.createTable('project_assignments', {
          project_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true, // Part of composite primary key
            references: {
              model: 'projects', // Name of the target table
              key: 'id',       // Name of the target column
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE', // Or 'SET NULL' or 'RESTRICT' depending on desired behavior
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true, // Part of composite primary key
            references: {
              model: 'people', // Name of the target table
              key: 'employee_id', // Name of the target column in the people table
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW,
          },
          updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW,
          }
        });
        console.log('Created project_assignments table');
      } else {
        console.log('project_assignments table already exists, skipping creation');
      }
    } catch (error) {
      // If there's an error other than table already exists, rethrow it
      if (!error.message.includes('already exists')) {
        throw error;
      }
      console.log('Error checking/creating project_assignments table:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_assignments');
  }
};