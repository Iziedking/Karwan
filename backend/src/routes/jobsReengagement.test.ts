import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueLegacyReconsiderationShadow } from './jobsReengagement.js';

const source = {
  jobId: 'job-route-shadow',
  passedAt: 100,
  passed: {
    buyerAgent: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sellerAgent: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    proceedPriceUsdc: '12.5',
    limitUsdc: '10',
    buyerCeilingUsdc: '10',
    sellerFloorUsdc: '12.5',
  },
};

test('legacy reconsideration bridge is inert without a configured observer', async () => {
  assert.equal(await enqueueLegacyReconsiderationShadow(source, 200, null), false);
});

test('legacy reconsideration bridge forwards one bounded shadow input', async () => {
  const received: unknown[] = [];
  const created = await enqueueLegacyReconsiderationShadow(source, 200, async (input) => {
    received.push(input);
  });

  assert.equal(created, true);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    dealRoomId: 'job-route-shadow',
    trigger: 'USER_REQUESTED',
    triggerReference: 'reconsider:job-route-shadow:100',
    nowUnix: 200,
    attemptCount: 0,
    maxAttempts: 1,
    currentFingerprint: 'legacy-passed-offer:job-route-shadow:100:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:12.5:10:10:12.5',
    previousFingerprint: 'legacy-passed-offer:job-route-shadow:100:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:12.5:10:10:12.5',
    sourceEventId: 'legacy-reconsider:job-route-shadow:100',
    data: {
      mode: 'legacy-reconsider',
      buyerAgent: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sellerAgent: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      proceedPriceUsdc: '12.5',
      buyerCeilingUsdc: '10',
      sellerFloorUsdc: '12.5',
    },
  });
});

test('legacy reconsideration bridge rejects malformed snapshots before observer invocation', async () => {
  let calls = 0;
  const created = await enqueueLegacyReconsiderationShadow(
    { ...source, passed: { ...source.passed, proceedPriceUsdc: 'not-money' } },
    200,
    async () => {
      calls += 1;
    },
  );
  assert.equal(created, false);
  assert.equal(calls, 0);
});
