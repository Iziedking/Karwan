import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { toUsdc, withLocalAmounts } from './localAmountTools.js';
import type { UsdcRates } from '../rates/usdcRates.js';

const RATES: UsdcRates = { rates: { NGN: 1346.11 }, updatedAt: Date.now(), source: 'coingecko' };

test('an amount said in naira becomes USDC at today\'s rate, rounded down', () => {
  assert.equal(toUsdc(50000, 'NGN', RATES), 37.144066);
  assert.equal(toUsdc(20, undefined, RATES), 20);
  assert.equal(toUsdc(100, 'KES', RATES), null);
});

test('a money tool takes a currency and runs in USDC underneath', async () => {
  const seen: unknown[] = [];
  const tools = withLocalAmounts(
    {
      send: { inputSchema: z.object({ to: z.string(), amountUsdc: z.number() }), execute: async (args: unknown) => { seen.push(args); return 'ok'; } },
      read: { inputSchema: z.object({ id: z.string() }), execute: async () => 'read' },
    },
    async () => RATES,
  );
  const schema = tools.send.inputSchema as z.ZodObject<z.ZodRawShape>;
  assert.ok('currency' in schema.shape);
  assert.ok(!('currency' in (tools.read.inputSchema as z.ZodObject<z.ZodRawShape>).shape));
  await tools.send.execute!({ to: '@ada', amountUsdc: 50000, currency: 'NGN' }, {});
  await tools.send.execute!({ to: '@ada', amountUsdc: 20 }, {});
  assert.deepEqual(seen, [{ to: '@ada', amountUsdc: 37.144066 }, { to: '@ada', amountUsdc: 20 }]);
  const refused = await tools.send.execute!({ to: '@ada', amountUsdc: 100, currency: 'KES' }, {});
  assert.match((refused as { error: string }).error, /no fresh KES rate/);
});

test('a budget, price or rate said in naira is posted in USDC, never as the naira figure (8 Nov)', async () => {
  const seen: unknown[] = [];
  const tools = withLocalAmounts(
    {
      post: {
        inputSchema: z.object({ brief: z.string(), budgetUsdc: z.number().positive().max(5_000), lowestUsdc: z.number().optional() }),
        execute: async (args: unknown) => { seen.push(args); return 'ok'; },
      },
    },
    async () => RATES,
  );
  const shape = (tools.post.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
  assert.ok('currency' in shape);
  assert.equal(shape.budgetUsdc.safeParse(100_000).success, true, 'a naira figure passes the first check');
  await tools.post.execute!({ brief: 'a dress', budgetUsdc: 100_000, currency: 'NGN' }, {});
  assert.deepEqual(seen, [{ brief: 'a dress', budgetUsdc: 74.288133 }]);
  const tooMuch = await tools.post.execute!({ brief: 'a dress', budgetUsdc: 100_000 }, {});
  assert.match((tooMuch as { error: string }).error, /does not fit/);
  assert.equal(seen.length, 1);
});
