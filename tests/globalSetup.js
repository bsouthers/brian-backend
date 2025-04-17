// C:\Apps\Brian\tests\globalSetup.js
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const Sequelize = require('sequelize'); // Need Sequelize constructor
const bcrypt = require('bcrypt');
// const db = require('../src/models'); // DO NOT require app models here initially

// Load test config directly
const testConfig = require(path.join(__dirname, '..', 'config', 'config.json')).test;

module.exports = async () => {
    console.log('\nRunning Jest Global Setup: Setting up test database using isolated Umzug...');

    let migrationSequelize; // Temporary instance for migrations
    let db; // Application db instance for seeding

    try {
        // 1. Create temporary Sequelize instance for migrations
        console.log('Jest Global Setup: Creating temporary Sequelize instance for migrations...');
        migrationSequelize = new Sequelize(
            testConfig.database,
            testConfig.username,
            testConfig.password,
            {
                host: testConfig.host,
                port: testConfig.port,
                dialect: testConfig.dialect,
                logging: false, // Keep migration logging minimal for clarity
            }
        );
        await migrationSequelize.authenticate();
        console.log('Jest Global Setup: Temporary migration instance authenticated.');

        // 2. Configure Umzug with the temporary instance
        // Create a custom resolver that explicitly provides Sequelize to migrations
        const umzug = new Umzug({
            migrations: {
                glob: ['migrations/*.js', { cwd: path.join(__dirname, '..') }],
                resolve: ({ name, path, context }) => {
                    // Import the migration file
                    const migration = require(path);
                    
                    // Return an object with up/down functions that explicitly pass Sequelize
                    return {
                        name,
                        up: async () => {
                            console.log(`Running migration UP: ${name}`);
                            return migration.up(migrationSequelize.getQueryInterface(), Sequelize);
                        },
                        down: async () => {
                            console.log(`Running migration DOWN: ${name}`);
                            return migration.down(migrationSequelize.getQueryInterface(), Sequelize);
                        }
                    };
                }
            },
            storage: new SequelizeStorage({ sequelize: migrationSequelize }),
            logger: console,
        });

        // DEBUG: Log resolved glob details and initial pending migrations
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        console.log(`Jest Global Setup: Umzug configured. Looking for migrations in: ${migrationsDir} using pattern *.js`);
        const initialPending = await umzug.pending(); // Check pending immediately
        console.log('Jest Global Setup: Initial pending migrations after umzug setup:', initialPending.map(m => m.name));

        // 3. Run Migrations using temporary instance
        console.log('Jest Global Setup: Reverting all migrations (umzug.down)...');
        await umzug.down({ to: 0 });
        console.log('Jest Global Setup: Migrations reverted.');

        // Explicitly drop SequelizeMeta table to ensure clean state before pending check
        try {
            console.log('Jest Global Setup: Explicitly dropping SequelizeMeta table...');
            await migrationSequelize.getQueryInterface().dropTable('SequelizeMeta');
            console.log('Jest Global Setup: SequelizeMeta table dropped.');
        } catch (dropError) {
            // Ignore error if table doesn't exist, but log others
            if (!dropError.message.includes('does not exist')) {
                console.error('Jest Global Setup: Error dropping SequelizeMeta table:', dropError);
                throw dropError; // Rethrow if it's a significant error
            } else {
                 console.log('Jest Global Setup: SequelizeMeta table did not exist (which is fine).');
            }
        }

        console.log('Jest Global Setup: Running all migrations (umzug.up)...');
        try {
            // Log pending migrations BEFORE running up()
            const pendingMigrations = await umzug.pending();
            console.log('Jest Global Setup: Pending migrations before umzug.up():', pendingMigrations.map(m => m.name));

            const executedMigrations = await umzug.up();
            console.log('Jest Global Setup: umzug.up() executed. Migrations run:', executedMigrations.map(m => m.name));
        } catch (migrationError) {
            console.error('!!! Error during umzug.up() execution !!!:', migrationError);
            // Log nested errors if available
            if (migrationError.original) {
              console.error('!!! Original DB Error: !!!', migrationError.original);
            }
            if (migrationError.parent) {
              console.error('!!! Parent DB Error: !!!', migrationError.parent);
            }
            throw migrationError; // Re-throw to stop the setup process
        }
        console.log('Jest Global Setup: Migrations complete (post umzug.up).');


        // Force recreate project_assignments table
        console.log('Forcing recreation of project_assignments table for test environment...');
        try {
          // Ensure migrationSequelize is still open before using it
          // It should be, as it's closed later in step 4.
          await migrationSequelize.query(`DROP TABLE IF EXISTS "project_assignments" CASCADE;`); // Use double quotes for case sensitivity if needed by PostgreSQL
          await migrationSequelize.query(`
            CREATE TABLE "project_assignments" (
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              user_id INTEGER NOT NULL REFERENCES people(employee_id) ON DELETE CASCADE,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (project_id, user_id)
            );
          `);
          console.log('project_assignments table recreated successfully.');
        } catch (error) {
          console.error('Error forcing recreation of project_assignments table:', error);
          // Decide if you want to throw the error or just log it
          // throw error; // Uncomment this if failure here should stop the test setup
        }

        // 4. Close temporary migration instance
        console.log('Jest Global Setup: Closing temporary migration instance...');
        await migrationSequelize.close();
        console.log('Jest Global Setup: Temporary migration instance closed.');

        // 5. Load Application Models (uses its own connection logic based on env vars/config)
        console.log('Jest Global Setup: Loading application models for seeding...');
        db = require('../src/models'); // Now load the application's db object
        await db.sequelize.authenticate(); // Ensure app connection works
        console.log('Jest Global Setup: Application models loaded and authenticated.');

        // 6. Seed Basic Data using application's db instance
        console.log('Jest Global Setup: Seeding basic data...');

        await db.Status.findOrCreate({
            where: { id: 1 },
            defaults: { id: 1, name: 'Default Test Status' }
        });
        console.log('Seeded default status.');

        // Seed Person first
        const hashedPassword = await bcrypt.hash('testpassword', 10);
        await db.Person.findOrCreate({
            where: { employee_id: 999 },
            defaults: {
                employee_id: 999,
                first_name: 'Test',
                last_name: 'User',
                email: 'test.user@example.com',
                password: hashedPassword,
                job_id: null, // Set job_id to null initially, or seed job first if needed
                is_active: true
            }
        });
        console.log('Seeded test user (ID 999).');

        // Then seed Project, referencing the created user
        await db.Project.findOrCreate({
            where: { id: 7695 },
            defaults: {
                id: 7695,
                name: 'Test Project Seeded',
                status_id: 1, // Assuming status with id 1 was seeded
                created_by_user_id: 999 // Reference the user seeded above
            }
        });
        console.log('Seeded test project (ID 7695).');

        // Then seed the Job, referencing the created project
        await db.Job.findOrCreate({
            where: { id: 1 },
            defaults: {
                id: 1,
                title: 'Default Test Job',
                projectId: 7695 // Reference the project seeded above
            }
        });
        console.log('Seeded default job.');

        // Person seeding block was moved up

        // Removed obsolete Person.update for job_id

        console.log('Jest Global Setup: Basic data seeding complete.');

        // Reset sequences after seeding
        console.log('Jest Global Setup: Resetting table sequences...');
        try {
            // Reset Jobs sequence
            const [jobMaxIdResult] = await db.sequelize.query("SELECT MAX(id) as maxid FROM \"Jobs\";");
            const jobNextId = (jobMaxIdResult[0]?.maxid || 0) + 1;
            await db.sequelize.query(`ALTER SEQUENCE "Jobs_id_seq" RESTART WITH ${jobNextId};`);
            console.log(`Reset "Jobs_id_seq" to start at ${jobNextId}`);

            // Reset Projects sequence
            const [projectMaxIdResult] = await db.sequelize.query("SELECT MAX(id) as maxid FROM \"Projects\";");
            const projectNextId = (projectMaxIdResult[0]?.maxid || 0) + 1;
            await db.sequelize.query(`ALTER SEQUENCE "Projects_id_seq" RESTART WITH ${projectNextId};`);
            console.log(`Reset "Projects_id_seq" to start at ${projectNextId}`);

            // Reset People sequence (assuming employee_id is serial/identity)
            // Note: Sequence name might differ if employee_id isn't the standard 'id' PK. Check DB if this fails.
            // Common pattern is TableName_ColumnName_seq
            const [personMaxIdResult] = await db.sequelize.query("SELECT MAX(employee_id) as maxid FROM \"People\";");
            const personNextId = (personMaxIdResult[0]?.maxid || 0) + 1;
            // Assuming sequence name follows pattern: People_employee_id_seq
            await db.sequelize.query(`ALTER SEQUENCE "People_employee_id_seq" RESTART WITH ${personNextId};`);
            console.log(`Reset "People_employee_id_seq" to start at ${personNextId}`);

            // Reset Tasks sequence
            const [taskMaxIdResult] = await db.sequelize.query("SELECT MAX(id) as maxid FROM \"Tasks\";");
            const taskNextId = (taskMaxIdResult[0]?.maxid || 0) + 1;
            await db.sequelize.query(`ALTER SEQUENCE "Tasks_id_seq" RESTART WITH ${taskNextId};`);
            console.log(`Reset "Tasks_id_seq" to start at ${taskNextId}`);

            console.log('Jest Global Setup: Sequences reset.');

        } catch (seqError) {
            console.error('Jest Global Setup: Error resetting sequences:', seqError);
            // Decide if this should be fatal
            // throw seqError;
        }

        await db.sequelize.close(); // Close app connection after seeding AND sequence reset
        console.log('Jest Global Setup: Seeding connection closed.');

    } catch (error) {
        console.error('Jest Global Setup Failed:', error);
        // Attempt to close connections if they exist
        if (migrationSequelize) {
            try { await migrationSequelize.close(); console.error('Jest Global Setup: Temporary migration instance closed after error.'); } catch (e) { console.error('Jest Global Setup: Failed to close temporary migration instance on error:', e); }
        }
        // Check if db and db.sequelize exist before trying to close
        if (db && db.sequelize) {
            try { await db.sequelize.close(); console.error('Jest Global Setup: Application DB connection closed after error.'); } catch (e) { console.error('Jest Global Setup: Failed to close application DB connection on error:', e); }
        }
        process.exit(1);
    }
};