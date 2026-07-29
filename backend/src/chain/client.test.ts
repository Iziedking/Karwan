import { test } from 'node:test';
import assert from 'node:assert/strict';

/// The RPC error annotation.
///
/// This exists because an incident where the first two endpoints were out of
/// quota got diagnosed as "upgrade your dRPC plan". dRPC was simply last in the
/// fallback list, so its error was the one that surfaced. The annotation says
/// so, in the message, where whoever is reading the alert will see it.
///
///   npx tsx --test src/chain/client.test.ts

const { withEndpointContext } = await import('./client.js');

/// A transport that always fails, shaped like viem's.
function failing(error: Error) {
  return (() => ({
    config: { key: 'x', name: 'x', request: async () => null, type: 'x' },
    request: async () => {
      throw error;
    },
    value: undefined,
  })) as never;
}

function succeeding(value: unknown) {
  return (() => ({
    config: { key: 'x', name: 'x', request: async () => null, type: 'x' },
    request: async () => value,
    value: undefined,
  })) as never;
}

test('a failure says every endpoint was tried, not just the last', async () => {
  const wrapped = withEndpointContext(failing(new Error('You reached Public endpoint rate limit')));
  const transport = wrapped({} as never);

  await assert.rejects(
    () => transport.request({ method: 'eth_getLogs' } as never),
    (err: Error) => {
      assert.match(err.message, /Arc RPC endpoints failed/);
      // The point of the whole thing: whoever reads this must not conclude the
      // last provider is the broken one.
      assert.match(err.message, /LAST endpoint tried and is not necessarily the cause/);
      // And the original message still has to be there to diagnose from.
      assert.match(err.message, /Public endpoint rate limit/);
      return true;
    },
  );
});

test('the original error object survives, so revert handling still works', async () => {
  // classifyAgentError and the contract-revert paths match on viem's error
  // types and message text. Replacing the error with a plain one would break
  // both quietly, which is worse than the problem being fixed.
  class ContractRevert extends Error {
    readonly code = -32000;
    constructor() {
      super('execution reverted: InsufficientStake');
    }
  }

  const original = new ContractRevert();
  const transport = withEndpointContext(failing(original))({} as never);

  await assert.rejects(
    () => transport.request({ method: 'eth_call' } as never),
    (err: unknown) => {
      assert.ok(err instanceof ContractRevert, 'the error type was replaced');
      assert.equal((err as ContractRevert).code, -32000, 'a custom field was lost');
      assert.match((err as Error).message, /execution reverted: InsufficientStake/);
      return true;
    },
  );
});

test('the prefix is added once, however many times it is retried', async () => {
  const error = new Error('boom');
  const transport = withEndpointContext(failing(error))({} as never);

  for (let i = 0; i < 3; i++) {
    await transport.request({ method: 'eth_blockNumber' } as never).catch(() => {});
  }

  // A retried request reuses the same error object. Without the guard the
  // prefix stacks and the real message ends up buried under three copies of it.
  const occurrences = error.message.split('Arc RPC endpoints failed').length - 1;
  assert.equal(occurrences, 1, `the prefix was added ${occurrences} times`);
});

test('a success passes straight through untouched', async () => {
  const transport = withEndpointContext(succeeding('0x1234'))({} as never);
  assert.equal(await transport.request({ method: 'eth_blockNumber' } as never), '0x1234');
});

test('the annotation never contains an API key', async () => {
  // QuikNode, Alchemy and Canteen all put the key in the URL path, and this
  // message lands in logs, in the admin error feed, and in the text an LLM is
  // asked to diagnose.
  const transport = withEndpointContext(failing(new Error('nope')))({} as never);

  await assert.rejects(
    () => transport.request({ method: 'eth_getLogs' } as never),
    (err: Error) => {
      // Hostnames only: nothing that looks like a path segment or a key.
      const annotation = err.message.split('\n')[0] ?? '';
      assert.equal(annotation.includes('/v1/'), false, annotation);
      assert.equal(/[a-f0-9]{24,}/i.test(annotation), false, `looks like a key: ${annotation}`);
      return true;
    },
  );
});
