import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The public traction routes are open only while PUBLIC_TRACTION_ENABLED is
/// on, so they can be closed again without a code change. Chain-derived totals
/// (/api/network/lifetime, /contracts) are not behind it.
///
///   npx tsx --test src/routes/publicTractionClosed.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-traction-closed-')));
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.PUBLIC_TRACTION_ENABLED;

const { dealsRoutes } = await import('./deals.js');
const { networkRoutes } = await import('./network.js');

for (const [name, routes, path] of [
  ['deals feed', dealsRoutes, '/feed'],
  ['deals stats', dealsRoutes, '/stats'],
  ['paid reads', networkRoutes, '/reads'],
] as const) {
  test(`${name} is closed when the switch is off`, async () => {
    const res = await routes.request(path);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not available' });
  });
}

test('the dispute policy stays public', async () => {
  const res = await networkRoutes.request('/dispute-policy');
  assert.equal(res.status, 200);
});
