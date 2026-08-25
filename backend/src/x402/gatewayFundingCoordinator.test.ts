import assert from 'node:assert/strict';
import test from 'node:test';
import { GatewayFundingCoordinator } from './gatewayFundingCoordinator.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('same Gateway beneficiary shares one in-flight funding operation', async () => {
  const coordinator = new GatewayFundingCoordinator();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await wait(5);
    return `funding-${calls}`;
  };

  const results = await Promise.all([
    coordinator.run('0xABC', operation),
    coordinator.run('0xabc', operation),
    coordinator.run(' 0xAbC ', operation),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(results, ['funding-1', 'funding-1', 'funding-1']);
  assert.equal(coordinator.inFlightCount, 0);
});

test('different beneficiaries remain independent', async () => {
  const coordinator = new GatewayFundingCoordinator();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    const result = calls;
    await wait(1);
    return result;
  };

  const results = await Promise.all([
    coordinator.run('0xone', operation),
    coordinator.run('0xtwo', operation),
  ]);

  assert.equal(calls, 2);
  assert.deepEqual(results.sort(), [1, 2]);
  assert.equal(coordinator.inFlightCount, 0);
});

test('a rejected operation releases the key for a later retry', async () => {
  const coordinator = new GatewayFundingCoordinator();
  let calls = 0;
  await assert.rejects(
    coordinator.run('0xfailing', async () => {
      calls += 1;
      throw new Error('temporary funding failure');
    }),
    /temporary funding failure/,
  );
  assert.equal(coordinator.inFlightCount, 0);

  const result = await coordinator.run('0xFAILing', async () => {
    calls += 1;
    return 'retry-success';
  });
  assert.equal(result, 'retry-success');
  assert.equal(calls, 2);
});

test('blank beneficiary keys fail before invoking the operation', () => {
  const coordinator = new GatewayFundingCoordinator();
  let invoked = false;
  assert.throws(
    () => coordinator.run('   ', async () => {
      invoked = true;
      return undefined;
    }),
    /beneficiary key/,
  );
  assert.equal(invoked, false);
});
