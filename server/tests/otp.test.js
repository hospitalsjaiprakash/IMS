const { test, describe, after, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { sendOtp, verifyOtp } = require('../utils/otpService');
const { query, pool } = require('../config/database');

describe('Cluster-Safe Database-Backed OTP Verification', () => {
  const testEmpId = 'TEST_EMP_99999';
  const testAction = 'test_action';

  before(async () => {
    // Ensure clean state before testing
    await query('DELETE FROM security_otps WHERE employee_id = $1', [testEmpId]);
  });

  after(async () => {
    // Clean up test data and database pool
    await query('DELETE FROM security_otps WHERE employee_id = $1', [testEmpId]);
    await pool.end();
  });

  test('sendOtp inserts hashed OTP into PostgreSQL', async () => {
    const success = await sendOtp(testEmpId, 'test@example.com', testAction);
    assert.equal(success, true);

    const res = await query(
      'SELECT id, otp_hash, attempts, max_attempts FROM security_otps WHERE employee_id = $1 AND action = $2',
      [testEmpId, testAction]
    );

    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].attempts, 0);
    assert.equal(res.rows[0].max_attempts, 5);
    assert.ok(res.rows[0].otp_hash.length >= 64);
  });

  test('verifyOtp returns false for wrong OTP and increments attempts', async () => {
    const isCorrect = await verifyOtp(testEmpId, testAction, '000000');
    assert.equal(isCorrect, false);

    const res = await query(
      'SELECT attempts FROM security_otps WHERE employee_id = $1 AND action = $2',
      [testEmpId, testAction]
    );
    assert.equal(res.rows[0].attempts, 1);
  });

  test('verifyOtp with correct OTP returns true and purges record', async () => {
    // Manually create known OTP record for deterministic test
    const knownOtp = '765432';
    const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [testEmpId, 'test_known']);
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, attempts, max_attempts, expires_at)
       VALUES ($1, $2, $3, 0, 5, $4)`,
      [testEmpId, 'test_known', knownHash, expiresAt]
    );

    const isMatch = await verifyOtp(testEmpId, 'test_known', knownOtp);
    assert.equal(isMatch, true);

    const res = await query('SELECT * FROM security_otps WHERE employee_id = $1 AND action = $2', [testEmpId, 'test_known']);
    assert.equal(res.rows.length, 0, 'Consumed OTP must be cleared from database');
  });

  test('verifyOtp purges record and rejects after 5 failed attempts (brute-force defense)', async () => {
    const knownOtp = '888999';
    const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [testEmpId, 'test_bruteforce']);
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, attempts, max_attempts, expires_at)
       VALUES ($1, $2, $3, 4, 5, $4)`,
      [testEmpId, 'test_bruteforce', knownHash, expiresAt]
    );

    // 5th failed attempt: should return false
    const attempt5 = await verifyOtp(testEmpId, 'test_bruteforce', '111111');
    assert.equal(attempt5, false);

    // Record should now be deleted/invalidated
    const attempt6 = await verifyOtp(testEmpId, 'test_bruteforce', knownOtp);
    assert.equal(attempt6, false, 'OTP should be invalid after exceeding maximum attempts');
  });
});
