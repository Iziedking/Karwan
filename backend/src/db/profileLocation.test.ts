import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// Where a person is stays on their profile, privately, across updates.
///
///   npx tsx --test src/db/profileLocation.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-profile-location-')));
delete process.env.DATABASE_URL;
const { getProfile, upsertProfile } = await import('./profiles.js');

const base = { address: '0xada', role: 'seller' as const, displayName: 'Ada' };
const lagos = { country: 'NG', city: 'Lagos', area: 'Yaba', reach: {} };

test('an update that omits location keeps it', async () => {
  await upsertProfile({ ...base, location: lagos });
  await upsertProfile({ ...base, displayName: 'Ada Obi' });
  assert.deepEqual((await getProfile('0xada'))?.location, lagos);
});
