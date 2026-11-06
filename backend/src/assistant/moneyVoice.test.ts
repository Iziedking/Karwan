import assert from 'node:assert/strict';
import test from 'node:test';
import { moneyVoice } from './moneyVoice.js';

const rates = { rates: { NGN: 1346.11 }, updatedAt: Date.now(), source: 'coingecko' as const };

test('a naira reader is asked and answered in naira, never "How much USDC" (owner, 6 Nov 2026)', () => {
  const line = moneyVoice('NGN', rates);
  assert.match(line, /reads money in NGN/);
  assert.match(line, /₦50,000/);
  assert.match(line, /never "How much USDC"/);
  assert.match(line, /currency NGN/);
  assert.match(line, /1 USDC = ₦1,346/);
});

test('a USDC reader gets no extra line, and a missing rate falls back to USDC out loud', () => {
  assert.equal(moneyVoice('USDC', rates), '');
  assert.equal(moneyVoice(undefined, rates), '');
  assert.match(moneyVoice('KES', rates), /no fresh KES rate right now: say amounts in USDC/);
});

test('the assistant reads the account currency on every turn', async () => {
  const { readFileSync } = await import('node:fs');
  const agent = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');
  assert.match(agent, /moneyVoice\(profile\?\.settings\?\.displayCurrency, rates\)/);
  assert.doesNotMatch(agent, /Give the balance in USDC first/);
});
