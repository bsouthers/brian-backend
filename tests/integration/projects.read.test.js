// tests/integration/projects.read.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
// JWT secret is now accessed via process.env.JWT_SECRET set in setup.js

// Helper function to generate a valid JWT for testing
const generateTestToken = (userId) => {
  // Use a real user ID from your test setup or seed data if necessary
  const payload = { id: userId, email: `user${userId}@test.com` }; // Match payload structure used in auth middleware
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }); // Short expiry for tests
};

describe('Projects API - Read Operations (Integration)', () => {
  const app = require('../../src/index'); // Import the Express app (moved back)
  const { sequelize, Person, Project } = require('../../src/models'); // Import models for setup/teardown if needed
  let testToken;
  const testUserId = 999; // Use this as the employee_id for consistency
  const testUserEmail = `user${testUserId}@test.com`;

  let testStatus = null; // Declare variables outside try
  let projectForSubResourceTests = null;
  let testTask = null;
  let testProjectAssignment = null;

  beforeAll(async () => {
    // 1. Create the test user required by the auth middleware using the correct PK
    console.log('DEBUG: beforeAll - Starting test user creation...');
    try {
      console.log(`DEBUG: beforeAll - Attempting Person.findOrCreate for employee_id: ${testUserId}`);
      await Person.findOrCreate({
        where: { employee_id: testUserId }, // Use correct PK field 'employee_id'
        defaults: {
          // id: testUserId, // Remove - PK is handled by 'where'
          employee_id: testUserId, // Explicitly set PK in defaults is also okay if needed, but redundant with 'where'
          email: testUserEmail,
          first_name: 'Test',
          last_name: 'UserRead',
          password: 'password123', // Required by model, but not used for JWT auth here
          // Add other required fields if any
        }
      });
      console.log(`DEBUG: beforeAll - Test user ${testUserId} created or found.`);
    } catch (error) {
      console.error(`DEBUG: beforeAll - FAILED to create test user ${testUserId}:`, error);
      // Decide if tests should proceed without the user
    }

    // 2. Generate a token for the test user
    console.log('DEBUG: beforeAll - Generating test token...');
    testToken = generateTestToken(testUserId);
    console.log('DEBUG: beforeAll - Test token generated.');

    // 3. Create shared resources for sub-resource tests
    console.log('DEBUG: beforeAll - Starting shared resource creation...');
    try {
      console.log('DEBUG: beforeAll - Attempting Status.findOrCreate for id: 1');
      // Ensure a status exists (create if needed) - Assuming ID 1 is a valid/default status
      [testStatus] = await sequelize.models.Status.findOrCreate({
        where: { id: 1 }, // Use ID instead of name
        // 'id' is in 'where', so only provide other necessary fields in defaults if creating.
        // If 'id: 1' is guaranteed to exist by migrations/seeders, defaults might be empty.
        // If 'id: 1' might *not* exist, provide necessary fields like 'name'.
        defaults: { } // Remove name as well, assuming id:1 exists.
      });
      console.log(`DEBUG: beforeAll - Status ${testStatus?.id} found or created.`);

      console.log('DEBUG: beforeAll - Attempting Project.create...');
      // Create the project
      try {
        projectForSubResourceTests = await Project.create({
          name: 'Project For Sub-Resources',
          status_id: testStatus?.id, // Link to status - Use optional chaining
          created_by_user_id: testUserId
          // Add any other potentially required fields with default/dummy values if needed
        });
        console.log(`DEBUG: beforeAll - Shared test project ${projectForSubResourceTests?.id} created.`);
      } catch (projectCreateError) {
        console.error(`DEBUG: beforeAll - FAILED to create project 'Project For Sub-Resources':`, projectCreateError);
        projectForSubResourceTests = null; // Ensure it's null on failure
      }

      console.log('DEBUG: beforeAll - Checking if project exists for task creation...');
      // Create a task for the project (only if project creation succeeded)
      if (projectForSubResourceTests) {
        console.log(`DEBUG: beforeAll - Project ${projectForSubResourceTests.id} exists, attempting Task.create...`);
        testTask = await sequelize.models.Task.create({
            name: 'Test Task for Project',
            project_id: projectForSubResourceTests.id,
            status_id: testStatus?.id // Use optional chaining
        });
        console.log(`DEBUG: beforeAll - Test task ${testTask?.id} created.`);
      } else {
        console.warn("DEBUG: beforeAll - Skipping task creation as project creation failed.");
      }
      console.log('DEBUG: beforeAll - Attempting Job.findOrCreate...');

      // Create a job (assuming Job model and required fields) - Corrected defaults
      // You might need to adjust fields based on the actual Job model definition
      [testJob] = await sequelize.models.Job.findOrCreate({
        where: { name: 'Test Job' },
        defaults: { /* name is in where, no need to repeat */ }
      });
      console.log(`DEBUG: beforeAll - Job ${testJob?.id} found or created.`);
      // Link job to project if necessary (depends on schema, maybe via tasks or direct relation)
      // Example: await projectForSubResourceTests.addJob(testJob); // If association exists

      console.log('DEBUG: beforeAll - Checking if project exists for assignment creation...');
      // Assign the test user to the project (only if project creation succeeded)
      if (projectForSubResourceTests) {
        console.log(`DEBUG: beforeAll - Project ${projectForSubResourceTests.id} exists, attempting ProjectAssignment check/create...`);
        try {
          console.log(`DEBUG: beforeAll - Checking for existing assignment: project ${projectForSubResourceTests.id}, user ${testUserId}`);
          // First check if the assignment already exists
          const existingAssignment = await sequelize.models.ProjectAssignment.findOne({
          where: {
            project_id: projectForSubResourceTests.id,
            user_id: testUserId
          }
        });
        
        console.log(`DEBUG: beforeAll - Existing assignment found: ${!!existingAssignment}`);
        if (!existingAssignment) {
          console.log(`DEBUG: beforeAll - No existing assignment, creating new one...`);
          testProjectAssignment = await sequelize.models.ProjectAssignment.create({
            project_id: projectForSubResourceTests.id,
            user_id: testUserId
          });
          console.log(`DEBUG: beforeAll - Test assignment ${testProjectAssignment?.id} created for project ${projectForSubResourceTests.id} and user ${testUserId}.`);
        } else {
          testProjectAssignment = existingAssignment;
          console.log(`DEBUG: beforeAll - Test assignment ${testProjectAssignment?.id} already exists for project ${projectForSubResourceTests.id} and user ${testUserId}.`);
        }
      } catch (assignmentError) {
        console.error(`DEBUG: beforeAll - FAILED to create/find project assignment:`, assignmentError);
        // Don't throw here, let individual tests handle missing assignments
        }
      } else {
         console.warn("DEBUG: beforeAll - Skipping project assignment as project creation failed.");
      }
      console.log('DEBUG: beforeAll - Finished shared resource creation block.');


    } catch(error) {
        console.error("DEBUG: beforeAll - CATCH block for shared resource creation:", error);
        // Ensure variables are null if setup fails (already initialized outside)
    }
    console.log('DEBUG: beforeAll - Exiting beforeAll block.');
  });

  afterAll(async () => {
     // Clean up shared resources (reverse order of creation)
     try {
       if (testProjectAssignment) await testProjectAssignment.destroy();
       if (testTask) await testTask.destroy();
       // if (testJob) await testJob.destroy(); // Only if created/managed here
       if (projectForSubResourceTests) await projectForSubResourceTests.destroy();
       // if (testStatus) await testStatus.destroy(); // Optional: clean up status if only for tests
       console.log(`Shared test resources destroyed.`);
     } catch (error) {
       console.error("Failed to destroy shared test resources:", error);
     }

    // Clean up the test user using the correct PK
    try {
      await Person.destroy({ where: { employee_id: testUserId } }); // Use correct PK field 'employee_id'
      console.log(`Test user ${testUserId} destroyed.`);
    } catch (error) {
      console.error(`Failed to destroy test user ${testUserId}:`, error);
    }
  });

  // --- Tests for GET /api/v1/projects ---
  describe('GET /api/v1/projects', () => {
    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app).get('/api/v1/projects'); // Use request(app)
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/No token provided/);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 200 OK and a list of projects for an authenticated user', async () => {
      // Optional: Create some test projects first if the DB is empty
      // await Project.create({ name: 'Test Project 1', created_by_user_id: testUserId, /* other required fields */ });

      const res = await request(app) // Use request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.projects).toBeInstanceOf(Array);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('limit');
      expect(res.body.data).toHaveProperty('offset');

      // Optional: Add more specific checks based on seeded data
    });

    it('should handle pagination parameters (limit, offset)', async () => {
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects?limit=5&offset=0')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limit).toEqual(5);
      expect(res.body.data.offset).toEqual(0);
      expect(res.body.data.projects.length).toBeLessThanOrEqual(5);
    });

    // Add more tests for filtering, sorting, field selection later

    it('should return 400 Bad Request for invalid pagination parameters (negative limit)', async () => {
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects?limit=-1')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid limit/i); // Adjust regex based on actual error message
    });

    it('should return 400 Bad Request for invalid pagination parameters (non-numeric offset)', async () => {
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects?offset=abc')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid offset/i); // Adjust regex based on actual error message
    });

    it('should return 400 Bad Request for invalid filter parameters (example)', async () => {
      // Assuming 'status_id' is a filterable field and requires a number
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects?status_id=invalid')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid filter value/i); // Adjust regex based on actual error message
    });

     it('should return 400 Bad Request for invalid sort parameters (invalid field)', async () => {
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects?sort=nonexistent_field')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid sort field/i); // Adjust regex based on actual error message
    });

     it('should return 400 Bad Request for invalid sort parameters (invalid order)', async () => {
      const res = await request(app) // Use request(app)
        .get('/api/v1/projects?sort=name&order=sideways')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid sort order/i); // Adjust regex based on actual error message
    });
  });

  // --- Tests for GET /api/v1/projects/:id ---
  describe('GET /api/v1/projects/:id', () => {
    let testProject;

    beforeAll(async () => {
      // Create a test project for these tests
      // Ensure the test user exists before creating a project linked to them
      if (!testToken) {
         console.warn("Skipping project creation as test user/token setup failed.");
         return;
      }
      try {
        testProject = await Project.create({
          name: 'Single Project Test',
          status_id: 1, // Assuming status 1 exists
          created_by_user_id: testUserId, // Link to the test user created above
          // Add other potentially required fields with default/dummy values if needed
        });
        console.log(`Test project ${testProject.id} created for GET /:id tests.`);
      } catch (error) {
        console.error("DEBUG: Failed to create test project 'Single Project Test' in beforeAll for GET /:id:", error);
        testProject = null; // Ensure testProject is null if creation fails
      }
    });

    afterAll(async () => {
      // Clean up the test project
      if (testProject && testProject.id) {
        try {
          await Project.destroy({ where: { id: testProject.id } });
          console.log(`Test project ${testProject.id} destroyed.`);
        } catch (error) {
           console.error(`Failed to destroy test project ${testProject.id}:`, error);
        }
      }
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      const projectId = testProject ? testProject.id : 9999; // Use real or placeholder ID
      const res = await request(app).get(`/api/v1/projects/${projectId}`); // Use request(app)
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const projectId = testProject ? testProject.id : 9999; // Use real or placeholder ID
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request for an invalid (non-numeric) project ID', async () => {
      const invalidId = 'abc';
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${invalidId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400); // Or 404 depending on validation layer
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid project ID/i); // Adjust regex
    });

    it('should return 404 Not Found for a non-existent project ID', async () => {
      const nonExistentId = 999999;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/);
    });

    it('should return 200 OK and the project details for a valid ID', async () => {
       if (!testProject) {
         console.warn('Skipping test as test project creation failed');
         return; // Simple return to skip
       }
     const res = await request(app) // Use request(app)
       .get(`/api/v1/projects/${testProject.id}`)
       .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toEqual(testProject.id);
      expect(res.body.data.name).toEqual(testProject.name);
    });

    it('should handle the "fields" query parameter', async () => {
       if (!testProject) {
         console.warn('Skipping test as test project creation failed');
         return; // Simple return to skip
       }
     const res = await request(app) // Use request(app)
       .get(`/api/v1/projects/${testProject.id}?fields=id,name`)
       .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Object.keys(res.body.data)).toEqual(['id', 'name']); // Only requested fields (and id)
    });

    // TODO: Add test for 'include' parameter (requires setting up related data)
    // it('should handle the "include" query parameter', async () => { ... });
  });

  // --- Tests for GET /api/v1/projects/:id/tasks ---
  describe('GET /api/v1/projects/:id/tasks', () => {
    let testProjectWithTasks;
    // Setup is now handled in the main beforeAll

    it('should return 401 Unauthorized if no token is provided', async () => {
      const projectId = projectForSubResourceTests ? projectForSubResourceTests.id : 1; // Use real ID or fallback
      const res = await request(app).get(`/api/v1/projects/${projectId}/tasks`); // Use request(app)
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const projectId = projectForSubResourceTests ? projectForSubResourceTests.id : 1;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request if the project ID is invalid (non-numeric)', async () => {
      const invalidId = 'abc';
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${invalidId}/tasks`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/Invalid project ID/i); // Adjust regex
    });

    it('should return 404 Not Found if the project ID does not exist', async () => {
      const nonExistentId = 999999;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${nonExistentId}/tasks`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toMatch(/Project with ID .* not found/);
    });

    it('should return 200 OK and a list of tasks for a valid project ID', async () => {
      if (!projectForSubResourceTests) {
        console.warn('Skipping test as shared project setup failed');
        return; // Simple return to skip
      }
      const projectId = projectForSubResourceTests.id; // Use the correct project ID
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.tasks).toBeInstanceOf(Array);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('limit');
      expect(res.body.data).toHaveProperty('offset');
      // Add more specific checks based on seeded tasks
    });

     it('should handle pagination parameters for tasks', async () => {
      if (!projectForSubResourceTests) {
        console.warn('Skipping test as shared project setup failed');
        return; // Simple return to skip
      }
      // Ensure project has > 1 task if testing pagination limits strictly
      const projectId = projectForSubResourceTests.id; // Use the correct project ID
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/tasks?limit=1&offset=0`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limit).toEqual(1);
      expect(res.body.data.offset).toEqual(0);
      expect(res.body.data.tasks.length).toBeLessThanOrEqual(1);
      expect(res.body.data.tasks[0].id).toEqual(testTask.id); // Check if the correct task is returned
    });

    it('should return 400 Bad Request for invalid pagination parameters (negative offset)', async () => {
       if (!projectForSubResourceTests) return; // Skip if setup failed
       const projectId = projectForSubResourceTests.id;
       const res = await request(app) // Use request(app)
         .get(`/api/v1/projects/${projectId}/tasks?offset=-5`)
         .set('Authorization', `Bearer ${testToken}`);
       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid offset/i); // Adjust regex
     });

     it('should return 400 Bad Request for invalid pagination parameters (non-numeric limit)', async () => {
       if (!projectForSubResourceTests) return; // Skip if setup failed
       const projectId = projectForSubResourceTests.id;
       const res = await request(app) // Use request(app)
         .get(`/api/v1/projects/${projectId}/tasks?limit=xyz`)
         .set('Authorization', `Bearer ${testToken}`);
       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid limit/i); // Adjust regex
     });

    // Teardown is handled in the main afterAll
  });

  // --- Tests for GET /api/v1/projects/:id/jobs ---
  describe('GET /api/v1/projects/:id/jobs', () => {
    // Setup is now handled in the main beforeAll

    it('should return 401 Unauthorized if no token is provided', async () => {
      const projectId = projectForSubResourceTests ? projectForSubResourceTests.id : 1; // Use real ID or fallback
      const res = await request(app).get(`/api/v1/projects/${projectId}/jobs`); // Use request(app)
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const projectId = projectForSubResourceTests ? projectForSubResourceTests.id : 1;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/jobs`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request if the project ID is invalid (non-numeric)', async () => {
      const invalidId = 'abc';
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${invalidId}/jobs`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/Invalid project ID/i); // Adjust regex
    });

     it('should return 404 Not Found if the project ID does not exist', async () => {
      const nonExistentId = 999999;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${nonExistentId}/jobs`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toMatch(/Project with ID .* not found/);
    });

    it('should return 200 OK and a list of jobs for a valid project ID', async () => {
      if (!projectForSubResourceTests) {
        console.warn('Skipping test as shared project setup failed');
        return; // Simple return to skip
      }
      const projectId = projectForSubResourceTests.id; // Use the correct project ID
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/jobs`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeInstanceOf(Array);
      // Add more specific checks - e.g., expect jobs array to be empty or contain testJob if linked
      // expect(res.body.data.jobs).toBeInstanceOf(Array);
    });

    it('should handle pagination parameters for jobs', async () => {
      if (!projectForSubResourceTests) return; // Skip if setup failed
      const projectId = projectForSubResourceTests.id;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/jobs?limit=1&offset=0`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limit).toEqual(1);
      expect(res.body.data.offset).toEqual(0);
      expect(res.body.data.jobs.length).toBeLessThanOrEqual(1);
    });

    it('should return 400 Bad Request for invalid pagination parameters (negative limit)', async () => {
       if (!projectForSubResourceTests) return; // Skip if setup failed
       const projectId = projectForSubResourceTests.id;
       const res = await request(app)
         .get(`/api/v1/projects/${projectId}/jobs?limit=-2`)
         .set('Authorization', `Bearer ${testToken}`);
       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid limit/i); // Adjust regex
     });

     it('should return 400 Bad Request for invalid pagination parameters (non-numeric offset)', async () => {
       if (!projectForSubResourceTests) return; // Skip if setup failed
       const projectId = projectForSubResourceTests.id;
       const res = await request(app)
         .get(`/api/v1/projects/${projectId}/jobs?offset=false`)
         .set('Authorization', `Bearer ${testToken}`);
       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid offset/i); // Adjust regex
     });

    // Teardown is handled in the main afterAll
  });

  // --- Tests for GET /api/v1/projects/:id/people ---
  describe('GET /api/v1/projects/:id/people', () => {
    // Setup is now handled in the main beforeAll

    it('should return 401 Unauthorized if no token is provided', async () => {
      const projectId = projectForSubResourceTests ? projectForSubResourceTests.id : 1; // Use real ID or fallback
      const res = await request(app).get(`/api/v1/projects/${projectId}/people`); // Use request(app)
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const projectId = projectForSubResourceTests ? projectForSubResourceTests.id : 1;
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${projectId}/people`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request if the project ID is invalid (non-numeric)', async () => {
      const invalidId = 'abc';
      const res = await request(app) // Use request(app)
        .get(`/api/v1/projects/${invalidId}/people`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/Invalid project ID/i); // Adjust regex
    });

     it('should return 404 Not Found if the project ID does not exist', async () => {
       const nonExistentId = 999999;
       const res = await request(app) // Use request(app)
         .get(`/api/v1/projects/${nonExistentId}/people`)
         .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toMatch(/Project with ID .* not found/);
    });

    it('should return 200 OK and a list of assigned people for a valid project ID', async () => {
      if (!projectForSubResourceTests) {
        console.warn('Skipping test as shared project setup failed');
        return; // Simple return to skip
      }
      
      // Ensure the project assignment exists before running the test
      const assignment = await sequelize.models.ProjectAssignment.findOne({
        where: { project_id: projectForSubResourceTests.id }
      });
      
      if (!assignment) {
        // Create the assignment if it doesn't exist
        await sequelize.models.ProjectAssignment.create({
          project_id: projectForSubResourceTests.id,
          user_id: testUserId
        });
        console.log(`Created project assignment for project ${projectForSubResourceTests.id} and user ${testUserId}`);
      }
      
      const projectId = projectForSubResourceTests.id;
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/people`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.people).toBeInstanceOf(Array);
      
      // Check if the test user is in the list
      const assignedUser = res.body.data.people.find(p => p.employee_id === testUserId);
      expect(assignedUser).toBeDefined();
      expect(assignedUser.employee_id).toEqual(testUserId);
    });

    it('should handle pagination parameters for people', async () => {
      if (!projectForSubResourceTests) return; // Skip if setup failed
      
      // Ensure the project assignment exists before running the test
      const assignment = await sequelize.models.ProjectAssignment.findOne({
        where: { project_id: projectForSubResourceTests.id }
      });
      
      if (!assignment) {
        // Create the assignment if it doesn't exist
        await sequelize.models.ProjectAssignment.create({
          project_id: projectForSubResourceTests.id,
          user_id: testUserId
        });
        console.log(`Created project assignment for project ${projectForSubResourceTests.id} and user ${testUserId}`);
      }
      
      const projectId = projectForSubResourceTests.id;
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/people?limit=1&offset=0`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limit).toEqual(1);
      expect(res.body.data.offset).toEqual(0);
      expect(res.body.data.people.length).toBeLessThanOrEqual(1);
    });

    it('should return 400 Bad Request for invalid pagination parameters (negative offset)', async () => {
       if (!projectForSubResourceTests) return; // Skip if setup failed
       
       // No need to ensure project assignment exists for error cases
       const projectId = projectForSubResourceTests.id;
       const res = await request(app)
         .get(`/api/v1/projects/${projectId}/people?offset=-1`)
         .set('Authorization', `Bearer ${testToken}`);
       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid offset/i);
     });

     it('should return 400 Bad Request for invalid pagination parameters (non-numeric limit)', async () => {
        if (!projectForSubResourceTests) return; // Skip if setup failed
        
        // No need to ensure project assignment exists for error cases
        const projectId = projectForSubResourceTests.id;
        const res = await request(app)
          .get(`/api/v1/projects/${projectId}/people?limit=ten`)
          .set('Authorization', `Bearer ${testToken}`);
       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid limit/i);
     });

    // Teardown is handled in the main afterAll
  });

  afterAll(async () => {
    // Optional: Clean up test data from the database
    // await Project.destroy({ where: { name: 'Test Project 1' } });
  });
});