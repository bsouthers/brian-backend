const { Client } = require('pg');

// Database connection details - use environment variables or defaults
const dbConfig = {
  user: process.env.PGUSER || 'postgres', // Default user to connect for setup
  host: process.env.PGHOST || '127.0.0.1',
  database: process.env.PGDATABASE || 'postgres', // Connect to default db for setup
  password: process.env.PGPASSWORD || undefined, // Use password if provided
  port: process.env.PGPORT || 5432,
};

// Target role and database details
const targetRole = 'ci';
const targetPassword = 'ci';
const targetDatabase = 'ci_db';

async function setupDatabase() {
  const client = new Client(dbConfig);
  console.log(`Attempting to connect to PostgreSQL as user '${dbConfig.user}' on host '${dbConfig.host}'...`);

  try {
    await client.connect();
    console.log('Connected successfully.');

    // Check if role exists
    const roleRes = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [targetRole]);
    if (roleRes.rowCount === 0) {
      console.log(`Role '${targetRole}' does not exist. Creating...`);
      await client.query(`CREATE ROLE ${targetRole} LOGIN PASSWORD '${targetPassword}'`);
      console.log(`Role '${targetRole}' created successfully.`);
    } else {
      console.log(`Role '${targetRole}' already exists.`);
    }

    // Check if database exists
    const dbRes = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDatabase]);
    if (dbRes.rowCount === 0) {
      console.log(`Database '${targetDatabase}' does not exist. Creating...`);
      // Important: Use template0 to avoid potential connection issues if template1 is corrupt or has restrictions
      await client.query(`CREATE DATABASE ${targetDatabase} OWNER ${targetRole} TEMPLATE template0`);
      console.log(`Database '${targetDatabase}' created successfully and owned by '${targetRole}'.`);
    } else {
      console.log(`Database '${targetDatabase}' already exists.`);
    }

  } catch (err) {
    console.error('Database setup failed:', err);
    process.exit(1); // Exit with error code
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

setupDatabase();