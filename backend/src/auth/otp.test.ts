import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkOtpAttempt,
  generateOtpCode,
  hashOtpCode,
  OTP_MAX_ATTEMPTS,
  type PendingOtpRecord,
} from './otp.js';

const OTP_TEST_SECRET = 'test-only-otp-hmac-key-that-is-at-least-32-characters';

test('generated OTPs are always six numeric digits', () => {
  for (let i = 0; i < 200; i += 1) assert.match(generateOtpCode(), /^\d{6}$/);
});

test('OTP hashes are bound to the normalized identity', () => {
  assert.notEqual(
    hashOtpCode('123456', 'first@example.com', OTP_TEST_SECRET),
    hashOtpCode('123456', 'second@example.com', OTP_TEST_SECRET),
  );
});

test('OTP hashes are keyed and cannot be reproduced without the same secret', () => {
  assert.notEqual(
    hashOtpCode('123456', 'person@example.com', OTP_TEST_SECRET),
    hashOtpCode('123456', 'person@example.com', `${OTP_TEST_SECRET}-different`),
  );
});

test('a correct fifth attempt succeeds and does not consume another attempt', () => {
  const record: PendingOtpRecord = {
    codeHash: hashOtpCode('123456', 'person@example.com', OTP_TEST_SECRET),
    expiresAt: 2_000,
    attempts: OTP_MAX_ATTEMPTS - 1,
  };
  assert.deepEqual(checkOtpAttempt(record, '123456', 'person@example.com', OTP_TEST_SECRET, 1_000), {
    status: 'verified', attempts: OTP_MAX_ATTEMPTS - 1,
  });
});

test('the fifth wrong attempt locks the code exactly at the documented limit', () => {
  const record: PendingOtpRecord = {
    codeHash: hashOtpCode('123456', 'person@example.com', OTP_TEST_SECRET),
    expiresAt: 2_000,
    attempts: OTP_MAX_ATTEMPTS - 1,
  };
  assert.deepEqual(checkOtpAttempt(record, '654321', 'person@example.com', OTP_TEST_SECRET, 1_000), {
    status: 'locked', attempts: OTP_MAX_ATTEMPTS,
  });
});

test('expired codes are rejected before comparison', () => {
  const record: PendingOtpRecord = {
    codeHash: hashOtpCode('123456', 'person@example.com', OTP_TEST_SECRET),
    expiresAt: 999,
    attempts: 0,
  };
  assert.deepEqual(checkOtpAttempt(record, '123456', 'person@example.com', OTP_TEST_SECRET, 1_000), {
    status: 'expired', attempts: 0,
  });
});
