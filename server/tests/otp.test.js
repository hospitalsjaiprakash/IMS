const { test, describe, after, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { sendOtp, verifyOtp, computeOtpMac } = require('../utils/otpService');
const { query, pool } = require('../config/database');

describe('Cluster-Safe Database-Backed OTP Verification', () => {
  const testEmpId = 'TEST_EMP_99999';
  const testAction = 'test_action';
  const testEmail = 'test@example.com';

  before(async () => {
    await query('DELETE FROM security_otps WHERE employee_id = $1', [testEmpId]);
  });

  after(async () => {
    await query('DELETE FROM security_otps WHERE employee_id = $1', [testEmpId]);
    await pool.end();
  });

  test('sendOtp inserts email-bound HMAC-SHA256 OTP into PostgreSQL', async () => {
    const success = await sendOtp(testEmpId, testEmail, testAction);
    assert.equal(success, true);

    const res = await query(
      'SELECT id, otp_hash, target_email, attempts, max_attempts FROM security_otps WHERE employee_id = $1 AND action = $2',
      [testEmpId, testAction]
    );

    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].attempts, 0);
    assert.equal(res.rows[0].max_attempts, 5);
    assert.equal(res.rows[0].target_email, testEmail);
    assert.ok(res.rows[0].otp_hash.length === 64);
  });

  test('verifyOtp returns false for wrong OTP and increments attempts', async () => {
    const isCorrect = await verifyOtp(testEmpId, testAction, '000000', testEmail);
    assert.equal(isCorrect, false);

    const res = await query(
      'SELECT attempts FROM security_otps WHERE employee_id = $1 AND action = $2',
      [testEmpId, testAction]
    );
    assert.equal(res.rows[0].attempts, 1);
  });

  test('verifyOtp with correct OTP and matching email returns true and purges record', async () => {
    const knownOtp = '765432';
    const knownHash = computeOtpMac(testEmpId, 'test_known', testEmail, knownOtp);
    const bareSha256 = crypto.createHash('sha256').update(knownOtp).digest('hex');
    assert.notEqual(knownHash, bareSha256, 'Stored OTP MAC must NOT equal bare sha256(otp)');

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [testEmpId, 'test_known']);
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
       VALUES ($1, $2, $3, $4, 0, 5, $5)`,
      [testEmpId, 'test_known', knownHash, testEmail, expiresAt]
    );

    // Wrong email must fail even with correct OTP
    const wrongEmailMatch = await verifyOtp(testEmpId, 'test_known', knownOtp, 'other@example.com');
    assert.equal(wrongEmailMatch, false, 'Email-bound OTP must reject mismatched email');

    const isMatch = await verifyOtp(testEmpId, 'test_known', knownOtp, testEmail);
    assert.equal(isMatch, true);

    const res = await query('SELECT * FROM security_otps WHERE employee_id = $1 AND action = $2', [testEmpId, 'test_known']);
    assert.equal(res.rows.length, 0, 'Consumed OTP must be cleared from database');
  });

  test('verifyOtp purges record and rejects after 5 failed attempts (brute-force defense)', async () => {
    const knownOtp = '888999';
    const knownHash = computeOtpMac(testEmpId, 'test_bruteforce', testEmail, knownOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [testEmpId, 'test_bruteforce']);
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
       VALUES ($1, $2, $3, $4, 4, 5, $5)`,
      [testEmpId, 'test_bruteforce', knownHash, testEmail, expiresAt]
    );

    // 5th failed attempt: should return false and immediately purge row
    const attempt5 = await verifyOtp(testEmpId, 'test_bruteforce', '111111', testEmail);
    assert.equal(attempt5, false);

    // Record should now be deleted/invalidated
    const attempt6 = await verifyOtp(testEmpId, 'test_bruteforce', knownOtp, testEmail);
    assert.equal(attempt6, false, 'OTP should be invalid after exceeding maximum attempts');
  });
});
