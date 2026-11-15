import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceLevel, frameVerdict, readSaved, saveDown, stepDown } from './level';

const base = { reducedMotion: false, saveData: false, effectiveType: '4g' as string | undefined, deviceMemory: 8 as number | undefined, cores: 8 as number | undefined };

test('reduced motion, Save-Data and 2G get still frames', () => {
  assert.equal(deviceLevel({ ...base, reducedMotion: true }), 'still');
  assert.equal(deviceLevel({ ...base, saveData: true }), 'still');
  assert.equal(deviceLevel({ ...base, effectiveType: '2g' }), 'still');
  assert.equal(deviceLevel({ ...base, effectiveType: 'slow-2g' }), 'still');
});

test('little memory, few cores or 3G get the lite page', () => {
  assert.equal(deviceLevel({ ...base, deviceMemory: 4 }), 'lite');
  assert.equal(deviceLevel({ ...base, deviceMemory: 2 }), 'lite');
  assert.equal(deviceLevel({ ...base, cores: 4 }), 'lite');
  assert.equal(deviceLevel({ ...base, effectiveType: '3g' }), 'lite');
});

test('a normal device, or one that reports nothing, gets the full page', () => {
  assert.equal(deviceLevel(base), 'full');
  assert.equal(deviceLevel({ reducedMotion: false, saveData: false, effectiveType: undefined, deviceMemory: undefined, cores: undefined }), 'full');
  assert.equal(deviceLevel({ ...base, deviceMemory: 4.5, cores: 6 }), 'full');
});

test('frames are judged only after 60 of them, and a quarter running late steps down', () => {
  assert.equal(frameVerdict(Array(59).fill(50)), 'keep');
  const late = [...Array(45).fill(8), ...Array(15).fill(40)];
  assert.equal(frameVerdict(late), 'down');
  const fine = [...Array(46).fill(16), ...Array(14).fill(40)];
  assert.equal(frameVerdict(fine), 'keep');
  assert.equal(frameVerdict(Array(120).fill(34)), 'keep');
});

test('one step down at a time, and still stays still', () => {
  assert.equal(stepDown('full'), 'lite');
  assert.equal(stepDown('lite'), 'still');
  assert.equal(stepDown('still'), 'still');
});

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }, data };
}

test('a saved step down is kept for 30 days', () => {
  const now = Date.UTC(2026, 10, 15);
  const store = memory();
  saveDown(store, 'lite', now);
  assert.equal(readSaved(store, now + 29 * 86_400_000), 'lite');
  assert.equal(readSaved(store, now + 31 * 86_400_000), null);
});

test('a saved level that is unreadable or unknown is ignored', () => {
  const now = Date.UTC(2026, 10, 15);
  assert.equal(readSaved(memory({ 'karwan.motionLevel': 'not json' }), now), null);
  assert.equal(readSaved(memory({ 'karwan.motionLevel': JSON.stringify({ level: 'turbo', at: now }) }), now), null);
  assert.equal(readSaved(memory(), now), null);
});

test('a storage that throws never breaks the page', () => {
  const broken = { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('private mode'); } };
  assert.equal(readSaved(broken, Date.now()), null);
  assert.doesNotThrow(() => saveDown(broken, 'lite', Date.now()));
});
