// tests/test-helpers.js
const jwt = require('jsonwebtoken');

// JWT secret is now accessed via process.env.JWT_SECRET set in setup.js

// generateTestToken moved to authTestHelper.js to avoid circular dependency
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


// Helper function to create a test task
async function createTestTask(taskData = {}) {
  // Ensure required fields have defaults or are provided
  const defaults = {
    name: `Test Task ${Date.now()}`, // Use 'name' based on POST test
    description: 'Default task description', // Add description
    status_id: 1, // Default status ID
    // project_id is expected to be provided in taskData (snake_case)
  };

  // Merge provided data with defaults, ensuring snake_case for DB fields
  const dataToCreate = {
      name: taskData.name || defaults.name,
      description: taskData.description || defaults.description,
      status_id: taskData.statusId || taskData.status_id || defaults.status_id, // Allow camelCase or snake_case input
      project_id: taskData.projectId || taskData.project_id // Allow camelCase or snake_case input
  };


  if (!dataToCreate.project_id) {
    console.error('createTestTask called without project_id.');
    throw new Error('createTestTask requires a project_id');
  }
  if (!dataToCreate.status_id) {
      console.error('createTestTask called without status_id.');
      throw new Error('createTestTask requires a status_id');
  }

  try {
    // Use db.Task model to create the task
    const task = await db.Task.create(dataToCreate);
    console.log(`Test task ${task.id} created with name "${task.name}" for project ${task.project_id}`);
    return task;
  } catch (error) {
    console.error('Error creating test task:', error);
    throw error;
  }
}

module.exports = {
  createTestProject,
  createTestJob, // Export the new helper
  createTestTask // Export the task helper
};
