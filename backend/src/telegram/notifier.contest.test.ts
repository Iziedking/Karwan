import assert from 'node:assert/strict';
import test from 'node:test';
import type { KarwanEvent } from '../events.js';
import { RELEVANT, contestRecipients, contestSummary } from './notifier.js';

/// Contest news on Telegram (view 96): each event goes to the people it
/// concerns and no one else; a new contest is never a broadcast.

const BUYER = '0x1111111111111111111111111111111111111111';
const S1 = '0x3333333333333333333333333333333333333333';
const S2 = '0x4444444444444444444444444444444444444444';
const ev = (type: string, payload: Record<string, unknown>) => ({ type, actor: 'platform', ts: 1, payload: { contestId: 'c_9', title: 'Best logo', ...payload } }) as unknown as KarwanEvent;

test('contest news is on the list, but a new contest is not', () => {
  for (const t of ['contest.entered', 'contest.entry_marked', 'contest.awarded', 'contest.cancelled', 'contest.returned']) assert.ok(RELEVANT.has(t), t);
  assert.equal(RELEVANT.has('contest.opened'), false);
});

test('each piece of news reaches only the people it concerns', () => {
  const to = (e: KarwanEvent) => contestRecipients(e).map((r) => [r.address, r.role]);
  assert.deepEqual(to(ev('contest.entered', { buyer: BUYER, seller: S1 })), [[BUYER, 'buyer']]);
  assert.deepEqual(to(ev('contest.entered', { buyer: BUYER, seller: S1, replaced: true })), [], 'a replaced entry is not news again');
  assert.deepEqual(to(ev('contest.entry_marked', { buyer: BUYER, seller: S1 })), [[S1, 'seller']]);
  assert.deepEqual(to(ev('contest.awarded', { buyer: BUYER, winners: [{ seller: S1, netMicros: '149250000' }] })), [[S1, 'winner:149250000'], [BUYER, 'buyer']]);
  assert.deepEqual(to(ev('contest.returned', { buyer: BUYER, entrants: [S1, S2, S1.toUpperCase().replace('0X', '0x')] })), [[BUYER, 'buyer'], [S1, 'seller'], [S2, 'seller']]);
  assert.deepEqual(to(ev('contest.cancelled', { buyer: BUYER, entrants: [] })), [[BUYER, 'buyer']]);
});

test('a winner reads their own prize; everyone else reads that the winners were paid', () => {
  const e = ev('contest.awarded', { buyer: BUYER, winners: [{ seller: S1, netMicros: '149250000' }] });
  assert.equal(contestSummary(e, 'winner:149250000', 'en')?.text, '"Best logo": you won. 149.25 USDC was paid to your agent.');
  assert.equal(contestSummary(e, 'buyer', 'en')?.text, '"Best logo": the winners were paid.');
  assert.equal(contestSummary(ev('contest.entered', { buyer: BUYER }), 'buyer', 'fr')?.text, '« Best logo » : une nouvelle participation est arrivée. Choisissez les gagnants à la clôture.');
  assert.equal(contestSummary(ev('contest.returned', { buyer: BUYER }), 'seller', 'en')?.text, '"Best logo" ended with no winners picked. The prize went back to the person who posted it.');
});
