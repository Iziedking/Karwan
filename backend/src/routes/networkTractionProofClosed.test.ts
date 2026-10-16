import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/// With PUBLIC_TRACTION_ENABLED unset, the traction proof is closed like the
/// other traction routes, so unsetting one switch closes them all.
///
///   npx tsx --test src/routes/networkTractionProofClosed.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-traction-proof-closed-')));
delete process.env.DATABASE_URL;
delete process.env.PUBLIC_TRACTION_ENABLED;

const { networkRoutes } = await import('./network.js');

test('the proof is not served while the switch is off', async () => {
  const res = await networkRoutes.request(new Request('http://local/traction-proof'));
  assert.equal(res.status, 404);
});
