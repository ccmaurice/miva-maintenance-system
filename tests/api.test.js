const request = require('supertest');
const app = require('../server');
const { initDb, dbRun } = require('../database');

let adminToken = '';
let studentToken = '';
let testRequestId = null;
let testOfficerId = 2; // Seeded John Maintenance officer ID is 2

beforeAll(async () => {
  // Initialize and seed database before running tests
  await initDb();

  // Clean up test user from previous runs to ensure register test passes
  await dbRun("DELETE FROM users WHERE email = 'test_student@miva.edu.ng'");

  // Login as admin to get token
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@miva.edu.ng', password: 'admin123' });
  adminToken = adminRes.body.token;

  // Login as student to get token
  const studentRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'student@miva.edu.ng', password: 'student123' });
  studentToken = studentRes.body.token;
});

describe('MIVA Maintenance System API Integration Tests', () => {

  // Test 1: Register Endpoint
  test('POST /api/auth/register - Should register a new student user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Student',
        email: 'test_student@miva.edu.ng',
        password: 'testpassword123',
        role_id: 3
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('userId');
  });

  // Test 2: Create Request Endpoint
  test('POST /api/requests - Should create a new maintenance request', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Broken desk in classroom A',
        description: 'The desk in the front row has a broken leg.',
        category_id: 2 // Damaged Furniture
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('requestId');
    testRequestId = res.body.requestId;
  });

  // Test 3: Get Requests Endpoint (Auth Protected)
  test('GET /api/requests - Should fail without auth token', async () => {
    const res = await request(app).get('/api/requests');
    expect(res.statusCode).toBe(401);
  });

  // Test 4: Get Requests Endpoint (Student Role Restriction)
  test('GET /api/requests - Should return requests created by the student', async () => {
    const res = await request(app)
      .get('/api/requests')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    // Student should only see requests submitted by them
    res.body.data.forEach(req => {
      expect(req.submitter_email).toBe('student@miva.edu.ng');
    });
  });

  // Test 5: Assign Request Endpoint (Admin Only)
  test('POST /api/requests/:id/assign - Admin should assign request to officer', async () => {
    const res = await request(app)
      .post(`/api/requests/${testRequestId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        officer_id: testOfficerId,
        remarks: 'Please repair immediately.'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('assigned to John Maintenance successfully');
  });

  // Test 6: Assign Request Endpoint - Should block student assignment
  test('POST /api/requests/:id/assign - Student cannot assign request', async () => {
    const res = await request(app)
      .post(`/api/requests/${testRequestId}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        officer_id: testOfficerId
      });

    expect(res.statusCode).toBe(403);
  });

  // Test 7: Get Request Detail Endpoint
  test('GET /api/requests/:id - Should fetch request details with history logs', async () => {
    const res = await request(app)
      .get(`/api/requests/${testRequestId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('request');
    expect(res.body).toHaveProperty('logs');
    expect(res.body.request.id).toBe(testRequestId);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(2); // Initial log + assignment log
  });

  // Test 8: Update Status Endpoint (Admin / Officer)
  test('PUT /api/requests/:id/status - Admin should update status to In Progress', async () => {
    const res = await request(app)
      .put(`/api/requests/${testRequestId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'In Progress',
        remarks: 'Repair technician is heading to Classroom A.'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('updated successfully');
  });
});
