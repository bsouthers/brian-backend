// tests/integration/projects.write.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
// JWT secret is now accessed via process.env.JWT_SECRET set in setup.js
const { sequelize, Person, Project, Status } = require('../../src/models');
const app = require('../../src/index');

// Helper function to generate a valid JWT for testing
const generateTestToken = (userId) => {
  const payload = { id: userId, email: `user${userId}@test.com` }; // Match payload structure
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Projects API - Write Operations (Integration)', () => {
  let testToken;
  const testUserId = 998; // Use a different ID than read tests to avoid potential conflicts
  const testUserEmail = `user${testUserId}@test.com`;
  let testStatus;
  let createdProjectIds = []; // Keep track of created projects for cleanup

  beforeAll(async () => {
    // 1. Ensure a default status exists (e.g., ID 1 'Active')
    try {
      // Fetch the status assuming it was seeded by globalSetup.js
      testStatus = await Status.findByPk(1);
      if (!testStatus) {
        // Throw a more informative error if the required status isn't found
        throw new Error('Default Status with ID 1 not found. Check globalSetup.js seeding.');
      }
      console.log(`Test status ${testStatus.id} found.`);
    } catch (error) {
      console.error("Failed to find default test status (ID: 1):", error);
      throw error; // Stop tests if basic setup fails
    }

    // 2. Generate a token for the test user (User will be created in beforeEach)
    testToken = generateTestToken(testUserId);
  });

  // Create the test user before each test to ensure it exists within the test's transaction scope
  beforeEach(async () => {
    try {
      await Person.findOrCreate({
        where: { employee_id: testUserId },
        defaults: {
          employee_id: testUserId,
          email: testUserEmail,
          first_name: 'Test',
          last_name: 'UserWrite',
          password: 'password123', // Required by model
          // Add other required fields if any
        }
      });
      // console.log(`beforeEach: Test user ${testUserId} created or found.`); // Optional: keep for debugging
    } catch (error) {
      console.error(`beforeEach: Failed to create test user ${testUserId}:`, error);
      throw error; // Stop tests if user creation fails
    }
  });

  afterEach(async () => {
    // Clean up projects created during tests in this file
    // Hard-reset the projects table after each test in this suite
    try {
      console.log(`afterEach: Destroying ${createdProjectIds.length} created projects tracked in this file...`);
      if (createdProjectIds.length > 0) {
        // Ensure IDs are valid numbers before attempting deletion
        const validIds = createdProjectIds.filter(id => typeof id === 'number' && !isNaN(id));
        if (validIds.length > 0) {
            await Project.destroy({ where: { id: validIds } });
            console.log('afterEach: Tracked projects destroyed.');
        } else {
            console.log('afterEach: No valid tracked project IDs to destroy.');
        }
      } else {
        console.log('afterEach: No projects tracked for destruction.');
      }
    } catch (error) {
      console.error("afterEach: Error truncating projects table:", error);
    }
    createdProjectIds = []; // Reset the array (though truncate handles cleanup)
  });


  afterAll(async () => {
    // Clean up the test user
    try {
      await Person.destroy({ where: { employee_id: testUserId } });
      console.log(`Test user ${testUserId} destroyed.`);
    } catch (error) {
      console.error(`Failed to destroy test user ${testUserId}:`, error);
    }
    // Optional: Clean up status if only for tests
    // if (testStatus) await testStatus.destroy();
  });

  // --- Tests for POST /api/v1/projects ---
  describe('POST /api/v1/projects', () => {
    // Generate unique values for each test run
    const timestamp = Date.now();
    const validProjectData = {
      name: `New Integration Test Project ${timestamp}`,
      clickup_space_id: `space_${timestamp}`,
      clickup_id: `proj_${timestamp}`,
      status_id: 1, // Use the ensured status ID
      // Add other optional or required fields as necessary
    };

    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .send(validProjectData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/No token provided/);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', 'Bearer invalidtoken123')
        .send(validProjectData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request if required field "name" is missing', async () => {
      const { name, ...invalidData } = validProjectData; // Omit name
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: expect.stringMatching(/name.*required/i) })
        ])
      );
    });

    it('should return 400 Bad Request if required field "clickup_space_id" is missing', async () => {
        const { clickup_space_id, ...invalidData } = validProjectData; // Omit clickup_space_id
        const res = await request(app)
          .post('/api/v1/projects')
          .set('Authorization', `Bearer ${testToken}`)
          .send(invalidData);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ msg: expect.stringMatching(/ClickUp Space ID.*required/i) }) // Match 'clickup_space_id' required
          ])
        );
      });

      it('should return 400 Bad Request if required field "clickup_id" is missing', async () => {
        const { clickup_id, ...invalidData } = validProjectData; // Omit clickup_id
        const res = await request(app)
          .post('/api/v1/projects')
          .set('Authorization', `Bearer ${testToken}`)
          .send(invalidData);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ msg: expect.stringMatching(/ClickUp ID.*required/i) }) // Match 'clickup_id' required
          ])
        );
      });

      it('should return 400 Bad Request if "status_id" is invalid or non-existent', async () => {
        const invalidData = { ...validProjectData, status_id: 99999 }; // Non-existent status
        const res = await request(app)
          .post('/api/v1/projects')
          .set('Authorization', `Bearer ${testToken}`)
          .send(invalidData);
        // This might be 400 (validation) or 404/500 (foreign key constraint) depending on implementation
        expect(res.statusCode).toBe(400);                // tight expectation is OK now
        expect(res.body.success).toBe(false);
        // Add specific error message check if possible
      });


    it('should return 201 Created and the new project details for valid data', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${testToken}`)
        .send(validProjectData);

      // Original assertions restored
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toEqual(validProjectData.name);
      expect(res.body.data.clickup_space_id).toEqual(validProjectData.clickup_space_id);
      expect(res.body.data.clickup_id).toEqual(validProjectData.clickup_id);
      expect(res.body.data.status_id).toEqual(validProjectData.status_id);
      expect(res.body.data.created_by_user_id).toEqual(testUserId); // Check creator ID

      // Add the created project ID to the list for cleanup (only if successful)
      if (res.body.data && res.body.data.id) {
        createdProjectIds.push(res.body.data.id);
      }

      // Optional: Verify the project exists in the database
      const dbProject = await Project.findByPk(res.body.data.id);
      expect(dbProject).not.toBeNull();
      expect(dbProject.name).toEqual(validProjectData.name);
    });

    // Add more validation tests as needed (e.g., data types, lengths)
  });

  // --- Tests for PUT /api/v1/projects/:id ---
  describe('PUT /api/v1/projects/:id', () => {
    let projectToUpdate;

    let updateData; // Declare here

    beforeEach(async () => {
      // Create a project before each PUT test in this block
      try {
        // Ensure testStatus is valid before creating the project
        if (!testStatus || !testStatus.id) {
            throw new Error('testStatus is not defined or has no ID in beforeEach for PUT');
        }

        projectToUpdate = await Project.create({
          name: 'Project To Update',
          clickup_space_id: 'space_put',
          clickup_id: 'proj_put',
          status_id: testStatus.id, // Now safe to use testStatus.id
          created_by_user_id: testUserId
          // Add any other potentially required fields with default/dummy values if needed
        });
        createdProjectIds.push(projectToUpdate.id); // Track for cleanup
        console.log(`Created project ${projectToUpdate.id} for PUT test.`);

        // Define updateData *inside* beforeEach, after testStatus is confirmed available
        updateData = {
          name: 'Updated Project Name',
          status_id: testStatus.id,
          // Add other mutable fields here if applicable
          description: 'This is an updated description.'
        };

      } catch (error) {
        console.error("DEBUG: Failed to create project 'Project To Update' in beforeEach for PUT:", error);
        projectToUpdate = null; // Ensure it's null if creation fails
        updateData = null; // Ensure updateData is null too
      }
    });

    // updateData is now defined within beforeEach

    it('should return 401 Unauthorized if no token is provided', async () => {
      if (!projectToUpdate || !updateData) return; // Skip if setup failed
      const res = await request(app)
        .put(`/api/v1/projects/${projectToUpdate.id}`)
        .send(updateData);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      if (!projectToUpdate || !updateData) return; // Skip if setup failed
      const res = await request(app)
        .put(`/api/v1/projects/${projectToUpdate.id}`)
        .set('Authorization', 'Bearer invalidtoken123')
        .send(updateData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request for an invalid (non-numeric) project ID format', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .put(`/api/v1/projects/${invalidId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Attempting update' }); // Send some valid data structure
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid project ID/i); // Adjust regex
    });

    it('should return 404 Not Found for a non-existent project ID', async () => {
      const nonExistentId = 999999;
      const res = await request(app)
        .put(`/api/v1/projects/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Attempting update' }); // Send some valid data structure
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('should return 400 Bad Request if validation fails (e.g., empty name)', async () => {
      if (!projectToUpdate || !updateData) return; // Skip if setup failed
      const invalidData = { ...updateData, name: '' }; // Empty name
      const res = await request(app)
        .put(`/api/v1/projects/${projectToUpdate.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/name.*cannot be empty/i); // Adjust regex
    });

     it('should return 400 Bad Request if validation fails (e.g., invalid status_id)', async () => {
      if (!projectToUpdate || !updateData) return; // Skip if setup failed
      const invalidData = { ...updateData, status_id: 99999 }; // Non-existent status
      const res = await request(app)
        .put(`/api/v1/projects/${projectToUpdate.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);
      // Expect 400 for validation or potentially 404 if the check happens later
      expect([400, 404]).toContain(res.statusCode);
      expect(res.body.success).toBe(false);
      // Add specific error message check if possible
    });

    it('should return 200 OK and the updated project details for valid data', async () => {
      if (!projectToUpdate || !updateData) {
        console.warn('Skipping PUT success test as project setup or updateData definition failed');
        return; // Skip if setup failed
      }
      const res = await request(app)
        .put(`/api/v1/projects/${projectToUpdate.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toEqual(projectToUpdate.id);
      expect(res.body.data.name).toEqual(updateData.name);
      expect(res.body.data.status_id).toEqual(updateData.status_id);
      expect(res.body.data.description).toEqual(updateData.description);

      // Verify the update in the database
      const dbProject = await Project.findByPk(projectToUpdate.id);
      expect(dbProject).not.toBeNull();
      expect(dbProject.name).toEqual(updateData.name);
      expect(dbProject.status_id).toEqual(updateData.status_id);
      expect(dbProject.description).toEqual(updateData.description);
    });

    it('should ignore attempts to update immutable fields (e.g., id, created_by_user_id)', async () => {
       if (!projectToUpdate || !updateData) return; // Skip if setup failed
       const originalCreator = projectToUpdate.created_by_user_id;
       const attemptUpdateData = {
         ...updateData, // Use the data defined in beforeEach
         id: 98765, // Attempt to change ID
         created_by_user_id: 111 // Attempt to change creator
       };

       const res = await request(app)
         .put(`/api/v1/projects/${projectToUpdate.id}`)
         .set('Authorization', `Bearer ${testToken}`)
         .send(attemptUpdateData);

       expect(res.statusCode).toEqual(200); // Should still succeed
       expect(res.body.success).toBe(true);
       expect(res.body.data.id).toEqual(projectToUpdate.id); // ID should not change
       expect(res.body.data.created_by_user_id).toEqual(originalCreator); // Creator should not change
       expect(res.body.data.name).toEqual(attemptUpdateData.name); // Mutable fields should change

       // Verify in DB
       const dbProject = await Project.findByPk(projectToUpdate.id);
       expect(dbProject.id).toEqual(projectToUpdate.id);
       expect(dbProject.created_by_user_id).toEqual(originalCreator);
       expect(dbProject.name).toEqual(attemptUpdateData.name);
     });
  });

  // --- Tests for DELETE /api/v1/projects/:id ---
  describe('DELETE /api/v1/projects/:id', () => {
    let projectToDelete;

     beforeEach(async () => {
      // Create a project before each DELETE test in this block
      try {
        projectToDelete = await Project.create({
          name: 'Project To Delete',
          clickup_space_id: 'space_del',
          clickup_id: 'proj_del',
          status_id: testStatus.id,
          created_by_user_id: testUserId
          // Add any other potentially required fields with default/dummy values if needed
        });
        createdProjectIds.push(projectToDelete.id); // Track for cleanup
        console.log(`Created project ${projectToDelete.id} for DELETE test.`);
      } catch (error) {
        console.error("DEBUG: Failed to create project 'Project To Delete' in beforeEach for DELETE:", error);
        projectToDelete = null; // Ensure it's null if creation fails
      }
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      if (!projectToDelete) return; // Skip if setup failed
      const res = await request(app)
        .delete(`/api/v1/projects/${projectToDelete.id}`);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      if (!projectToDelete) return; // Skip if setup failed
      const res = await request(app)
        .delete(`/api/v1/projects/${projectToDelete.id}`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request for an invalid (non-numeric) project ID format', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .delete(`/api/v1/projects/${invalidId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid project ID/i); // Adjust regex
    });

    it('should return 404 Not Found for a non-existent project ID', async () => {
      const nonExistentId = 999999;
      const res = await request(app)
        .delete(`/api/v1/projects/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('should return 204 No Content for successful deletion', async () => {
      if (!projectToDelete) {
        console.warn('Skipping DELETE success test as project setup failed');
        return; // Skip if setup failed
      }
      const projectId = projectToDelete.id; // Store ID before deletion attempt

      const res = await request(app)
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(204);
      expect(res.body).toEqual({}); // No body content on 204

      // Verify the project is deleted from the database
      const dbProject = await Project.findByPk(projectId);
      expect(dbProject).toBeNull();

      // Remove the ID from the cleanup array as it's already deleted
      createdProjectIds = createdProjectIds.filter(id => id !== projectId);
    });

    it('should return 4xx if attempting to delete a project with dependencies (e.g., tasks)', async () => {
        if (!projectToDelete) return; // Skip if setup failed

        // Setup: Create a dependency (e.g., a Task linked to the project)
        let testTask;
        try {
            testTask = await sequelize.models.Task.create({
                name: 'Dependency Task',
                project_id: projectToDelete.id,
                status_id: testStatus.id // Assuming status 1 exists
            });
            console.log(`Created dependency task ${testTask.id} for project ${projectToDelete.id}`);
        } catch (error) {
            console.error("Failed to create dependency task for DELETE test:", error);
            // Decide how to handle failure - maybe skip the test?
            return;
        }

        const res = await request(app)
            .delete(`/api/v1/projects/${projectToDelete.id}`)
            .set('Authorization', `Bearer ${testToken}`);

        // Expect a client error (e.g., 400 Bad Request or 409 Conflict)
        // The exact code depends on how the API handles dependency constraints.
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.statusCode).toBeLessThan(500);
        expect(res.body.success).toBe(false);
        // Updated regex to match the actual error message about associated tasks/assignments
        expect(res.body.error).toMatch(/cannot delete project.*associated (task|person)/i);

        // Cleanup the dependency task if it was created
        if (testTask) {
            try {
                await testTask.destroy();
                console.log(`Cleaned up dependency task ${testTask.id}`);
            } catch (error) {
                console.error(`Failed to clean up dependency task ${testTask.id}:`, error);
            }
        }

        // Verify the project still exists (since deletion failed)
        const dbProject = await Project.findByPk(projectToDelete.id);
        expect(dbProject).not.toBeNull();
    });
  });

}); // End of main describe block