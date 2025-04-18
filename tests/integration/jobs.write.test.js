// C:\Apps\Brian\tests\integration\jobs.write.test.js
const request = require('supertest');
const app = require('../../src/index'); // Corrected path to main app file
const { sequelize } = require('../../src/models');
const { setupTestDb, getAuthHeader, createTestUser, createTestProject, generateTestToken } = require('../test-helpers'); // Added generateTestToken

describe('Jobs API - Write Operations (/api/v1/jobs)', () => {
    let server;
    let agent;
    let authHeader;
    let testProject;
    let testJob;
    let testUser; // Define testUser here

    // Start server and setup DB before all tests
    beforeAll(async () => {
        server = app.listen(0); // Listen on a random free port
        agent = request.agent(server); // Use agent to maintain cookies/session if needed
        // Global setup likely handles DB reset. Create necessary entities for the test suite.
        // Create a test project first, which also creates an owner user
        const { project, ownerId } = await createTestProject();
        testProject = project;
        // Fetch the created owner user to generate a token
        testUser = await sequelize.models.Person.findByPk(ownerId); // Corrected line
        if (!testUser) {
            throw new Error('Test user (project owner) could not be found after creation.');
        }
        const token = generateTestToken(testUser.employee_id); // Use the correct user ID
        authHeader = `Bearer ${token}`; // Manually create the header string
    });

    // Close server and DB connection after all tests
    afterAll(async () => {
        // Ensure DB connection is closed (handled by tests/setup.js afterAll)
        // Ensure server is closed
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    // Clean up jobs table before each test in this suite
    beforeEach(async () => {
        await sequelize.models.Job.destroy({ truncate: true, cascade: true });
        // Create a job to be used in PUT/DELETE tests
        testJob = await sequelize.models.Job.create({
            title: 'Initial Test Job',
            projectId: testProject.id,
            description: 'A job for testing updates and deletes',
            status: 'pending'
        });
    });

    // --- POST /api/v1/jobs ---
    describe('POST /api/v1/jobs', () => {
        const newJobData = {
            title: 'New API Job',
            projectId: null, // Will be set dynamically
            description: 'A job created via API test',
            status: 'in-progress'
        };

        beforeEach(() => {
            // Ensure projectId is set before each POST test
            newJobData.projectId = testProject.id;
        });

        it('should create a new job with valid data and authentication', async () => {
            const res = await agent
                .post('/api/v1/jobs')
                .set('Authorization', authHeader) // Corrected header key
                .send(newJobData);

            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id');
            expect(res.body.data.title).toBe(newJobData.title);
            expect(res.body.data.projectId).toBe(newJobData.projectId);
            expect(res.body.data.description).toBe(newJobData.description);
            expect(res.body.data.status).toBe(newJobData.status);

            // Verify in DB
            const dbJob = await sequelize.models.Job.findByPk(res.body.data.id);
            expect(dbJob).not.toBeNull();
            expect(dbJob.title).toBe(newJobData.title);
        });

        it('should return 401 if not authenticated', async () => {
            const res = await agent
                .post('/api/v1/jobs')
                .send(newJobData);
            expect(res.statusCode).toEqual(401);
        });

        it('should return 400 if title is missing', async () => {
            const { title, ...invalidData } = newJobData;
            const res = await agent
                .post('/api/v1/jobs')
                .set('Authorization', authHeader) // Corrected header key
                .send(invalidData);
            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('title');
        });

        it('should return 400 if projectId is missing', async () => {
            const { projectId, ...invalidData } = newJobData;
            const res = await agent
                .post('/api/v1/jobs')
                .set('Authorization', authHeader) // Corrected header key
                .send(invalidData);
            expect(res.statusCode).toEqual(400);
             expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('projectId');
        });

        it('should return 400 if projectId is invalid', async () => {
            const invalidData = { ...newJobData, projectId: 'abc' };
            const res = await agent
                .post('/api/v1/jobs')
                .set('Authorization', authHeader) // Corrected header key
                .send(invalidData);
            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('projectId');
        });

         it('should return 404 if project associated with projectId does not exist', async () => {
            const invalidData = { ...newJobData, projectId: 99999 }; // Non-existent project ID
            const res = await agent
                .post('/api/v1/jobs')
                .set('Authorization', authHeader) // Corrected header key
                .send(invalidData);
            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Project with ID 99999 not found');
        });

        it('should return 400 if status is invalid', async () => {
            const invalidData = { ...newJobData, status: 'invalid-status' };
            const res = await agent
                .post('/api/v1/jobs')
                .set('Authorization', authHeader) // Corrected header key
                .send(invalidData);
            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('status');
        });
    });

    // --- PUT /api/v1/jobs/:id ---
    describe('PUT /api/v1/jobs/:id', () => {
        const updateData = {
            title: 'Updated Job Title',
            description: 'Updated description.',
            status: 'completed'
        };

        it('should update an existing job with valid data and authentication', async () => {
            const res = await agent
                .put(`/api/v1/jobs/${testJob.id}`)
                .set('Authorization', authHeader) // Corrected header key
                .send(updateData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.id).toBe(testJob.id);
            expect(res.body.data.title).toBe(updateData.title);
            expect(res.body.data.description).toBe(updateData.description);
            expect(res.body.data.status).toBe(updateData.status);
            expect(res.body.data.projectId).toBe(testJob.projectId); // Should not change projectId by default

            // Verify in DB
            const dbJob = await sequelize.models.Job.findByPk(testJob.id);
            expect(dbJob.title).toBe(updateData.title);
            expect(dbJob.status).toBe(updateData.status);
        });

        it('should allow partial updates (e.g., only status)', async () => {
            const partialUpdate = { status: 'archived' };
            const res = await agent
                .put(`/api/v1/jobs/${testJob.id}`)
                .set('Authorization', authHeader) // Corrected header key
                .send(partialUpdate);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.status).toBe(partialUpdate.status);
            expect(res.body.data.title).toBe(testJob.title); // Title should remain unchanged

             // Verify in DB
            const dbJob = await sequelize.models.Job.findByPk(testJob.id);
            expect(dbJob.status).toBe(partialUpdate.status);
            expect(dbJob.title).toBe(testJob.title);
        });


        it('should return 401 if not authenticated', async () => {
            const res = await agent
                .put(`/api/v1/jobs/${testJob.id}`)
                .send(updateData);
            expect(res.statusCode).toEqual(401);
        });

        it('should return 404 if job ID does not exist', async () => {
            const nonExistentId = 99999;
            const res = await agent
                .put(`/api/v1/jobs/${nonExistentId}`)
                .set('Authorization', authHeader) // Corrected header key
                .send(updateData);
            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain(`Job with ID ${nonExistentId} not found`);
        });

        it('should return 400 if job ID is invalid', async () => {
            const invalidId = 'abc';
            const res = await agent
                .put(`/api/v1/jobs/${invalidId}`)
                .set('Authorization', authHeader) // Corrected header key
                .send(updateData);
            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('id');
        });

        it('should return 400 if status is invalid', async () => {
             const invalidUpdate = { status: 'invalid-status' };
            const res = await agent
                .put(`/api/v1/jobs/${testJob.id}`)
                .set('Authorization', authHeader) // Corrected header key
                .send(invalidUpdate);
            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('status');
        });

        // Add test case if updating projectId is allowed and project doesn't exist (should be 404 or 400 depending on service logic)
        // it('should return 404 if updating to a non-existent projectId', async () => { ... });
    });

    // --- DELETE /api/v1/jobs/:id ---
    describe('DELETE /api/v1/jobs/:id', () => {
        it('should delete an existing job with valid authentication', async () => {
            const res = await agent
                .delete(`/api/v1/jobs/${testJob.id}`)
                .set('Authorization', authHeader); // Corrected header key

            expect(res.statusCode).toEqual(204); // No Content

            // Verify in DB
            const dbJob = await sequelize.models.Job.findByPk(testJob.id);
            expect(dbJob).toBeNull();
        });

        it('should return 401 if not authenticated', async () => {
            const res = await agent
                .delete(`/api/v1/jobs/${testJob.id}`);
            expect(res.statusCode).toEqual(401);
        });

        it('should return 404 if job ID does not exist', async () => {
            const nonExistentId = 99999;
            const res = await agent
                .delete(`/api/v1/jobs/${nonExistentId}`)
                .set('Authorization', authHeader); // Corrected header key
            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain(`Job with ID ${nonExistentId} not found`);
        });

        it('should return 400 if job ID is invalid', async () => {
            const invalidId = 'abc';
            const res = await agent
                .delete(`/api/v1/jobs/${invalidId}`)
                .set('Authorization', authHeader); // Corrected header key
            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toContain('Validation failed');
            expect(res.body.error.errors[0].param).toBe('id');
        });
    });
});