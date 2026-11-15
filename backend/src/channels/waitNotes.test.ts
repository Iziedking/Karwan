import assert from 'node:assert/strict';
import test from 'node:test';
import { tipForChat, withWaitNotes } from './waitNotes.js';
import waitTips from './waitTips.json' with { type: 'json' };

/// A clock the test moves by hand.
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: ((fn: () => void, ms: number) => {
        const id = ++seq;
        timers.set(id, { at: now + ms, fn });
        return id;
      }) as unknown as typeof setTimeout,
      clear: ((id: number) => {
        timers.delete(id);
      }) as unknown as typeof clearTimeout,
    },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await Promise.resolve();
      }
      now = end;
      await Promise.resolve();
    },
  };
}

/// Work that ends when the test says so.
function heldWork<T>() {
  let settle: { ok: (v: T) => void; fail: (e: Error) => void } = { ok: () => undefined, fail: () => undefined };
  const promise = new Promise<T>((ok, fail) => {
    settle = { ok, fail };
  });
  return { work: () => promise, settle };
}

test('typing goes out at once and every 4 s, then stops', async () => {
  const clock = fakeClock();
  const log: string[] = [];
  const held = heldWork<string>();
  const done = withWaitNotes(held.work, { typing: async () => { log.push('typing'); }, timers: clock.timers });
  await clock.advance(9_000);
  held.settle.ok('answer');
  assert.equal(await done, 'answer');
  await clock.advance(10_000);
  assert.deepEqual(log, ['typing', 'typing', 'typing']);
});

test('one tip on a slow turn, before the answer', async () => {
  const clock = fakeClock();
  const log: string[] = [];
  const held = heldWork<string>();
  const done = withWaitNotes(held.work, { tip: async () => { log.push('tip'); }, timers: clock.timers });
  await clock.advance(3_999);
  assert.deepEqual(log, []);
  await clock.advance(5_000);
  held.settle.ok('answer');
  await done;
  assert.deepEqual(log, ['tip']);
});

test('no tip on a fast turn', async () => {
  const clock = fakeClock();
  const log: string[] = [];
  const held = heldWork<string>();
  const done = withWaitNotes(held.work, { tip: async () => { log.push('tip'); }, timers: clock.timers });
  await clock.advance(3_000);
  held.settle.ok('answer');
  await done;
  await clock.advance(10_000);
  assert.deepEqual(log, []);
});

test('a failed turn still stops, and its error is passed on', async () => {
  const clock = fakeClock();
  const log: string[] = [];
  const held = heldWork<string>();
  const done = withWaitNotes(held.work, { typing: async () => { log.push('typing'); }, tip: async () => { log.push('tip'); }, timers: clock.timers });
  await clock.advance(6_000);
  held.settle.fail(new Error('model down'));
  await assert.rejects(done, /model down/);
  await clock.advance(10_000);
  assert.deepEqual(log, ['typing', 'typing', 'tip']);
});

test('a failing typing call never breaks the turn', async () => {
  const clock = fakeClock();
  const held = heldWork<string>();
  const done = withWaitNotes(held.work, { typing: async () => { throw new Error('telegram down'); }, timers: clock.timers });
  await clock.advance(5_000);
  held.settle.ok('answer');
  assert.equal(await done, 'answer');
});

test('tips rotate per chat through the deal and safety tips', () => {
  const pool = [...waitTips.deal, ...waitTips.safety];
  const a = [tipForChat('chat-a'), tipForChat('chat-a'), tipForChat('chat-a')];
  assert.equal(new Set(a).size, 3);
  for (const tip of a) assert.ok(pool.includes(tip));
  assert.equal(tipForChat('chat-b'), a[0]);
});
