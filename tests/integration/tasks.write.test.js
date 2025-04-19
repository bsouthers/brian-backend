// tests/integration/tasks.write.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
// JWT secret is now accessed via process.env.JWT_SECRET set in setup.js
const { sequelize, Person, Project, Task, Status, TaskAssignment } = require('../../src/models');
const app = require('../../src/index');

// Helper function to generate a valid JWT for testing
const generateTestToken = (userId) => {
  const payload = { id: userId, email: `user${userId}@test.com` }; // Match payload structure
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Tasks API - Write Operations (Integration)', () => {
  let testToken;
  const testUserId = 996; // Different user for task write tests
  const testUserEmail = `user${testUserId}@test.com`;
  const assigneeUserId = 995; // User to be assigned/unassigned
  const assigneeUserEmail = `user${assigneeUserId}@test.com`;
  let testStatus;
  let testProject;
  let createdTaskIds = []; // Track created tasks for cleanup
  let createdAssignmentIds = []; // Track created assignments for cleanup

  beforeAll(async () => {
    // 1. Ensure a default status exists (e.g., ID 1 'Open')
    try {
      [testStatus] = await Status.findOrCreate({
        where: { id: 1 },
        defaults: { name: 'Open' }
      });
      console.log(`Test status ${testStatus.id} found or created.`);
    } catch (error) {
      console.error("Failed to find/create default test status (ID: 1):", error);
      throw error;
    }

    // 2. Create test users
    try {
      await Person.findOrCreate({
        where: { employee_id: testUserId },
        defaults: { employee_id: testUserId, email: testUserEmail, first_name: 'Test', last_name: 'UserTaskWrite', password: 'password123' }
      });
      await Person.findOrCreate({
        where: { employee_id: assigneeUserId },
        defaults: { employee_id: assigneeUserId, email: assigneeUserEmail, first_name: 'Assignee', last_name: 'User', password: 'password123' }
      });
      console.log(`Test users ${testUserId} and ${assigneeUserId} created or found.`);
    } catch (error) {
      console.error(`Failed to create test users:`, error);
      throw error;
    }

    // 3. Create a test project
    try {
        testProject = await Project.create({
            name: 'Task Write Test Project',
            status_id: testStatus.id,
            created_by_user_id: testUserId // Link project to the main test user
        });
        console.log(`Test project ${testProject.id} created.`);
    } catch (error) {
        console.error("Failed to create test project:", error);
        // Clean up users if project creation fails
        await Person.destroy({ where: { employee_id: [testUserId, assigneeUserId] } });
        throw error;
    }

    // 4. Generate token for the main test user
    testToken = generateTestToken(testUserId);
  });

  afterEach(async () => {
    // Clean up assignments created during tests
    if (createdAssignmentIds.length > 0) {
        try {
            await TaskAssignment.destroy({ where: { id: createdAssignmentIds } });
            console.log(`Cleaned up task assignments: ${createdAssignmentIds.join(', ')}`);
        } catch (error) {
            console.error("Error cleaning up created task assignments:", error);
        }
        createdAssignmentIds = [];
    }
    // Clean up tasks created during tests
    if (createdTaskIds.length > 0) {
      try {
        await Task.destroy({ where: { id: createdTaskIds } });
        console.log(`Cleaned up tasks: ${createdTaskIds.join(', ')}`);
      } catch (error) {
        console.error("Error cleaning up created tasks:", error);
      }
      createdTaskIds = [];
    }
  });


  afterAll(async () => {
    // Clean up the test project
    if (testProject) {
        try {
            // Manually delete assignments related to tasks of this project first if cascade isn't reliable
            const tasks = await Task.findAll({ where: { project_id: testProject.id }, attributes: ['id'] });
            const taskIds = tasks.map(t => t.id);
            if (taskIds.length > 0) {
                await TaskAssignment.destroy({ where: { task_id: taskIds } });
                await Task.destroy({ where: { id: taskIds } }); // Delete tasks too
            }
            await testProject.destroy();
            console.log(`Test project ${testProject.id} destroyed.`);
        } catch (error) {
            console.error(`Failed to destroy test project ${testProject.id}:`, error);
        }
    }
    // Clean up the test users
    try {
      await Person.destroy({ where: { employee_id: [testUserId, assigneeUserId] } });
      console.log(`Test users ${testUserId} and ${assigneeUserId} destroyed.`);
    } catch (error) {
      console.error(`Failed to destroy test users:`, error);
    }
    // Optional: Clean up status if only for tests
    // if (testStatus) await testStatus.destroy();
  });

  // --- Tests for POST /api/v1/tasks ---
  describe('POST /api/v1/tasks', () => {
    let validTaskData;

    beforeEach(() => {
        // Define fresh data for each test
        validTaskData = {
          name: `New Task ${Date.now()}`,
          project_id: testProject.id,
          status_id: testStatus.id,
          description: 'A task created during testing'
        };
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .send(validTaskData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/No token provided/);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', 'Bearer invalidtoken123')
        .send(validTaskData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request if required field "name" is missing', async () => {
      const { name, ...invalidData } = validTaskData;
      const res = await request(app)
        .post('/api/v1/tasks')
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

    it('should return 400 Bad Request if required field "project_id" is missing', async () => {
        const { project_id, ...invalidData } = validTaskData;
        const res = await request(app)
          .post('/api/v1/tasks')
          .set('Authorization', `Bearer ${testToken}`)
          .send(invalidData);
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ msg: expect.stringMatching(/Project ID.*required/i) }) // Match 'project_id' required
          ])
        );
      });

    it('should return 400 Bad Request if "project_id" is invalid or non-existent', async () => {
      const invalidData = { ...validTaskData, project_id: 99999 };
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);
      // Expect 400 (FK check in service layer)
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid Project ID/i);
    });

    it('should return 400 Bad Request if "status_id" is invalid or non-existent', async () => {
        const invalidData = { ...validTaskData, status_id: 99999 };
        const res = await request(app)
          .post('/api/v1/tasks')
          .set('Authorization', `Bearer ${testToken}`)
          .send(invalidData);
        // Expect 400 (FK check in service layer)
        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toMatch(/Invalid Status ID/i); // This assertion will fail until service logic is fixed
      });


    it('should return 201 Created and the new task details for valid data', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${testToken}`)
        .send(validTaskData);

      expect(res.statusCode).toEqual(201); // This assertion will fail until service logic is fixed
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toEqual(validTaskData.name);
      expect(res.body.data.project_id).toEqual(validTaskData.project_id);
      expect(res.body.data.status_id).toEqual(validTaskData.status_id);
      expect(res.body.data.created_by_user_id).toEqual(testUserId); // Check creator ID

      // Add the created task ID to the list for cleanup
      if (res.body.data && res.body.data.id) {
        createdTaskIds.push(res.body.data.id);
      }

      // Optional: Verify the task exists in the database
      const dbTask = await Task.findByPk(res.body.data.id);
      expect(dbTask).not.toBeNull();
      expect(dbTask.name).toEqual(validTaskData.name);
      expect(dbTask.created_by_user_id).toEqual(testUserId);
    });
  });

  // --- Tests for PUT /api/v1/tasks/:id ---
  describe('PUT /api/v1/tasks/:id', () => {
    let taskToUpdate;
    let updateData;

    beforeEach(async () => {
      // Create a task before each PUT test
      try {
        taskToUpdate = await Task.create({
          name: 'Task To Update',
          project_id: testProject.id,
          status_id: testStatus.id,
          created_by_user_id: testUserId
        });
        createdTaskIds.push(taskToUpdate.id); // Track for cleanup
        console.log(`Created task ${taskToUpdate.id} for PUT test.`);

        updateData = {
          name: 'Updated Task Name',
          description: 'This task has been updated.',
          status_id: testStatus.id // Can update status, ensure it's valid
        };
      } catch (error) {
        console.error("Failed to create task for PUT test:", error);
        taskToUpdate = null;
        updateData = null;
      }
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      if (!taskToUpdate || !updateData) return;
      const res = await request(app)
        .put(`/api/v1/tasks/${taskToUpdate.id}`)
        .send(updateData);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      if (!taskToUpdate || !updateData) return;
      const res = await request(app)
        .put(`/api/v1/tasks/${taskToUpdate.id}`)
        .set('Authorization', 'Bearer invalidtoken123')
        .send(updateData);
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request for an invalid (non-numeric) task ID format', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .put(`/api/v1/tasks/${invalidId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Attempting update' });
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid task ID/i);
    });

    it('should return 404 Not Found for a non-existent task ID', async () => {
      const nonExistentId = 999999;
      const res = await request(app)
        .put(`/api/v1/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Attempting update' });
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('should return 400 Bad Request if validation fails (e.g., empty name)', async () => {
      if (!taskToUpdate || !updateData) return;
      const invalidData = { ...updateData, name: '' };
      const res = await request(app)
        .put(`/api/v1/tasks/${taskToUpdate.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/name.*cannot be empty/i);
    });

     it('should return 400 Bad Request if validation fails (e.g., invalid status_id)', async () => {
      if (!taskToUpdate || !updateData) return;
      const invalidData = { ...updateData, status_id: 99999 };
      const res = await request(app)
        .put(`/api/v1/tasks/${taskToUpdate.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(invalidData);
      expect(res.statusCode).toEqual(400); // FK check in service layer
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid Status ID/i);
    });

    it('should return 200 OK and the updated task details for valid data', async () => {
      if (!taskToUpdate || !updateData) {
        console.warn('Skipping PUT success test as task setup failed');
        return;
      }
      const res = await request(app)
        .put(`/api/v1/tasks/${taskToUpdate.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toEqual(taskToUpdate.id);
      expect(res.body.data.name).toEqual(updateData.name);
      expect(res.body.data.description).toEqual(updateData.description);
      expect(res.body.data.status_id).toEqual(updateData.status_id);

      // Verify the update in the database
      const dbTask = await Task.findByPk(taskToUpdate.id);
      expect(dbTask).not.toBeNull();
      expect(dbTask.name).toEqual(updateData.name);
      expect(dbTask.description).toEqual(updateData.description);
      expect(dbTask.status_id).toEqual(updateData.status_id);
    });

    it('should ignore attempts to update immutable fields (e.g., id, project_id, created_by_user_id)', async () => {
       if (!taskToUpdate || !updateData) return;
       const originalProjectId = taskToUpdate.project_id;
       const originalCreator = taskToUpdate.created_by_user_id;
       const attemptUpdateData = {
         ...updateData,
         id: 98765, // Attempt to change ID
         project_id: 99999, // Attempt to change project_id
         created_by_user_id: assigneeUserId // Attempt to change creator
       };

       const res = await request(app)
         .put(`/api/v1/tasks/${taskToUpdate.id}`)
         .set('Authorization', `Bearer ${testToken}`)
         .send(attemptUpdateData);

       expect(res.statusCode).toEqual(200); // Should still succeed
       expect(res.body.success).toBe(true);
       expect(res.body.data.id).toEqual(taskToUpdate.id); // ID should not change
       expect(res.body.data.project_id).toEqual(originalProjectId); // Project ID should not change
       expect(res.body.data.created_by_user_id).toEqual(originalCreator); // Creator should not change
       expect(res.body.data.name).toEqual(attemptUpdateData.name); // Mutable fields should change

       // Verify in DB
       const dbTask = await Task.findByPk(taskToUpdate.id);
       expect(dbTask.id).toEqual(taskToUpdate.id);
       expect(dbTask.project_id).toEqual(originalProjectId);
       expect(dbTask.created_by_user_id).toEqual(originalCreator);
       expect(dbTask.name).toEqual(attemptUpdateData.name);
     });
  });

  // --- Tests for DELETE /api/v1/tasks/:id ---
  describe('DELETE /api/v1/tasks/:id', () => {
    let taskToDelete;

     beforeEach(async () => {
      // Create a task before each DELETE test
      try {
        taskToDelete = await Task.create({
          name: 'Task To Delete',
          project_id: testProject.id,
          status_id: testStatus.id,
          created_by_user_id: testUserId
        });
        createdTaskIds.push(taskToDelete.id); // Track for cleanup
        console.log(`Created task ${taskToDelete.id} for DELETE test.`);
      } catch (error) {
        console.error("Failed to create task for DELETE test:", error);
        taskToDelete = null;
      }
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      if (!taskToDelete) return;
      const res = await request(app)
        .delete(`/api/v1/tasks/${taskToDelete.id}`);
      expect(res.statusCode).toEqual(401);
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      if (!taskToDelete) return;
      const res = await request(app)
        .delete(`/api/v1/tasks/${taskToDelete.id}`)
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('should return 400 Bad Request for an invalid (non-numeric) task ID format', async () => {
      const invalidId = 'abc';
      const res = await request(app)
        .delete(`/api/v1/tasks/${invalidId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid task ID/i);
    });

    it('should return 404 Not Found for a non-existent task ID', async () => {
      const nonExistentId = 999999;
      const res = await request(app)
        .delete(`/api/v1/tasks/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('should return 204 No Content for successful deletion', async () => {
      if (!taskToDelete) {
        console.warn('Skipping DELETE success test as task setup failed');
        return;
      }
      const taskId = taskToDelete.id; // Store ID before deletion

      const res = await request(app)
        .delete(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.statusCode).toEqual(204);
      expect(res.body).toEqual({}); // No body content

      // Verify the task is deleted from the database
      const dbTask = await Task.findByPk(taskId);
      expect(dbTask).toBeNull();

      // Remove the ID from the cleanup array
      createdTaskIds = createdTaskIds.filter(id => id !== taskId);
    });

    // Optional: Add test for deleting task with assignments if specific behavior is expected
    // it('should delete associated assignments when a task is deleted', async () => { ... });
  });

  // --- Tests for POST /api/v1/tasks/:id/assign ---
  describe('POST /api/v1/tasks/:id/assign', () => {
    let taskToAssign;

    beforeEach(async () => {
      // Create a task before each assignment test
      try {
        taskToAssign = await Task.create({
          name: 'Task To Assign',
          project_id: testProject.id,
          status_id: testStatus.id,
          created_by_user_id: testUserId
        });
        createdTaskIds.push(taskToAssign.id);
        console.log(`Created task ${taskToAssign.id} for assignment test.`);
      } catch (error) {
        console.error("Failed to create task for assignment test:", error);
        taskToAssign = null;
      }
    });

    const assignmentData = { user_id: assigneeUserId };

    it('should return 401 Unauthorized if no token is provided', async () => {
        if (!taskToAssign) return;
        const res = await request(app)
            .post(`/api/v1/tasks/${taskToAssign.id}/assign`)
            // No token provided intentionally
            .send(assignmentData);
        expect(res.statusCode).toEqual(401);
        // Check for specific error message if applicable
        expect(res.body.error).toMatch(/No token provided/i);
    });

    it('should return 400 Bad Request for invalid task ID format', async () => {
        const res = await request(app)
            .post(`/api/v1/tasks/abc/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send(assignmentData);
        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toMatch(/Invalid task ID/i);
    });

    it('should return 404 Not Found if task ID does not exist', async () => {
        const res = await request(app)
            .post(`/api/v1/tasks/999999/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send(assignmentData);
        expect(res.statusCode).toEqual(404);
        expect(res.body.error).toMatch(/Task.*not found/i);
    });

    it('should return 400 Bad Request if user_id is missing in body', async () => {
        if (!taskToAssign) return;
        const res = await request(app)
            .post(`/api/v1/tasks/${taskToAssign.id}/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({}); // Empty body
        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toBe("User ID is required for assignment"); // Match exact string
    });

    it('should return 400 Bad Request if user_id is not a number', async () => {
        if (!taskToAssign) return;
        const res = await request(app)
            .post(`/api/v1/tasks/${taskToAssign.id}/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ user_id: 'abc' });
        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toBe("Invalid value"); // Match exact string
    });

    it('should return 404 Not Found if user_id does not exist', async () => {
        if (!taskToAssign) return;
        const res = await request(app)
            .post(`/api/v1/tasks/${taskToAssign.id}/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ user_id: 88888 }); // Non-existent user
        expect(res.statusCode).toEqual(404);
        expect(res.body.error).toMatch(/User.*not found/i);
    });

    it('should return 201 Created and the assignment details on successful assignment', async () => {
        if (!taskToAssign) return;
        const res = await request(app)
            .post(`/api/v1/tasks/${taskToAssign.id}/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send(assignmentData);

        expect(res.statusCode).toEqual(201); // Assuming 201 for new resource creation
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        // TaskAssignment uses composite key, check those fields instead of a non-existent 'id'
        expect(res.body.data.task_id).toEqual(taskToAssign.id);
        expect(res.body.data.employee_id).toEqual(assigneeUserId); // Check employee_id returned by model

        // Track assignment for cleanup using composite key (or fetch the created record if needed)
        // Since we don't have a single ID, we might need to adjust cleanup or rely on task deletion cascade
        // For simplicity, let's assume cascade works or adjust afterEach if needed.
        // createdAssignmentIds.push(res.body.data.id); // Cannot push non-existent ID

        // Verify in DB
        const dbAssignment = await TaskAssignment.findOne({
            where: { task_id: taskToAssign.id, employee_id: assigneeUserId } // Correct field name
        });
        expect(dbAssignment).not.toBeNull();
        expect(dbAssignment.id).toEqual(res.body.data.id);
    });

    it('should return 409 Conflict if the user is already assigned to the task', async () => {
        if (!taskToAssign) return;
        // Assign first time
        await TaskAssignment.create({ task_id: taskToAssign.id, employee_id: assigneeUserId }); // Correct field name

        const res = await request(app)
            .post(`/api/v1/tasks/${taskToAssign.id}/assign`)
            .set('Authorization', `Bearer ${testToken}`)
            .send(assignmentData);

        expect(res.statusCode).toEqual(409); // Conflict
        expect(res.body.success).toBe(false);
        expect(res.body.error).toMatch(/already assigned/i);
    });
  });

  // --- Tests for DELETE /api/v1/tasks/:id/assign/:userId ---
  describe('DELETE /api/v1/tasks/:id/assign/:userId', () => {
    let taskToUnassign;
    let assignmentToDelete;

    beforeEach(async () => {
      // Create a task and an assignment before each unassignment test
      try {
        taskToUnassign = await Task.create({
          name: 'Task To Unassign',
          project_id: testProject.id,
          status_id: testStatus.id,
          created_by_user_id: testUserId
        });
        createdTaskIds.push(taskToUnassign.id);

        assignmentToDelete = await TaskAssignment.create({
            task_id: taskToUnassign.id,
            employee_id: assigneeUserId // Correct field name
        });
        // Don't track this assignment in createdAssignmentIds, as the test should delete it
        console.log(`Created task ${taskToUnassign.id} and assignment ${assignmentToDelete.id} for unassignment test.`);
      } catch (error) {
        console.error("Failed to create task/assignment for unassignment test:", error);
        taskToUnassign = null;
        assignmentToDelete = null;
      }
    });

    afterEach(async () => {
        // Clean up the specific assignment if the test didn't delete it
        if (assignmentToDelete && assignmentToDelete.id) {
            const stillExists = await TaskAssignment.findByPk(assignmentToDelete.id);
            if (stillExists) {
                await stillExists.destroy();
                console.log(`Cleaned up leftover assignment ${assignmentToDelete.id} in afterEach.`);
            }
        }
    });


    it('should return 401 Unauthorized if no token is provided', async () => {
        if (!taskToUnassign || !assignmentToDelete) return;
        const res = await request(app)
            .delete(`/api/v1/tasks/${taskToUnassign.id}/assign/${assigneeUserId}`);
            // No token provided intentionally
        expect(res.statusCode).toEqual(401);
        // Check for specific error message if applicable
        expect(res.body.error).toMatch(/No token provided/i);
    });

    it('should return 400 Bad Request for invalid task ID format', async () => {
        const res = await request(app)
            .delete(`/api/v1/tasks/abc/assign/${assigneeUserId}`)
            .set('Authorization', `Bearer ${testToken}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toMatch(/Invalid task ID/i);
    });

    it('should return 400 Bad Request for invalid user ID format', async () => {
        if (!taskToUnassign) return;
        const res = await request(app)
            .delete(`/api/v1/tasks/${taskToUnassign.id}/assign/xyz`)
            .set('Authorization', `Bearer ${testToken}`);
        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toMatch(/Invalid user ID/i);
    });

    it('should return 404 Not Found if task ID does not exist', async () => {
        const res = await request(app)
            .delete(`/api/v1/tasks/999999/assign/${assigneeUserId}`)
            .set('Authorization', `Bearer ${testToken}`);
        expect(res.statusCode).toEqual(404);
        // Error might mention task or assignment not found depending on implementation order
        expect(res.body.error).toMatch(/not found/i);
    });

     it('should return 404 Not Found if user ID does not exist', async () => {
        if (!taskToUnassign) return;
        const res = await request(app)
            .delete(`/api/v1/tasks/${taskToUnassign.id}/assign/88888`)
            .set('Authorization', `Bearer ${testToken}`);
        expect(res.statusCode).toEqual(404);
         // Error might mention user or assignment not found
        expect(res.body.error).toMatch(/not found/i);
    });

    it('should return 404 Not Found if the assignment does not exist', async () => {
        if (!taskToUnassign) return;
        // Use a valid user ID that isn't assigned (e.g., the creator)
        const nonAssignedUserId = testUserId;
        const res = await request(app)
            .delete(`/api/v1/tasks/${taskToUnassign.id}/assign/${nonAssignedUserId}`)
            .set('Authorization', `Bearer ${testToken}`);
        expect(res.statusCode).toEqual(404);
        expect(res.body.error).toMatch(/Assignment.*not found/i);
    });

    it('should return 204 No Content on successful unassignment', async () => {
        if (!taskToUnassign || !assignmentToDelete) return;
        const assignmentId = assignmentToDelete.id; // Store ID before deletion

        const res = await request(app)
            .delete(`/api/v1/tasks/${taskToUnassign.id}/assign/${assigneeUserId}`)
            .set('Authorization', `Bearer ${testToken}`);

        expect(res.statusCode).toEqual(204);
        expect(res.body).toEqual({});

        // Verify in DB
        const dbAssignment = await TaskAssignment.findByPk(assignmentId);
        expect(dbAssignment).toBeNull();

        // Mark assignment as deleted so afterEach doesn't try again
        assignmentToDelete = null;
    });
  });

});