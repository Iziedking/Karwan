import assert from 'node:assert/strict';
import test from 'node:test';
import { counterTurns } from './counterTurns.js';

/// A seller's agent answers one counter at a time. A counter that arrives while
/// it is still finishing its last reply waits and is answered next, never
/// dropped (bug B-10: the buyer countered back within half a second, the seller
/// was still writing its reason line, and every negotiation ended as no reply).

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { opened, open };
};

test('a counter that arrives mid-reply is answered once the reply is done', async () => {
  const turns = counterTurns<string>();
  let busy = false;
  const answered: string[] = [];
  const first = gate();
  const answer = async (c: string) => {
    busy = true;
    if (c === 'round 1') await first.opened;
    answered.push(c);
    busy = false;
  };
  const one = turns.turn('job:seller', 'round 1', () => busy, answer);
  await turns.turn('job:seller', 'round 2', () => busy, answer);
  assert.deepEqual(answered, [], 'round 2 waits while round 1 is being answered');
  first.open();
  await one;
  assert.deepEqual(answered, ['round 1', 'round 2']);
});

test('only the newest waiting counter is answered', async () => {
  const turns = counterTurns<string>();
  let busy = false;
  const answered: string[] = [];
  const first = gate();
  const answer = async (c: string) => {
    busy = true;
    if (c === 'round 1') await first.opened;
    answered.push(c);
    busy = false;
  };
  const one = turns.turn('k', 'round 1', () => busy, answer);
  await turns.turn('k', 'round 2', () => busy, answer);
  await turns.turn('k', 'round 3', () => busy, answer);
  first.open();
  await one;
  assert.deepEqual(answered, ['round 1', 'round 3']);
});

test('one offer waiting never holds up another', async () => {
  const turns = counterTurns<string>();
  const busy = new Set<string>();
  const answered: string[] = [];
  const first = gate();
  const answer = (k: string) => async (c: string) => {
    busy.add(k);
    if (c === 'a1') await first.opened;
    answered.push(c);
    busy.delete(k);
  };
  const a = turns.turn('a', 'a1', () => busy.has('a'), answer('a'));
  await turns.turn('b', 'b1', () => busy.has('b'), answer('b'));
  assert.deepEqual(answered, ['b1']);
  first.open();
  await a;
  assert.deepEqual(answered, ['b1', 'a1']);
});

test('a failed reply still lets the waiting counter be answered, then reports the failure', async () => {
  const turns = counterTurns<string>();
  let busy = false;
  const answered: string[] = [];
  const first = gate();
  const answer = async (c: string) => {
    busy = true;
    try {
      if (c === 'round 1') {
        await first.opened;
        throw new Error('model timed out');
      }
      answered.push(c);
    } finally {
      busy = false;
    }
  };
  const one = turns.turn('k', 'round 1', () => busy, answer);
  await turns.turn('k', 'round 2', () => busy, answer);
  first.open();
  await assert.rejects(one, /model timed out/);
  assert.deepEqual(answered, ['round 2']);
});
