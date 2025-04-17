// tests/test-helpers.js
const jwt = require('jsonwebtoken');

// JWT secret is now accessed via process.env.JWT_SECRET set in setup.js

// Helper function to generate a valid JWT for testing
const generateTestToken = (userId) => {
  // Use a real user ID from your test setup or seed data if necessary
  const payload = { id: userId, email: `user${userId}@test.com` }; 
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const db = require('../src/models'); // Need access to models

async function createTestProject({ ownerId = null } = {}) {
  // guarantee Status row
  const [status] = await db.Status.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, name: 'Test Status' }
  });

  // optional owner
  if (!ownerId) {
    const bcrypt = require('bcrypt');
    const owner = await db.Person.create({
      first_name: 'Proj', last_name: 'Owner',
      email: `proj.owner.${Date.now()}@example.com`,
      password: await bcrypt.hash('password', 10),
      is_active: true
    });
    ownerId = owner.employee_id;
  }

  const project = await db.Project.create({
    name: `Test Project ${Date.now()}`,
    status_id: status.id,
    created_by_user_id: ownerId
  });

  return { project, ownerId };
}

// Helper function to create a test job
async function createTestJob(jobData = {}) {
  // Ensure required fields have defaults if not provided
  const defaults = {
    title: `Test Job ${Date.now()}`,
    status: 'pending', // Default status
    // projectId is expected to be provided in jobData
  };

  // Merge provided data with defaults
  const dataToCreate = { ...defaults, ...jobData };

  if (!dataToCreate.projectId) {
    // If projectId is missing, we might need to create a default project first
    // Or throw an error, depending on requirements. Let's assume it's required for now.
    console.warn('createTestJob called without projectId. Creating a default project.');
    const { project } = await createTestProject(); // Use existing helper
    dataToCreate.projectId = project.id;
    console.log(`Created default project ${dataToCreate.projectId} for job.`);
  }

  try {
    const job = await db.Job.create(dataToCreate);
    console.log(`Test job ${job.id} created with title "${job.title}" for project ${job.projectId}`);
    return job;
  } catch (error) {
    console.error('Error creating test job:', error);
    throw error; // Re-throw the error to fail the test setup if job creation fails
  }
}


module.exports = {
  generateTestToken,
  createTestProject,
  createTestJob // Export the new helper
};
