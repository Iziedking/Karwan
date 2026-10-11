import assert from 'node:assert/strict';
import test from 'node:test';
import { DUST_MICROS, NULLIFIER_KEEP_MS, WAIT_MS, isDeleteCommand, refusalFor, type Standing } from './rules.js';

const DAY = 86_400_000;
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));

function clear(over: Partial<Standing> = {}): Standing {
  return { openDeals: 0, liveOffers: 0, openRequests: 0, activeBids: 0, holdings: [{ where: 'arc', micros: 0n }], ...over };
}

test('the wait is 7 days and the World ID hash is kept 12 months', () => {
  assert.equal(WAIT_MS, 7 * DAY);
  assert.equal(NULLIFIER_KEEP_MS, 365 * DAY);
  assert.equal(DUST_MICROS, usdc(0.01));
});

test('an account with nothing open and no money may be deleted', () => {
  assert.equal(refusalFor(clear()), null);
});

test('less than a cent in every wallet does not stop a deletion', () => {
  assert.equal(refusalFor(clear({ holdings: [{ where: 'arc', micros: usdc(0.009) }, { where: 'base', micros: usdc(0.009) }] })), null);
});

test('an open deal is refused first, whatever else is true', () => {
  const r = refusalFor(clear({ openDeals: 1, liveOffers: 2, holdings: [{ where: 'arc', micros: usdc(5) }] }));
  assert.equal(r?.code, 'open_deal');
  assert.match(r!.message, /open deal/);
});

test('live offers or open requests are refused', () => {
  assert.equal(refusalFor(clear({ liveOffers: 1 }))?.code, 'live_market');
  assert.equal(refusalFor(clear({ openRequests: 1 }))?.code, 'live_market');
});

test('an agent still bidding is refused', () => {
  assert.equal(refusalFor(clear({ activeBids: 1 }))?.code, 'agent_bidding');
});

test('a cent or more anywhere is refused with the total to withdraw', () => {
  const r = refusalFor(clear({ holdings: [{ where: 'arc', micros: usdc(12.5) }, { where: 'seller agent', micros: usdc(0.01) }] }));
  assert.equal(r?.code, 'balance');
  assert.match(r!.message, /12\.51 USDC/);
  assert.match(r!.message, /Withdraw/);
});

test('a balance that could not be read is refused rather than taken as zero', () => {
  assert.equal(refusalFor(clear({ holdings: [{ where: 'arc', micros: 0n }, { where: 'base', micros: null }] }))?.code, 'unreadable');
});

test('a known balance is named before an unreadable one', () => {
  assert.equal(refusalFor(clear({ holdings: [{ where: 'arc', micros: usdc(3) }, { where: 'base', micros: null }] }))?.code, 'balance');
});

test('the delete command is /delete, with or without the bot name', () => {
  assert.equal(isDeleteCommand('/delete'), true);
  assert.equal(isDeleteCommand(' /DELETE '), true);
  assert.equal(isDeleteCommand('/delete@KarwanBot'), true);
  assert.equal(isDeleteCommand('/delete my account'), false);
  assert.equal(isDeleteCommand('delete my account'), false);
  assert.equal(isDeleteCommand(undefined), false);
});
