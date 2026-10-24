import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_TOKEN ??= 'update-images-test-token-at-least-32-chars-long';
const { adminUpdatesRoutes, updatesRoutes } = await import('./updates.js');

const headers = { 'content-type': 'application/json', 'x-admin-token': process.env.ADMIN_API_TOKEN! };

function png(width: number, height: number): string {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return `data:image/png;base64,${Buffer.from(b).toString('base64')}`;
}

test('an admin uploads a picture and the card path serves it to anyone', async () => {
  const res = await adminUpdatesRoutes.request('/images', { method: 'POST', headers, body: JSON.stringify({ dataUrl: png(1600, 900) }) });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { image: string; width: number; height: number };
  assert.match(body.image, /^\/api\/updates\/images\/[a-f0-9]{24}\.png$/);
  assert.deepEqual([body.width, body.height], [1600, 900]);

  const served = await updatesRoutes.request(body.image.replace('/api/updates', ''));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.match(served.headers.get('cache-control') ?? '', /immutable/);
});

test('only an admin can upload, and a small picture is refused with its size', async () => {
  const anon = await adminUpdatesRoutes.request('/images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl: png(1600, 900) }) });
  assert.equal(anon.status, 401);
  const small = await adminUpdatesRoutes.request('/images', { method: 'POST', headers, body: JSON.stringify({ dataUrl: png(640, 360) }) });
  assert.equal(small.status, 400);
  assert.match(((await small.json()) as { error: string }).error, /640x360/);
  assert.equal((await updatesRoutes.request('/images/nothing-here.png')).status, 404);
});
