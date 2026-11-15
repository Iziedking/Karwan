import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAcceptDealConfirm } from './actions.js';

/// Agreeing to a deal that asks for a deal guarantee backs it from the savings
/// pocket (view 82): the card says so, and its payload carries the seller's yes.

const base = { caller: '0xseller', jobId: 'deal-1', amountUsdc: '60', counterpartyLabel: '@ada', deadlineLabel: '2026-11-30' };

test('a deal with no ask is the plain agree card', () => {
  const c = buildAcceptDealConfirm(base);
  assert.ok(!('error' in c));
  assert.equal(c.title, 'Agree to this deal');
  assert.equal((c.payload as Record<string, unknown>).backGuarantee, undefined);
});

test('a deal with an ask names the guarantee and backs it on confirm', () => {
  const c = buildAcceptDealConfirm({ ...base, guaranteeUsdc: '30' });
  assert.ok(!('error' in c));
  assert.equal(c.title, 'Back it from my pocket');
  assert.ok(c.fields.some((f) => f.label === 'Deal guarantee' && f.value === '30 USDC from your savings pocket'));
  assert.equal((c.payload as Record<string, unknown>).backGuarantee, true);
  assert.match(c.summary ?? '', /savings pocket/);
});
