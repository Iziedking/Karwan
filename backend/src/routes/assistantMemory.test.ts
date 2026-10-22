import assert from 'node:assert/strict';
import test from 'node:test';

delete process.env.DATABASE_URL;

const { createAssistantMemoryRoutes } = await import('./assistantMemory.js');
const store = await import('../db/assistantMemory.js');

///   npx tsx --test src/routes/assistantMemory.test.ts

function app(address: string | null) {
  return createAssistantMemoryRoutes({
    sessionAddress: () => address,
    get: store.getMemory,
    setEnabled: store.setMemoryEnabled,
    deleteNote: (a, id) => store.deleteNotes(a, [id]),
    forgetAll: store.forgetAllNotes,
  });
}

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

test('signed out sees nothing', async () => {
  for (const [path, init] of [['/', undefined], ['/enabled', json({ on: false })], ['/notes/x', { method: 'DELETE' }], ['/', { method: 'DELETE' }]] as const) {
    assert.equal((await app(null).request(path, init)).status, 401, path);
  }
});

test('the account sees its notes newest first, and can delete one, all, or switch memory off', async () => {
  store.__resetMemoryForTest();
  await store.addNotes('0xa', { add: ['Sells logo design'], replace: [] });
  await store.addNotes('0xa', { add: ['Ships to Kano'], replace: [] });
  await store.addNotes('0xb', { add: ['Not yours'], replace: [] });

  const read = await (await app('0xA').request('/')).json() as { enabled: boolean; notes: Array<{ id: string; text: string }> };
  assert.equal(read.enabled, true);
  assert.deepEqual(read.notes.map((n) => n.text), ['Ships to Kano', 'Sells logo design']);

  assert.equal((await app('0xa').request('/notes/missing', { method: 'DELETE' })).status, 404);
  const afterOne = await (await app('0xa').request(`/notes/${read.notes[0].id}`, { method: 'DELETE' })).json() as { notes: Array<{ text: string }> };
  assert.deepEqual(afterOne.notes.map((n) => n.text), ['Sells logo design']);

  const off = await (await app('0xa').request('/enabled', json({ on: false }))).json() as { enabled: boolean };
  assert.equal(off.enabled, false);
  assert.equal((await app('0xa').request('/enabled', json({ on: 'no' }))).status, 400);

  const cleared = await (await app('0xa').request('/', { method: 'DELETE' })).json() as { notes: unknown[] };
  assert.deepEqual(cleared.notes, []);
  assert.equal((await store.getMemory('0xb')).notes.length, 1, 'another account is untouched');
});
