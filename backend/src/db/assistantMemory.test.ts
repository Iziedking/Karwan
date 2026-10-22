import assert from 'node:assert/strict';
import test from 'node:test';

delete process.env.DATABASE_URL;

const { addNotes, deleteMemoryOf, deleteNotes, forgetAllNotes, getMemory, setMemoryEnabled, __resetMemoryForTest } = await import('./assistantMemory.js');

///   npx tsx --test src/db/assistantMemory.test.ts

test('memory starts on and empty, and keeps notes per account', async () => {
  __resetMemoryForTest();
  assert.deepEqual(await getMemory('0xA'), { enabled: true, notes: [], updatedAt: 0 });
  await addNotes('0xA', { add: ['Sells logo design'], replace: [] });
  assert.equal((await getMemory('0xa')).notes[0].text, 'Sells logo design');
  assert.equal((await getMemory('0xb')).notes.length, 0);
});

test('off stops new notes and keeps the old ones until deleted', async () => {
  __resetMemoryForTest();
  await addNotes('0xa', { add: ['Ships to Kano'], replace: [] });
  await setMemoryEnabled('0xa', false);
  await addNotes('0xa', { add: ['Budget 300 USDC'], replace: [] });
  const off = await getMemory('0xa');
  assert.equal(off.enabled, false);
  assert.deepEqual(off.notes.map((n) => n.text), ['Ships to Kano']);
  await setMemoryEnabled('0xa', true);
  assert.equal((await getMemory('0xa')).notes.length, 1);
});

test('one note, every note, or the whole account can be forgotten', async () => {
  __resetMemoryForTest();
  await addNotes('0xa', { add: ['One', 'Two'], replace: [] });
  const [first] = (await getMemory('0xa')).notes;
  assert.equal(await deleteNotes('0xa', [first.id]), true);
  assert.equal(await deleteNotes('0xa', ['missing']), false);
  assert.deepEqual((await getMemory('0xa')).notes.map((n) => n.text), ['Two']);
  await forgetAllNotes('0xa');
  assert.equal((await getMemory('0xa')).notes.length, 0);
  await setMemoryEnabled('0xa', false);
  await deleteMemoryOf('0xa');
  assert.equal((await getMemory('0xa')).enabled, true);
});
