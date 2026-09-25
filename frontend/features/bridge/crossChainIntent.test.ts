import assert from 'node:assert/strict';
import test from 'node:test';
import { amountFromParams, intentFromParams, resumableRecord, RESUME_WINDOW_MS, startedRecord, willNotifyOnArrival } from './crossChainIntent';

const q = (s: string) => new URLSearchParams(s);
const RECIPIENT = '0x1234567890abcdef1234567890abcdef12345678';

test('the page knows what it is for from its link, old links included', () => {
  assert.equal(intentFromParams(q('')), 'add');
  assert.equal(intentFromParams(q('intent=add')), 'add');
  assert.equal(intentFromParams(q('intent=move')), 'move');
  assert.equal(intentFromParams(q('intent=send')), 'send');
  assert.equal(intentFromParams(q('direction=in')), 'add');
  assert.equal(intentFromParams(q('direction=out')), 'move');
  assert.equal(intentFromParams(q('direction=out&intent=move')), 'move');
  assert.equal(intentFromParams(q('direction=out&intent=send')), 'send');
  assert.equal(intentFromParams(q(`recipient=${RECIPIENT}&amount=25`)), 'pay');
  assert.equal(intentFromParams(q(`intent=send&recipient=${RECIPIENT}`)), 'send');
  assert.equal(intentFromParams(q('recipient=0x123')), 'add');
});

test('an amount in the link is used only when it is a positive number', () => {
  assert.equal(amountFromParams(q('amount=25')), 25);
  assert.equal(amountFromParams(q('amount=0')), null);
  assert.equal(amountFromParams(q('amount=abc')), null);
  assert.equal(amountFromParams(q('')), null);
});

const record = (over: Partial<{ id: string; startedAt: number; direction: 'in' | 'out'; sourceChainKey: string; phase: string }>) => ({
  id: 'r', startedAt: 1_000, direction: 'in' as const, sourceChainKey: 'baseSepolia', phase: 'approving', ...over,
});

test('the page finds the transfer its own press started', () => {
  const records = [
    record({ id: 'new', startedAt: 2_000 }),
    record({ id: 'out', startedAt: 2_500, direction: 'out' }),
    record({ id: 'old', startedAt: 500 }),
  ];
  assert.equal(startedRecord(records, 1_500, { direction: 'in', chainKey: 'baseSepolia' })?.id, 'new');
  assert.equal(startedRecord(records, 1_500, { direction: 'out', chainKey: 'baseSepolia' })?.id, 'out');
  assert.equal(startedRecord(records, 3_000, { direction: 'in', chainKey: 'baseSepolia' }), null);
});

test('a record without a direction counts as arriving', () => {
  const legacy = { id: 'legacy', startedAt: 2_000, sourceChainKey: 'sepolia', phase: 'attesting' };
  assert.equal(startedRecord([legacy], 1_000, { direction: 'in', chainKey: 'sepolia' })?.id, 'legacy');
});

test('only a transfer still in flight from the last hour takes over the page on return', () => {
  const now = 10 * RESUME_WINDOW_MS;
  const inFlight = record({ id: 'live', startedAt: now - 60_000, phase: 'attesting' });
  const stale = record({ id: 'stale', startedAt: now - RESUME_WINDOW_MS - 1, phase: 'attesting' });
  const finished = record({ id: 'done', startedAt: now - 1_000, phase: 'done' });
  const failed = record({ id: 'err', startedAt: now - 1_000, phase: 'error' });
  const send = record({ id: 'send', startedAt: now - 1_000, phase: 'burning', sourceChainKey: 'arc' });
  assert.equal(resumableRecord([finished, failed, send, inFlight], now, 'in')?.id, 'live');
  assert.equal(resumableRecord([stale, finished], now, 'in'), null);
});

test('a transfer going the other way never takes over the page', () => {
  const now = 10 * RESUME_WINDOW_MS;
  const arriving = record({ id: 'deposit', startedAt: now - 60_000, phase: 'attesting' });
  const leaving = record({ id: 'move', startedAt: now - 60_000, phase: 'burning', direction: 'out' });
  assert.equal(resumableRecord([arriving], now, 'out'), null);
  assert.equal(resumableRecord([arriving, leaving], now, 'out')?.id, 'move');
});

test('the page promises a notice on arrival only where one will come', () => {
  assert.equal(willNotifyOnArrival('add'), true);
  assert.equal(willNotifyOnArrival('move'), true);
  assert.equal(willNotifyOnArrival('pay'), false);
  assert.equal(willNotifyOnArrival('send'), false);
});
