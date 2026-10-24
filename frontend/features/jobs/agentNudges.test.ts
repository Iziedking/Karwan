import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChainEvent } from '@/core/api';
import { agentNudgeFor, nudgeKey, newNudges, toldKeys } from './agentNudges';
import { agentNudgesCopy } from '@/shared/i18n/messages/agentNudges';

const copy = agentNudgesCopy.en;
const ev = (type: string, payload: Record<string, unknown> = {}, actor: ChainEvent['actor'] = 'buyer', ts = 1): ChainEvent => ({
  type,
  actor,
  ts,
  payload,
});

test('a seller agent offer reads with its price, and says when it checked the buyer first', () => {
  assert.equal(agentNudgeFor(ev('bid.submitted', { priceUsdc: '120' }, 'seller'), copy)?.text, "A seller's agent offered 120 USDC");
  assert.equal(
    agentNudgeFor(ev('bid.submitted', { priceUsdc: '120', buyerChecked: true }, 'seller'), copy)?.text,
    "A seller's agent paid to check your record, then offered 120 USDC",
  );
});

test('the buyer agent moves read as yours', () => {
  assert.equal(agentNudgeFor(ev('counter.issued', { counterPriceUsdc: '95' }), copy)?.text, 'Your agent countered at 95 USDC');
  assert.equal(agentNudgeFor(ev('bid.scored', { priceUsdc: '110' }), copy)?.text, 'Your agent weighed an offer at 110 USDC');
  assert.equal(agentNudgeFor(ev('deal.matched'), copy)?.text, 'Your agent found a match');
});

test('a shortlist says how many records the agent paid to check', () => {
  const n = agentNudgeFor(
    ev('request.shortlist', { count: 3, entries: [{ recordChecked: true }, { recordChecked: true }, { recordChecked: false }] }),
    copy,
  );
  assert.equal(n?.text, 'Your agent paid to check 2 records and listed 3 sellers');
});

test('seller answers and passes read as the other side', () => {
  assert.equal(agentNudgeFor(ev('counter.response.submitted', { accepted: true }, 'seller'), copy)?.text, "A seller's agent took your agent's price");
  assert.equal(agentNudgeFor(ev('counter.response.submitted', { counterPrice: '105' }, 'seller'), copy)?.text, "A seller's agent answered at 105 USDC");
  assert.equal(agentNudgeFor(ev('agent.skipped', { reason: 'x' }, 'seller'), copy)?.text, "A seller's agent passed on this request");
});

test('events without a payload, and types with no nudge, stay quiet', () => {
  assert.equal(agentNudgeFor(ev('bid.submitted', {}, 'seller'), copy), null);
  assert.equal(agentNudgeFor(ev('job.posted'), copy), null);
});

test('only events that arrive after the page opened become nudges', () => {
  const seen = new Set([nudgeKey(ev('counter.issued', { counterPriceUsdc: '95' }, 'buyer', 1))]);
  const fresh = newNudges(
    [ev('counter.issued', { counterPriceUsdc: '95' }, 'buyer', 1), ev('bid.submitted', { priceUsdc: '120' }, 'seller', 2)],
    seen,
    copy,
  );
  assert.deepEqual(fresh.map((n) => n.text), ["A seller's agent offered 120 USDC"]);
  assert.equal(seen.size, 2);
});

test('a shortlist republished on each new offer pops once, and a match once per seller', () => {
  const list = (n: number, ts: number) => ev('request.shortlist', { count: n, entries: [] }, 'buyer', ts);
  const match = (seller: string, ts: number) => ev('deal.matched', { sellerAgent: seller }, 'buyer', ts);
  const seen = new Set<string>();
  const first = newNudges([list(3, 1), match('0xA', 2)], seen, copy);
  assert.equal(first.length, 2);
  const again = newNudges([list(3, 1), match('0xA', 2), list(4, 3), list(5, 4), match('0xa', 5), match('0xB', 6)], seen, copy);
  assert.deepEqual(again.map((n) => n.text), ['Your agent found a match']);
});

test('a shortlist already on the page when it opened never pops when republished', () => {
  const seen = toldKeys([ev('request.shortlist', { count: 3, entries: [] }, 'buyer', 1)]);
  assert.deepEqual(newNudges([ev('request.shortlist', { count: 4, entries: [] }, 'buyer', 2)], seen, copy), []);
});
