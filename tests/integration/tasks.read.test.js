// tests/integration/tasks.read.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
// JWT secret is now accessed via process.env.JWT_SECRET set in setup.js

// Helper function to generate a valid JWT for testing
const generateTestToken = (userId) => {
  const payload = { id: userId, email: `user${userId}@test.com` }; // Match payload structure
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Tasks API - Read Operations (Integration)', () => {
  const app = require('../../src/index'); // Import the Express app
  const { sequelize, Person, Project, Task, Status, TaskAssignment } = require('../../src/models'); // Import necessary models
  let testToken;
  const testUserId = 998; // Use a different ID than project tests to avoid conflicts
  const testUserEmail = `user${testUserId}@test.com`;
  let testProject;
  let testStatus;
  let testTask1;
  let testTask2;
  let anotherTestUserId = 997; // For assignment tests

  beforeAll(async () => {
    // 1. Create test users
    try {
      await Person.findOrCreate({
        where: { employee_id: testUserId },
        defaults: { employee_id: testUserId, email: testUserEmail, first_name: 'Test', last_name: 'UserTaskRead', password: 'password123' }
      });
      await Person.findOrCreate({
        where: { employee_id: anotherTestUserId },
        defaults: { employee_id: anotherTestUserId, email: `user${anotherTestUserId}@test.com`, first_name: 'Another', last_name: 'TestUser', password: 'password123' }
      });
      console.log(`Test users ${testUserId} and ${anotherTestUserId} created or found.`);
    } catch (error) {
      console.error(`Failed to create test users:`, error);
      throw error; // Stop tests if users can't be created
    }

    // 2. Generate token for the main test user
    testToken = generateTestToken(testUserId);

    // 3. Create shared resources (Status, Project, Tasks, Assignment)
    try {
      // Ensure a status exists (e.g., ID 1 'Open')
      [testStatus] = await Status.findOrCreate({
        where: { id: 1 },
        defaults: { name: 'Open' } // Provide name if it might not exist
      });

      // Create a project to associate tasks with
      testProject = await Project.create({
        name: 'Task Test Project',
        status_id: testStatus.id,
        created_by_user_id: testUserId
      });
      console.log(`Test project ${testProject.id} created.`);

      // Create tasks for testing list retrieval, filtering, etc.
      testTask1 = await Task.create({
        name: 'Task Alpha',
        project_id: testProject.id,
        status_id: testStatus.id,
        created_by_user_id: testUserId
      });
      testTask2 = await Task.create({
        name: 'Task Beta',
        project_id: testProject.id,
        status_id: testStatus.id, // Same status initially
        created_by_user_id: testUserId
      });
      console.log(`Test tasks ${testTask1.id} and ${testTask2.id} created.`);

      // Assign a user to testTask1 for filtering/include tests
      await TaskAssignment.create({
        task_id: testTask1.id,
        employee_id: anotherTestUserId // FIX: Use correct column name 'employee_id'
      });
      console.log(`User ${anotherTestUserId} assigned to task ${testTask1.id}.`);

    } catch(error) {
        console.error("Failed to create shared test resources for tasks:", error);
        // Clean up potentially created resources if error occurs mid-setup
        if (testTask1) await testTask1.destroy();
        if (testTask2) await testTask2.destroy();
        if (testProject) await testProject.destroy();
        // Don't destroy users here, handled in afterAll
        throw error; // Stop tests if setup fails
    }
  });

  afterAll(async () => {
     // Clean up shared resources (reverse order of creation)
     try {
       await TaskAssignment.destroy({ where: { task_id: [testTask1?.id, testTask2?.id].filter(Boolean) }});
       if (testTask1) await testTask1.destroy();
       if (testTask2) await testTask2.destroy();
       if (testProject) await testProject.destroy();
       // Optional: Clean up status if only for tests
       // if (testStatus) await testStatus.destroy();
       console.log(`Shared task test resources destroyed.`);
     } catch (error) {
       console.error("Failed to destroy shared task test resources:", error);
     }

    // Clean up test users
    try {
      await Person.destroy({ where: { employee_id: [testUserId, anotherTestUserId] } });
      console.log(`Test users ${testUserId} and ${anotherTestUserId} destroyed.`);
    } catch (error) {
      console.error(`Failed to destroy test users:`, error);
    }
  });

  // --- Tests for GET /api/v1/tasks ---
  describe('GET /api/v1/tasks', () => {
    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app).get('/api/v1/tasks');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/No token provided/);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 200 OK and a list of tasks for an authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.tasks).toBeInstanceOf(Array);
      expect(res.body.data.tasks.length).toBeGreaterThanOrEqual(2); // Should include testTask1 & testTask2
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('limit');
      expect(res.body.data).toHaveProperty('offset');
    });

    it('should handle pagination parameters (limit, offset)', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?limit=1&offset=0')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limit).toEqual(1);
      expect(res.body.data.offset).toEqual(0);
      expect(res.body.data.tasks.length).toBeLessThanOrEqual(1);
    });

    it('should filter tasks by project_id', async () => {
        const res = await request(app)
          .get(`/api/v1/tasks?project_id=${testProject.id}`)
          .set('Authorization', `Bearer ${testToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.tasks).toBeInstanceOf(Array);
        res.body.data.tasks.forEach(task => {
          expect(task.project_id).toEqual(testProject.id);
        });
        // Check if our specific tasks are present
        const taskIds = res.body.data.tasks.map(t => t.id);
        expect(taskIds).toContain(testTask1.id);
        expect(taskIds).toContain(testTask2.id);
    });

     it('should filter tasks by status_id', async () => {
        const res = await request(app)
          .get(`/api/v1/tasks?status_id=${testStatus.id}`)
          .set('Authorization', `Bearer ${testToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.tasks).toBeInstanceOf(Array);
        res.body.data.tasks.forEach(task => {
          expect(task.status_id).toEqual(testStatus.id);
        });
     });

     it('should filter tasks by assigned_user_id', async () => {
        const res = await request(app)
          .get(`/api/v1/tasks?assigned_user_id=${anotherTestUserId}`)
          .set('Authorization', `Bearer ${testToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.tasks).toBeInstanceOf(Array);
        expect(res.body.data.tasks.length).toBeGreaterThanOrEqual(1); // At least testTask1
        const taskIds = res.body.data.tasks.map(t => t.id);
        expect(taskIds).toContain(testTask1.id); // testTask1 was assigned
        expect(taskIds).not.toContain(testTask2.id); // testTask2 was not assigned
     });

    it('should sort tasks by name ascending', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?sort=name&order=asc')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      const tasks = res.body.data.tasks;
      // Find our test tasks within the potentially larger list
      const task1Index = tasks.findIndex(t => t.id === testTask1.id);
      const task2Index = tasks.findIndex(t => t.id === testTask2.id);
      if (task1Index !== -1 && task2Index !== -1) {
          // Only compare if both tasks are in the result set (respecting pagination)
          expect(tasks[task1Index].name).toBe('Task Alpha');
          expect(tasks[task2Index].name).toBe('Task Beta');
          expect(task1Index).toBeLessThan(task2Index); // Alpha comes before Beta
      }
    });

     it('should sort tasks by name descending', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?sort=name:desc') // <-- Fix: Use colon format
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      const tasks = res.body.data.tasks;
      const task1Index = tasks.findIndex(t => t.id === testTask1.id);
      const task2Index = tasks.findIndex(t => t.id === testTask2.id);
       if (task1Index !== -1 && task2Index !== -1) {
          expect(tasks[task1Index].name).toBe('Task Alpha');
          expect(tasks[task2Index].name).toBe('Task Beta');
          expect(task2Index).toBeLessThan(task1Index); // Beta comes before Alpha
       }
    });

    it('should return 400 Bad Request for invalid pagination parameters (negative limit)', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?limit=-1')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid limit/i);
    });

    it('should return 400 Bad Request for invalid filter parameters (non-numeric project_id)', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?project_id=abc')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      // Revert change from previous step, expect specific message from route validation
      expect(res.body.error).toMatch(/Invalid project_id filter value/i);
    });

     it('should return 400 Bad Request for invalid sort parameters (invalid field)', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?sort=nonexistent_field')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid sort field/i);
    });

     it('should return 400 Bad Request for invalid sort parameters (invalid order)', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?sort=name&order=upwards')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid sort order/i);
    });
  });

  // --- Tests for GET /api/v1/tasks/:id ---
  describe('GET /api/v1/tasks/:id', () => {
    // testTask1 is created in the outer beforeAll

    it('should return 401 Unauthorized if no token is provided', async () => {
      const taskId = testTask1 ? testTask1.id : 9999; // Use real or placeholder ID
      const res = await request(app).get(`/api/v1/tasks/${taskId}`);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const taskId = testTask1 ? testTask1.id : 9999;
      const res = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request for an invalid (non-numeric) task ID', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .get(`/api/v1/tasks/${invalidId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      // Check the specific error message within the errors array
      expect(res.body.errors[0].msg).toMatch(/Invalid task ID/i);
    });

    it('should return 404 Not Found for a non-existent task ID', async () => {
      const nonExistentId = 999999;
      const res = await request(app)
        .get(`/api/v1/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('should return 200 OK and the task details for a valid ID', async () => {
       if (!testTask1) {
         console.warn('Skipping test as test task1 creation failed');
         return;
       }
     const res = await request(app)
       .get(`/api/v1/tasks/${testTask1.id}`)
       .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toEqual(testTask1.id);
      expect(res.body.data.name).toEqual(testTask1.name);
      expect(res.body.data.project_id).toEqual(testProject.id);
    });

    it('should include the associated project when requested', async () => {
       if (!testTask1) return; // Skip if setup failed
       const res = await request(app)
         .get(`/api/v1/tasks/${testTask1.id}?include=project`)
         .set('Authorization', `Bearer ${testToken}`);

       expect(res.statusCode).toEqual(200);
       expect(res.body.success).toBe(true);
       expect(res.body.data).toBeDefined();
       expect(res.body.data.id).toEqual(testTask1.id);
       expect(res.body.data.Project).toBeDefined(); // Sequelize uses uppercase model name by default
       expect(res.body.data.Project.id).toEqual(testProject.id);
       expect(res.body.data.Project.name).toEqual(testProject.name);
    });

     it('should include the associated assignees when requested', async () => {
       if (!testTask1) return; // Skip if setup failed
       const res = await request(app)
         .get(`/api/v1/tasks/${testTask1.id}?include=assignees`)
         .set('Authorization', `Bearer ${testToken}`);

       expect(res.statusCode).toEqual(200);
       expect(res.body.success).toBe(true);
       expect(res.body.data).toBeDefined();
       expect(res.body.data.id).toEqual(testTask1.id);
       expect(res.body.data.Assignees).toBeInstanceOf(Array); // Sequelize uses uppercase model name pluralized
       expect(res.body.data.Assignees.length).toBeGreaterThanOrEqual(1);
       expect(res.body.data.Assignees[0].employee_id).toEqual(anotherTestUserId); // Check assigned user ID
       // Check that sensitive info like password is not included
       expect(res.body.data.Assignees[0].password).toBeUndefined();
    });

     it('should include both project and assignees when requested', async () => {
       if (!testTask1) return; // Skip if setup failed
       const res = await request(app)
         .get(`/api/v1/tasks/${testTask1.id}?include=project,assignees`)
         .set('Authorization', `Bearer ${testToken}`);

       expect(res.statusCode).toEqual(200);
       expect(res.body.success).toBe(true);
       expect(res.body.data).toBeDefined();
       expect(res.body.data.id).toEqual(testTask1.id);
       expect(res.body.data.Project).toBeDefined();
       expect(res.body.data.Project.id).toEqual(testProject.id);
       expect(res.body.data.Assignees).toBeInstanceOf(Array);
       expect(res.body.data.Assignees.length).toBeGreaterThanOrEqual(1);
       expect(res.body.data.Assignees[0].employee_id).toEqual(anotherTestUserId);
    });

     it('should return 400 Bad Request for invalid include parameter', async () => {
       if (!testTask1) return; // Skip if setup failed
       const res = await request(app)
         .get(`/api/v1/tasks/${testTask1.id}?include=nonexistent_relation`)
         .set('Authorization', `Bearer ${testToken}`);

       expect(res.statusCode).toEqual(400);
       expect(res.body.success).toBe(false);
       expect(res.body.error).toMatch(/Invalid include parameter/i); // Adjust regex based on actual error
    });
  });
});