import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneySounds, DEDUPE_WINDOW_MS, HOLD_MAX_MS, type SoundPlayer } from './moneySounds';

function rig() {
  let t = 1_000_000;
  const played: string[] = [];
  const player: SoundPlayer = {
    money: (kind) => played.push(kind),
    notice: () => played.push('notice'),
  };
  const sounds = createMoneySounds(player, () => t);
  return { sounds, played, advance: (ms: number) => { t += ms; } };
}

const tx = (id: string) => ({ ids: [id] });

test('a pressed money button swooshes', () => {
  const { sounds, played } = rig();
  sounds.submit();
  assert.deepEqual(played, ['swoosh']);
});

test('only a confirmed movement drops the coin', () => {
  const { sounds, played } = rig();
  sounds.outcome('pending', tx('a'));
  sounds.outcome('reverted', tx('b'));
  sounds.outcome('success', tx('c'));
  assert.deepEqual(played, ['coinDrop']);
});

test('an outcome with no ids still drops the coin', () => {
  const { sounds, played } = rig();
  sounds.outcome('success', { ids: [] });
  assert.deepEqual(played, ['coinDrop']);
});

test('money in chimes, money out waves, anything else keeps the old tone', () => {
  const { sounds, played } = rig();
  sounds.notified('in', tx('1'));
  sounds.notified('out', tx('2'));
  sounds.notified(null, tx('3'));
  assert.deepEqual(played, ['coin', 'wave', 'notice']);
});

test('one movement makes one sound however many events describe it', () => {
  const { sounds, played } = rig();
  sounds.notified('in', { ids: ['KRW-1', '0xABC'] });
  sounds.notified('in', { ids: ['0xabc'] });
  assert.deepEqual(played, ['coin']);
});

test('the same movement sounds again once the window has passed', () => {
  const { sounds, played, advance } = rig();
  sounds.notified('in', tx('x'));
  advance(DEDUPE_WINDOW_MS + 1);
  sounds.notified('in', tx('x'));
  assert.deepEqual(played, ['coin', 'coin']);
});

test('a notification for a movement the screen already sounded stays quiet', () => {
  const { sounds, played, advance } = rig();
  sounds.outcome('success', tx('r'));
  advance(60_000);
  sounds.notified('out', tx('r'));
  assert.deepEqual(played, ['coinDrop']);
});

test('a notification racing a pressed button stays quiet, and the outcome still drops the coin', () => {
  const { sounds, played } = rig();
  sounds.submit();
  sounds.notified('out', tx('r'));
  sounds.outcome('success', tx('r'));
  assert.deepEqual(played, ['swoosh', 'coinDrop']);
});

test('the hold ends shortly after the outcome', () => {
  const { sounds, played, advance } = rig();
  sounds.submit();
  sounds.outcome('success', tx('r'));
  advance(4_000);
  sounds.notified('in', tx('other'));
  assert.deepEqual(played, ['swoosh', 'coinDrop', 'coin']);
});

test('the hold never outlives a flow that stopped reporting', () => {
  const { sounds, played, advance } = rig();
  sounds.submit();
  advance(HOLD_MAX_MS + 1);
  sounds.notified('in', tx('other'));
  assert.deepEqual(played, ['swoosh', 'coin']);
});

test('a plain tone on a deal never eats a payment on that deal', () => {
  const { sounds, played } = rig();
  sounds.notified(null, { ids: [], deal: '0xjob' });
  sounds.notified('in', { ids: ['0xtx'], deal: '0xjob' });
  assert.deepEqual(played, ['notice', 'coin']);
});

test('an event without ids is matched by its deal', () => {
  const { sounds, played } = rig();
  sounds.notified('in', { ids: ['0xtx'], deal: '0xjob' });
  sounds.notified('in', { ids: [], deal: '0xjob' });
  assert.deepEqual(played, ['coin']);
});

test('two releases on one deal each chime', () => {
  const { sounds, played } = rig();
  sounds.notified('in', { ids: ['0xa'], deal: '0xjob' });
  sounds.notified('in', { ids: ['0xb'], deal: '0xjob' });
  assert.deepEqual(played, ['coin', 'coin']);
});

test('a claimed movement stays quiet but its own outcome still drops the coin', () => {
  const { sounds, played } = rig();
  sounds.claim(tx('r'));
  sounds.notified('out', tx('r'));
  sounds.outcome('success', tx('r'));
  assert.deepEqual(played, ['coinDrop']);
});

test('two outcomes for one movement drop one coin', () => {
  const { sounds, played } = rig();
  sounds.outcome('success', tx('b1'));
  sounds.outcome('success', { ids: ['b1', '0xmint'] });
  assert.deepEqual(played, ['coinDrop']);
});

test('a notification never throws when the player does', () => {
  const sounds = createMoneySounds({
    money: () => { throw new Error('no audio'); },
    notice: () => { throw new Error('no audio'); },
  });
  assert.doesNotThrow(() => {
    sounds.submit();
    sounds.notified('in', tx('1'));
    sounds.notified(null, tx('2'));
    sounds.outcome('success', tx('3'));
  });
});
