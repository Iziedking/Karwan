import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetRange } from './budgetRange.js';
import { runBook, type BookDeps } from './bookRunner.js';
import { stepBook, type Book, type BookContext, type BookEvent } from './negotiationBook.js';

/// View 73, task 8: the buyer agent carries out the book, every seller at once.

const ctx: BookContext = {
  jobId: '0xjob',
  budgetUsdc: 222,
  leewayPct: 0,
  range: budgetRange(222),
  marketUsdc: null,
  agreeForMe: true,
  timeUsed: 0.1,
  deadlineDays: 5,
  latestDays: null,
  now: 1_000_000,
  watchdogMs: 180_000,
  liveScores: new Map(),
};

function harness(failFor?: string) {
  const log: string[] = [];
  const waits = new Map<string, number>();
  let stored = 0;
  const deps: BookDeps = {
    persist: async () => {
      stored += 1;
    },
    send: async (c) => {
      if (c.seller === failFor) throw new Error('board down');
      log.push(`counter ${c.seller} ${c.round} ${c.priceUsdc} stored=${stored}`);
    },
    agree: async (s, p) => void log.push(`agree ${s} ${p}`),
    ask: async (s, p, g) => void log.push(`ask ${s} ${p} ${g}`),
    end: async (s, r) => void log.push(`end ${s} ${r}`),
    armWait: (s, at) => void waits.set(s, at),
    clearWait: (s) => void waits.delete(s),
    warn: () => {},
  };
  const book: Book = new Map();
  const feed = (ev: BookEvent) => runBook(book, stepBook(book, ev, ctx), deps);
  return { log, waits, book, feed };
}

test('with bargain on, a reply from one seller does not wait on another\'s counter', async () => {
  const h = harness();
  await h.feed({ kind: 'offer', seller: '0xA', priceUsdc: '200', counterable: true });
  await h.feed({ kind: 'offer', seller: '0xB', priceUsdc: '210', counterable: true });
  await h.feed({ kind: 'reply', seller: '0xB', priceUsdc: '205', accepted: false });
  await h.feed({ kind: 'reply', seller: '0xA', priceUsdc: '195', accepted: false });
  assert.deepEqual(h.log.map((l) => l.split(' ').slice(0, 3).join(' ')), ['counter 0xA 1', 'counter 0xB 1', 'counter 0xB 2', 'counter 0xA 2']);
  assert.ok(h.log.every((l) => !l.endsWith('stored=0')), 'every counter is stored before it is sent');
  assert.equal(h.waits.size, 2, 'each seller has its own wait');
  assert.equal(h.book.get('0xa')!.pending, null, 'a sent counter is no longer waiting to be sent');
});

test('one seller agreeing or going quiet leaves the others bargaining', async () => {
  const h = harness();
  await h.feed({ kind: 'offer', seller: '0xA', priceUsdc: '200', counterable: true });
  await h.feed({ kind: 'offer', seller: '0xB', priceUsdc: '210', counterable: true });
  await h.feed({ kind: 'timeout', seller: '0xA' });
  assert.deepEqual([...h.waits.keys()], ['0xB']);
  await h.feed({ kind: 'reply', seller: '0xB', priceUsdc: '168', accepted: true });
  assert.deepEqual(h.log.slice(-2), ['end 0xA no-reply', 'agree 0xB 168.00']);
  assert.equal(h.waits.size, 0);
});

test('a counter the board refuses ends that negotiation alone', async () => {
  const h = harness('0xA');
  await h.feed({ kind: 'offer', seller: '0xA', priceUsdc: '200', counterable: true });
  await h.feed({ kind: 'offer', seller: '0xB', priceUsdc: '210', counterable: true });
  assert.deepEqual(h.log.map((l) => l.split(' ').slice(0, 3).join(' ')), ['end 0xA counter-not-sent', 'counter 0xB 1']);
  assert.equal(h.book.get('0xa')!.state, 'ended');
  assert.equal(h.book.get('0xb')!.state, 'open');
});
