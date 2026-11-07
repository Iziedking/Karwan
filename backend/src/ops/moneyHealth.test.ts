import assert from 'node:assert/strict';
import test from 'node:test';
import { alertsFor, alertText, moneyHealth, moneyHealthTick, type AlertState, type MoneyHealthInput } from './moneyHealth.js';

const NOW = 1_770_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function input(extra: Partial<MoneyHealthInput> = {}): MoneyHealthInput {
  return {
    now: NOW,
    movements: [],
    owed: { count: 0, totalMicros: 0n },
    bridges: [],
    watchers: [{ name: 'dealWatcher', label: 'Deal watcher', status: 'healthy' }],
    lastSweep: { at: NOW - 5 * MIN, looked: 0, young: 0, fixed: [], left: [], bridgesFinished: 0 },
    ...extra,
  };
}

const line = (h: ReturnType<typeof moneyHealth>, key: string) => h.lines.find((l) => l.key === key)!;

test('all clear when nothing is stuck, owed or stalled', () => {
  const h = moneyHealth(input());
  assert.equal(h.ok, true);
  assert.ok(h.lines.every((l) => l.ok));
});

test('a movement in needs_attention is counted with the oldest reference', () => {
  const h = moneyHealth(
    input({
      movements: [
        { reference: 'KWN-NEW', kind: 'cash_out', state: 'needs_attention', updatedAt: NOW - 5 * MIN },
        { reference: 'KWN-OLD', kind: 'milestone_payout', state: 'needs_attention', updatedAt: NOW - 3 * HOUR },
      ],
    }),
  );
  const l = line(h, 'needs_attention');
  assert.equal(h.ok, false);
  assert.equal(l.count, 2);
  assert.deepEqual(l.oldest, { reference: 'KWN-OLD', at: NOW - 3 * HOUR });
});

test('other open movements count as stuck only after an hour', () => {
  const h = moneyHealth(
    input({
      movements: [
        { reference: 'KWN-AIR', kind: 'cash_out', state: 'submitted', updatedAt: NOW - 20 * MIN },
        { reference: 'KWN-STK', kind: 'cash_out', state: 'verifying', updatedAt: NOW - 2 * HOUR },
      ],
    }),
  );
  assert.equal(line(h, 'stuck').count, 1);
  assert.equal(line(h, 'stuck').oldest?.reference, 'KWN-STK');
});

test('an open owed balance is a line with its total, and an unreadable read is not clear', () => {
  const owed = moneyHealth(input({ owed: { count: 2, totalMicros: 40_250_000n } }));
  assert.equal(line(owed, 'owed').count, 2);
  assert.equal(line(owed, 'owed').detail, '40.25 USDC');
  const unread = moneyHealth(input({ owed: null }));
  assert.equal(line(unread, 'owed').ok, false);
});

test('a bridge unfinished after an hour counts; a finished or failed one does not', () => {
  const h = moneyHealth(
    input({
      bridges: [
        { bridgeId: 'b-old', status: 'relaying', updatedAt: NOW - 2 * HOUR },
        { bridgeId: 'b-new', status: 'burning', updatedAt: NOW - 10 * MIN },
        { bridgeId: 'b-done', status: 'minted', updatedAt: NOW - 5 * HOUR },
        { bridgeId: 'b-err', status: 'error', updatedAt: NOW - 5 * HOUR },
      ],
    }),
  );
  assert.equal(line(h, 'bridges').count, 1);
  assert.equal(line(h, 'bridges').oldest?.reference, 'b-old');
});

test('a stalled or missing watcher is named; dormant and starting are fine', () => {
  const h = moneyHealth(
    input({
      watchers: [
        { name: 'dealWatcher', label: 'Deal watcher', status: 'stalled' },
        { name: 'poWatcher', label: 'PO watcher', status: 'dormant' },
        { name: 'balanceWatcher', label: 'Balance watcher', status: 'missing' },
        { name: 'trendScout', label: 'Trend scout', status: 'starting' },
      ],
    }),
  );
  assert.equal(line(h, 'watchers').count, 2);
  assert.equal(line(h, 'watchers').detail, 'Deal watcher, Balance watcher');
});

test('the scheduled check is not clear when it has not run for 45 minutes', () => {
  assert.equal(line(moneyHealth(input({ lastSweep: null })), 'sweep').ok, false);
  const late = moneyHealth(input({ lastSweep: { at: NOW - 50 * MIN, looked: 0, young: 0, fixed: [], left: [], bridgesFinished: 0 } }));
  assert.equal(line(late, 'sweep').ok, false);
});

test('an alert goes once when a line opens, not on the next run, and once when it clears', () => {
  const stuck = moneyHealth(
    input({ movements: [{ reference: 'KWN-OLD', kind: 'cash_out', state: 'needs_attention', updatedAt: NOW - 3 * HOUR }] }),
  ).lines;
  const first = alertsFor({}, stuck, NOW);
  assert.deepEqual(first.alerts.map((a) => [a.key, a.kind]), [['needs_attention', 'opened']]);
  const again = alertsFor(first.next, stuck, NOW + 15 * MIN);
  assert.deepEqual(again.alerts, []);
  const clear = moneyHealth(input()).lines;
  const cleared = alertsFor(again.next, clear, NOW + 30 * MIN);
  assert.deepEqual(cleared.alerts.map((a) => [a.key, a.kind]), [['needs_attention', 'cleared']]);
  assert.deepEqual(cleared.next, {});
});

test('a line still open after a day gets one reminder', () => {
  const stuck = moneyHealth(input({ owed: { count: 1, totalMicros: 1_000_000n } })).lines;
  const first = alertsFor({}, stuck, NOW);
  assert.deepEqual(alertsFor(first.next, stuck, NOW + 23 * HOUR).alerts, []);
  const day = alertsFor(first.next, stuck, NOW + 24 * HOUR);
  assert.deepEqual(day.alerts.map((a) => [a.key, a.kind]), [['owed', 'reminder']]);
  assert.deepEqual(alertsFor(day.next, stuck, NOW + 25 * HOUR).alerts, []);
});

test('the alert text names the line, the count and the oldest reference', () => {
  const stuck = moneyHealth(
    input({ movements: [{ reference: 'KWN-OLD', kind: 'cash_out', state: 'needs_attention', updatedAt: NOW - 3 * HOUR }] }),
  ).lines;
  const [alert] = alertsFor({}, stuck, NOW).alerts;
  assert.equal(alertText(alert!), 'Money health: 1 money movement needs attention. Oldest: KWN-OLD.');
  const [clear] = alertsFor({ needs_attention: { openedAt: NOW, remindedAt: NOW } }, moneyHealth(input()).lines, NOW).alerts;
  assert.equal(alertText(clear!), 'Money health: cleared. No money movement needs attention.');
});

test('a tick runs the check, alerts once, and a restart with the stored state does not alert again', async () => {
  let stored: Record<string, unknown> = {};
  const sent: string[][] = [];
  const stuckInput = input({ movements: [{ reference: 'KWN-OLD', kind: 'cash_out', state: 'needs_attention', updatedAt: NOW - 3 * HOUR }] });
  const deps = () => ({
    now: () => NOW,
    sweep: async () => ({ at: NOW, looked: 1, young: 0, fixed: [], left: [], bridgesFinished: 0 }),
    saveSweep: async () => {},
    read: async () => stuckInput,
    loadAlerts: async () => stored as AlertState,
    saveAlerts: async (s: AlertState) => {
      stored = s;
    },
    send: async (texts: string[]) => {
      sent.push(texts);
    },
  });
  await moneyHealthTick(deps());
  await moneyHealthTick(deps());
  assert.deepEqual(sent, [['Money health: 1 money movement needs attention. Oldest: KWN-OLD.']]);
});

test('an alert that could not be sent is tried again on the next tick', async () => {
  let stored: AlertState = {};
  let fail = true;
  const sent: string[][] = [];
  const deps = {
    now: () => NOW,
    sweep: async () => ({ at: NOW, looked: 0, young: 0, fixed: [], left: [], bridgesFinished: 0 }),
    saveSweep: async () => {},
    read: async () => input({ owed: { count: 1, totalMicros: 1_000_000n } }),
    loadAlerts: async () => stored,
    saveAlerts: async (s: AlertState) => {
      stored = s;
    },
    send: async (texts: string[]) => {
      if (fail) throw new Error('telegram down');
      sent.push(texts);
    },
  };
  await assert.rejects(moneyHealthTick(deps));
  fail = false;
  await moneyHealthTick(deps);
  assert.equal(sent.length, 1);
});
