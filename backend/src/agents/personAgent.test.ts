import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryProgressStore } from '../db/agentProgress.js';
import type { Insight } from '../intelligence/insights.js';
import { newAgentRecord, type AgentRecord } from './agentRecord.js';
import { briefTick, inQuietHours, onOfferOnRequest, type PersonAgentDeps, type PersonEvent } from './personAgent.js';

///   npx tsx --test src/agents/personAgent.test.ts

// Lagos is UTC+1: 07:00 UTC is 08:00 there.
const at = (hourUtc: number, minute = 0) => Date.UTC(2026, 10, 5, hourUtc, minute);

const cheaper = (key: string): Insight => ({
  kind: 'cheaper-better-sellers', key, jobId: 'job-1', title: 'Logo', numbers: { count: 2, priceUsdc: 80, lowestUsdc: 65, bestRating: 3 }, action: { kind: 'show-offers', jobId: 'job-1' }, weight: 0.2,
});

function harness(over: { records?: AgentRecord[]; now?: number; empty?: boolean; failFor?: string } = {}) {
  let now = over.now ?? at(7, 5);
  const records = over.records ?? [newAgentRecord('0xada')];
  const events: PersonEvent[] = [];
  const closed: string[][] = [];
  const progress = memoryProgressStore();
  const deps: PersonAgentDeps = {
    now: () => now,
    people: async () => records,
    locale: async () => 'en',
    progress,
    gather: async (owner) => {
      if (owner === over.failFor) throw new Error('read failed');
      return over.empty
        ? { newOffers: [], questions: { count: 0, firstDecideAt: null }, dealsWaiting: 0, insights: [], goals: [] }
        : { newOffers: [{ jobId: 'job-1', title: 'Logo', count: 2, bestUsdc: 40 }], questions: { count: 0, firstDecideAt: null }, dealsWaiting: 0, insights: [], goals: [] };
    },
    recordFor: async (owner) => records.find((r) => r.owner === owner) ?? null,
    ownerOfRequest: async () => '0xada',
    insightForOffer: async () => cheaper('cheaper:job-1'),
    emit: (e) => events.push(e),
    closeGoals: async (_o, ids) => {
      closed.push(ids);
    },
    markInsightsSent: async () => {},
  };
  return { deps, events, closed, progress, setNow: (t: number) => (now = t) };
}

test('briefWaitsForItsHour', async () => {
  const h = harness({ now: at(6, 30) });
  await briefTick(h.deps);
  assert.equal(h.events.length, 0, '07:30 in Lagos is before 8:00');
  h.setNow(at(7, 0));
  await briefTick(h.deps);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0]!.type, 'agent.brief');
  assert.deepEqual(h.events[0]!.data.lines, ['Logo: 2 new offers, the best 40 USDC.']);
  assert.equal(h.events[0]!.data.heading, 'Your morning brief');
});

test('briefOncePerDayAcrossRestart', async () => {
  const h = harness();
  await briefTick(h.deps);
  await briefTick(h.deps);
  // A second server or a restart: a fresh loop on the same log.
  await briefTick({ ...h.deps });
  assert.equal(h.events.length, 1);
  assert.equal((await h.progress.toldSince('0xada', 0)).filter((r) => r.kind === 'brief')[0]!.state, 'sent');
  // The next local day it goes again.
  h.setNow(at(7, 0) + 86_400_000);
  await briefTick(h.deps);
  assert.equal(h.events.length, 2);
});

test('briefOffSendsNothing', async () => {
  const h = harness({ records: [{ ...newAgentRecord('0xada'), brief: { on: false, hour: 8, timeZone: 'Africa/Lagos' } }] });
  await briefTick(h.deps);
  assert.equal(h.events.length, 0);
});

test('emptyBriefNotSent', async () => {
  const h = harness({ empty: true });
  await briefTick(h.deps);
  await briefTick(h.deps);
  assert.equal(h.events.length, 0);
  const rows = await h.progress.toldSince('0xada', 0);
  assert.equal(rows.length, 1, 'the empty day is logged once, so the loop does not gather again every hour');
  assert.deepEqual(rows[0]!.data, { lines: [] });
});

test('the brief hour is read in the person’s own time zone', async () => {
  const h = harness({ records: [{ ...newAgentRecord('0xada'), brief: { on: true, hour: 8, timeZone: 'Asia/Kolkata' } }], now: at(2, 0) });
  await briefTick(h.deps);
  assert.equal(h.events.length, 0, '07:30 in Kolkata');
  h.setNow(at(2, 31));
  await briefTick(h.deps);
  assert.equal(h.events.length, 1);
});

test('quietHoursHoldLiveNotes', async () => {
  assert.equal(inQuietHours(22, { from: 21, to: 7 }), true);
  assert.equal(inQuietHours(6, { from: 21, to: 7 }), true);
  assert.equal(inQuietHours(7, { from: 21, to: 7 }), false);
  assert.equal(inQuietHours(13, { from: 12, to: 14 }), true);
  assert.equal(inQuietHours(22, null), false);
  // 21:30 UTC is 22:30 in Lagos.
  const h = harness({ now: at(21, 30) });
  assert.equal(await onOfferOnRequest(h.deps, 'job-1'), 'quiet');
  assert.equal(h.events.length, 0);
  h.setNow(at(12));
  assert.equal(await onOfferOnRequest(h.deps, 'job-1'), 'sent');
  assert.equal(h.events[0]!.type, 'agent.note');
  assert.deepEqual(h.events[0]!.data.lines, ['Logo: 2 sellers with a record as good as this one charge less than 80 USDC, from 65 USDC.']);
  assert.equal(await onOfferOnRequest(h.deps, 'job-1'), 'told', 'the same insight is not told twice');
});

test('liveNoteRespectsDailyInsightCap', async () => {
  const h = harness({ now: at(12) });
  for (const key of ['a', 'b', 'c']) await h.progress.claim('0xada', '2026-11-05', 'insight', key, {}, at(9));
  assert.equal(await onOfferOnRequest(h.deps, 'job-1'), 'cap');
  assert.equal(h.events.length, 0);
});

test('oneFailingPersonDoesNotStopOthers', async () => {
  const h = harness({ records: [newAgentRecord('0xbad'), newAgentRecord('0xada')], failFor: '0xbad' });
  await briefTick(h.deps);
  assert.deepEqual(h.events.map((e) => e.user), ['0xada']);
});

test('an expired goal the brief told is closed', async () => {
  const record: AgentRecord = { ...newAgentRecord('0xada'), goals: [{ id: 'g1', kind: 'buy', text: 'a logo', createdAt: 0, until: at(1) }] };
  const h = harness({ records: [record] });
  h.deps.gather = async () => ({
    newOffers: [], questions: { count: 0, firstDecideAt: null }, dealsWaiting: 0, insights: [],
    goals: [{ goal: record.goals![0]!, line: 'expired', numbers: {} }],
  });
  await briefTick(h.deps);
  assert.deepEqual(h.events[0]!.data.lines, ['Your goal, a logo, reached its end date and is closed.']);
  assert.deepEqual(h.closed, [['g1']]);
});
