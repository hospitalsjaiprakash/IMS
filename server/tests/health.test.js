const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, server } = require('../index');
const { pool } = require('../config/database');

describe('Health & Server Status Verification', () => {
  after(async () => {
    if (server && server.listening) {
      server.close();
    }
    await pool.end();
  });

  test('GET /health returns 200 and healthy database status', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'JPHRC IMS API');
    assert.equal(res.body.database, 'connected');
    assert.ok(res.body.timestamp);
  });

  test('GET /api/health returns 200 with matching schema', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'connected');
  });

  test('GET /ping returns alive', async () => {
    const res = await request(app)
      .get('/ping')
      .expect(200);

    assert.equal(res.body.alive, true);
    assert.ok(typeof res.body.ts === 'number');
  });
});
