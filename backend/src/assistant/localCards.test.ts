import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAction } from './actions.js';
import type { UsdcRates } from '../rates/usdcRates.js';
import { buildContestPostConfirm } from './contests.js';
import { localiseActions, localiseAnswer } from './localCards.js';

/// A naira account reads every card and answer in naira (owner, 16 Nov 2026:
/// "Usdc discrepancy everywhere, will confuse users that do not know usdc").

const RATES: UsdcRates = { rates: { NGN: 1346 }, updatedAt: 1_793_865_348_000, source: 'coingecko' };
const contest = buildContestPostConfirm(
  { title: 'Bug bounty', brief: 'Find bugs', prizeUsdc: '14.86', places: 2, entriesDays: 7 },
  { title: 'Bug bounty', prizeMicros: '14860000', feeHalfMicros: '70000', totalMicros: '14930000', placeNetMicros: ['10350000', '4440000'], entriesBy: Date.UTC(2026, 10, 23), awardBy: Date.UTC(2026, 11, 7), ifNobody: '' },
);

test('a contest card on a naira account shows naira on every row and never USDC', () => {
  const [card] = localiseActions([contest], 'NGN', RATES);
  assert.equal(card!.kind, 'confirm');
  const values = card!.kind === 'confirm' ? card!.fields.map((f) => f.value) : [];
  assert.ok(values.every((v) => v.startsWith('₦')), values.join(' | '));
  assert.ok(!JSON.stringify(card).includes(' USDC'));
  assert.deepEqual(card!.kind === 'confirm' && card!.payload, contest.payload, 'the payload keeps its USDC');
});

test('a USDC reader, or no rate held, sees the card as it was drawn', () => {
  assert.deepEqual(localiseActions([contest], 'USDC', RATES), [contest]);
  assert.deepEqual(localiseActions([contest], 'NGN', { rates: {}, updatedAt: null, source: null }), [contest]);
});

test('sending to an outside wallet keeps USDC on the card and in the answer', () => {
  const out = { kind: 'confirm', id: 'c1', intent: 'cash_out', title: 'Send 10 USDC out', fields: [{ label: 'Amount', value: '10 USDC' }], payload: {} } as unknown as AssistantAction;
  assert.deepEqual(localiseActions([out], 'NGN', RATES), [out]);
  assert.equal(localiseAnswer('That sends 10 USDC to your wallet.', [out], 'NGN', RATES), 'That sends 10 USDC to your wallet.');
});

test('an answer that slips a USDC figure reads in naira', () => {
  assert.equal(localiseAnswer('The prize is 10 USDC.', [], 'NGN', RATES), 'The prize is ₦13,460.');
});
