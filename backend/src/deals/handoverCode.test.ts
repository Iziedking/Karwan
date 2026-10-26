import assert from 'node:assert/strict';
import test from 'node:test';
import { HANDOVER_LOCK_MS, checkHandoverCode, issueHandoverCode } from './handoverCode.js';

const JOB = '0x' + 'a'.repeat(64);

test('a code is six digits, kept only as a hash, and works once', () => {
  const { code, record } = issueHandoverCode(JOB, 1_000, () => 4_213);
  assert.equal(code, '004213');
  assert.equal(JSON.stringify(record).includes(code), false);
  const right = checkHandoverCode(record, JOB, ' 004213 ', 2_000);
  assert.equal(right.ok, true);
  assert.equal(right.ok && right.record.usedAt, 2_000);
  const again = checkHandoverCode(right.ok ? right.record : record, JOB, '004213', 3_000);
  assert.deepEqual(again.ok ? null : again.reason, 'used');
});

test('a code from another deal does not work here', () => {
  const { record } = issueHandoverCode(JOB, 1_000, () => 111_111);
  const other = checkHandoverCode(record, '0x' + 'b'.repeat(64), '111111', 2_000);
  assert.equal(other.ok, false);
  assert.equal(checkHandoverCode(record, JOB.toUpperCase().replace('0X', '0x'), '111111', 2_000).ok, true);
});

test('five wrong tries lock the code for 15 minutes, then it can be tried again', () => {
  let { record } = issueHandoverCode(JOB, 0, () => 123_456);
  for (let i = 1; i <= 4; i += 1) {
    const r = checkHandoverCode(record, JOB, '000000', i);
    assert.equal(r.ok ? 'ok' : r.reason, 'wrong');
    record = r.record!;
  }
  const fifth = checkHandoverCode(record, JOB, '000000', 5);
  assert.equal(fifth.ok ? 'ok' : fifth.reason, 'locked');
  record = fifth.record!;
  const whileLocked = checkHandoverCode(record, JOB, '123456', 6);
  assert.equal(whileLocked.ok ? 'ok' : whileLocked.reason, 'locked');
  assert.equal(checkHandoverCode(record, JOB, '123456', 5 + HANDOVER_LOCK_MS).ok, true);
});

test('no code issued yet', () => {
  const r = checkHandoverCode(undefined, JOB, '123456', 1);
  assert.equal(r.ok ? 'ok' : r.reason, 'no-code');
});
