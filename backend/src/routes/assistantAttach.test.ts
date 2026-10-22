import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssistantAttachRoutes, type AttachRouteDeps } from './assistantAttach.js';

/// A photo or PDF added in assistant mode goes through the same intake as one
/// sent to the agent on Telegram: read as an invoice for your own work.
///
///   npx tsx --test src/routes/assistantAttach.test.ts

function harness(over: Partial<AttachRouteDeps> = {}) {
  const seen: Array<{ address: string; bytes: number; mimeType: string }> = [];
  const deps: AttachRouteDeps = {
    sessionAddress: () => '0xada',
    intake: async (address, file) => {
      seen.push({ address, bytes: file.bytes.length, mimeType: file.mimeType });
      return ['Got it: an invoice to Tunde Stores for 250 USD, dated 2026-03-14.'];
    },
    ...over,
  };
  const app = createAssistantAttachRoutes(deps);
  const post = (file: File | null) => {
    const form = new FormData();
    if (file) form.append('file', file);
    return app.request('/', { method: 'POST', body: form });
  };
  return { post, seen };
}

test('no session, nothing is read', async () => {
  const h = harness({ sessionAddress: () => null });
  assert.equal((await h.post(new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }))).status, 401);
  assert.equal(h.seen.length, 0);
});

test('an image or PDF goes through the intake and the reply comes back as text', async () => {
  const h = harness();
  const res = await h.post(new File([new Uint8Array([1, 2, 3])], 'invoice.pdf', { type: 'application/pdf' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reply: 'Got it: an invoice to Tunde Stores for 250 USD, dated 2026-03-14.' });
  assert.deepEqual(h.seen, [{ address: '0xada', bytes: 3, mimeType: 'application/pdf' }]);
});

test('no file, the wrong kind of file, or one over 10 MB is refused before reading', async () => {
  const h = harness();
  assert.equal((await h.post(null)).status, 400);
  assert.equal((await h.post(new File(['x'], 'a.txt', { type: 'text/plain' }))).status, 415);
  assert.equal((await h.post(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }))).status, 413);
  assert.equal(h.seen.length, 0);
});
