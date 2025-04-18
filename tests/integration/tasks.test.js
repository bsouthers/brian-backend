// C:\Apps\Brian\tests\integration\tasks.test.js
const request = require('supertest');
const app = require('../../src/index'); // Correct path to the exported app instance
// Removed incorrect import of syncDB, clearDB, closeDB
const { generateToken, createTestUser } = require('../helpers/authTestHelper'); // Get token and user creator from here
const { createTestProject, createTestJob, createTestTask } = require('../test-helpers'); // Get project, job, and task creators from here
const { Task } = require('../../src/models'); // Import Task model for clearing

describe('Tasks API - /api/v1/tasks', () => {
  let token;
  let testUser;
  let testProject;
  let testJob;
  let task1, task2;

  beforeAll(async () => {
    // syncDB is handled by globalSetup
    const userResult = await createTestUser({ email: 'task-test@example.com', password: 'password123', role: 'admin' });
    testUser = userResult.user; // Get the user object from the helper result
    token = userResult.token; // Get the token from the helper result
    const projectResult = await createTestProject({ name: 'Task Test Project', ownerId: testUser.employee_id }); // Pass ownerId
    testProject = projectResult.project; // Get the project object
    testJob = await createTestJob({ name: 'Task Test Job', projectId: testProject.id });

    // Ensure required Statuses exist for tests
    const { Status } = require('../../src/models'); // Import Status model
    await Status.findOrCreate({ where: { id: 1 }, defaults: { id: 1, name: 'Test Status 1' } });
    await Status.findOrCreate({ where: { id: 2 }, defaults: { id: 2, name: 'Test Status 2' } });
  });

  beforeEach(async () => {
    // Clear only Task table before each test using the model
    await Task.destroy({ where: {} }); // Simpler delete all rows, avoids potential TRUNCATE issues
    // Seed necessary data for each test, providing projectId
    task1 = await createTestTask({ description: 'First Task', projectId: testProject.id, statusId: 1 }); // Pass projectId
    task2 = await createTestTask({ description: 'Second Task', projectId: testProject.id, statusId: 1 }); // Pass projectId
  });

  afterAll(async () => {
    // clearDB and closeDB are likely handled by globalTeardown or Jest environment
    // If specific cleanup needed beyond global, add here. Otherwise, remove.
    // Example: await Task.destroy({ where: { jobId: testJob.id } }); // Clean up only tasks created by these tests
  });

  // --- GET /api/v1/tasks ---
  describe('GET /', () => {
    it('should return a list of tasks', async () => {
      const res = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tasks).toBeInstanceOf(Array);
      expect(res.body.data.tasks.length).toBeGreaterThanOrEqual(2);
      // Find the task with the specific description instead of assuming order
      const foundTask1 = res.body.data.tasks.find(task => task.description === 'First Task');
      expect(foundTask1).toBeDefined();
      expect(foundTask1).toHaveProperty('id');
      expect(foundTask1).toHaveProperty('project_id', testProject.id); // Check project_id
      // Check for included Job/Project if service includes them
      // expect(res.body.data.tasks[0].Job).toBeDefined();
      // expect(res.body.data.tasks[0].Job.Project).toBeDefined();
    });

    // TODO: Add tests for filtering/pagination if implemented

    it('should return 400 if invalid status query parameter is provided', async () => {
      const res = await request(app)
        .get('/api/v1/tasks?status_id=invalid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Validation failed'); // Check the error message string
      expect(res.body.validationDetails).toBeDefined(); // Check for the details array
      expect(res.body.validationDetails[0].param).toEqual('status_id'); // Check the specific param in details
    });
  });

  // --- GET /api/v1/tasks/:id ---
  describe('GET /:id', () => {
    it('should return a single task by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/tasks/${task1.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      // Assert directly on res.body.data as the task object is not nested under 'task' key
      expect(res.body.data).toHaveProperty('id', task1.id);
      expect(res.body.data).toHaveProperty('description', task1.description);
      expect(res.body.data).toHaveProperty('project_id', testProject.id); // Check project_id
      // Check for included Job/Project
      // expect(res.body.data.task.Job).toBeDefined();
    });

    it('should return 404 if task not found', async () => {
      const nonExistentId = 99999;
      const res = await request(app)
        .get(`/api/v1/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i); // Check error message property
    });

    it('should return 400 if task ID is invalid', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .get(`/api/v1/tasks/${invalidId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Validation failed'); // Check the error message string
      expect(res.body.validationDetails).toBeDefined(); // Check for the details array
      expect(res.body.validationDetails[0].param).toEqual('id'); // Check the specific param in details
    });
  });

  // --- POST /api/v1/tasks ---
  describe('POST /', () => {
    let newTaskData; // Define in describe scope

    beforeEach(() => {
      // Reset newTaskData before each test in this block
      newTaskData = {
        name: 'A brand new task', // Use 'name' as required by validation
        project_id: testProject.id, // Provide required project_id (snake_case)
        status_id: 1, // Assuming status_id 1 exists (snake_case)
        // Add other required fields based on model if needed for creation
      };
      // Remove jobId logic as it's not in the Task model
    });


    it('should create a new task with valid data and token', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send(newTaskData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      // Assert directly on res.body.data as the task object is not nested under 'task' key
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toEqual(newTaskData.name); // Check 'name' field
      // expect(res.body.data.jobId).toEqual(newTaskData.jobId); // jobId is not part of the model/response here
      expect(res.body.data.project_id).toEqual(newTaskData.project_id); // Check project_id
      expect(res.body.data.status_id).toEqual(newTaskData.status_id); // Check status_id
      // TODO: Verify createdBy if implemented
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .send(newTaskData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Access denied. No token provided.'); // Check the error string directly
    });

    it('should return 401 if token is invalid', async () => {
        const res = await request(app)
          .post('/api/v1/tasks')
          .set('Authorization', `Bearer invalidtoken`)
          .send(newTaskData);
        expect(res.statusCode).toEqual(401); // Or 403 depending on middleware implementation
        expect(res.body.success).toBe(false);
        // expect(res.body.error.message).toEqual('Invalid token');
      });

    // TODO: Add tests for validation errors (e.g., missing description, invalid projectId)
    it.skip('should return 400 if required fields are missing', async () => {
        const invalidData = { ...newTaskData, description: undefined }; // Example: missing description
        const res = await request(app)
            .post('/api/v1/tasks')
            .set('Authorization', `Bearer ${token}`)
            .send(invalidData);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        // expect(res.body.error.message).toContain('description is required');
    });
  });

  // --- PUT /api/v1/tasks/:id ---
  describe('PUT /:id', () => {
    const updateData = {
      description: 'Updated Task Description',
      status_id: 2, // Assuming status_id 2 exists (snake_case)
    };

    it('should update an existing task with valid data and token', async () => {
      const res = await request(app)
        .put(`/api/v1/tasks/${task1.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      // Assert directly on res.body.data as the task object is not nested under 'task' key
      expect(res.body.data).toHaveProperty('id', task1.id);
      expect(res.body.data.description).toEqual(updateData.description);
      expect(res.body.data.status_id).toEqual(updateData.status_id); // Check status_id (snake_case)
      // TODO: Verify updatedBy if implemented
    });

    it('should return 404 if task to update is not found', async () => {
      const nonExistentId = 99999;
      const res = await request(app)
        .put(`/api/v1/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i); // Check error message property
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app)
        .put(`/api/v1/tasks/${task1.id}`)
        .send(updateData);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 400 if task ID is invalid', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .put(`/api/v1/tasks/${invalidId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Validation failed'); // Check the error message string
      expect(res.body.validationDetails).toBeDefined(); // Check for the details array
      expect(res.body.validationDetails[0].param).toEqual('id'); // Check the specific param in details
    });

    // TODO: Add tests for validation errors on update
    it.skip('should return 400 if update data is invalid', async () => {
        const invalidUpdate = { description: '' }; // Example invalid data
        const res = await request(app)
            .put(`/api/v1/tasks/${task1.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(invalidUpdate);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        // expect(res.body.error.message).toContain('validation error');
    });
  });

  // --- DELETE /api/v1/tasks/:id ---
  describe('DELETE /:id', () => {
    it('should delete an existing task with a valid token', async () => {
      const res = await request(app)
        .delete(`/api/v1/tasks/${task1.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(204); // No Content

      // Verify task is actually deleted
      const getRes = await request(app)
        .get(`/api/v1/tasks/${task1.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.statusCode).toEqual(404);
    });

    it('should return 404 if task to delete is not found', async () => {
      const nonExistentId = 99999;
      const res = await request(app)
        .delete(`/api/v1/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i); // Check error message property
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).delete(`/api/v1/tasks/${task2.id}`); // Use task2 as task1 might be deleted
      expect(res.statusCode).toEqual(401);
    });

    it('should return 400 if task ID is invalid', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .delete(`/api/v1/tasks/${invalidId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toEqual('Validation failed'); // Check the error message string
      expect(res.body.validationDetails).toBeDefined(); // Check for the details array
      expect(res.body.validationDetails[0].param).toEqual('id'); // Check the specific param in details
    });
  });
});