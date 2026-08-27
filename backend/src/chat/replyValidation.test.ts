import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReplyTarget } from './replyValidation.js';

const participant = {
  id: 'message-1', jobId: 'job-1', channel: 'financing' as const,
  channelKey: 'position-1', sender: '0xSeller', kind: 'participant' as const,
  body: 'Can you confirm the repayment date?', ts: 1,
};

test('accepts a participant message from the same financing position', () => {
  assert.equal(validateReplyTarget(participant, 'job-1', 'position-1'), null);
});

test('rejects replies to another position or a system event', () => {
  assert.match(validateReplyTarget(participant, 'job-1', 'position-2') ?? '', /same financing conversation/);
  assert.match(validateReplyTarget({ ...participant, kind: 'system' }, 'job-1', 'position-1') ?? '', /participant message/);
});

test('accepts a participant message from the same trade conversation', () => {
  assert.equal(
    validateReplyTarget({ ...participant, channel: 'trade', channelKey: 'job-1' }, 'job-1', 'job-1', 'trade'),
    null,
  );
});
