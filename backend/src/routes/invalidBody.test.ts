import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { invalidBodyMessage } from './invalidBody.js';

function reject(schema: z.ZodTypeAny, value: unknown): string {
  try {
    schema.parse(value);
  } catch (err) {
    return invalidBodyMessage(err);
  }
  throw new Error('expected the schema to reject this value');
}

test('a short request says how short, and never shows the schema', () => {
  // The exact failure that reached a user: a four-letter brief printed the
  // whole Zod issue array under the post button.
  const schema = z.object({ brief: z.string().min(5).max(500) });
  const message = reject(schema, { brief: 'buy' });
  assert.equal(message, 'Request needs at least 5 characters.');
  assert.ok(!message.includes('too_small'));
  assert.ok(!message.includes('{'));
});

test('a missing field is reported as required', () => {
  const schema = z.object({ amountUsdc: z.number() });
  assert.equal(reject(schema, {}), 'Amount is required.');
});

test('numbers and arrays get their own wording', () => {
  assert.equal(
    reject(z.object({ budgetUsdc: z.number().min(1) }), { budgetUsdc: 0 }),
    'Budget must be at least 1.',
  );
  assert.equal(
    reject(z.object({ milestonePcts: z.array(z.number()).min(2) }), { milestonePcts: [100] }),
    'Milestone split needs at least 2 entries.',
  );
  assert.equal(
    reject(z.object({ body: z.string().max(4) }), { body: 'far too long' }),
    'Message can be at most 4 characters.',
  );
});

test('an unmapped field is spaced out of camelCase rather than shown raw', () => {
  assert.equal(
    reject(z.object({ sourceChainKey: z.string().min(1) }), { sourceChainKey: '' }),
    'Source chain key cannot be empty.',
  );
});

test('a nested path is named by its own field, not the wrapper', () => {
  const schema = z.object({ terms: z.object({ brief: z.string().min(5) }) });
  assert.equal(reject(schema, { terms: { brief: 'no' } }), 'Request needs at least 5 characters.');
});

test('anything that is not a validation error says nothing about internals', () => {
  const message = invalidBodyMessage(new Error('ECONNREFUSED 127.0.0.1:5432'));
  assert.equal(message, 'This request was not valid. Check the details and try again.');
  assert.ok(!message.includes('ECONNREFUSED'));
});
