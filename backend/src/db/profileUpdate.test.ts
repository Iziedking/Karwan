import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The flat-file store resolves its path from cwd at import, so move first.
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-profile-')));
delete process.env.DATABASE_URL;
const { getProfile, updateProfile, upsertProfile } = await import('./profiles.js');

const ADDRESS = '0x1111111111111111111111111111111111111111';

test('overlapping profile updates each land instead of the last one winning', async () => {
  await upsertProfile({ address: ADDRESS, role: 'both', displayName: 'Amina' });
  const writers = Array.from({ length: 25 }, (_, index) =>
    updateProfile(ADDRESS, (profile) => ({
      ...profile,
      skillVerifications: [
        ...((profile.skillVerifications as unknown[] | undefined) ?? []),
        { skill: `skill-${index}` },
      ] as typeof profile.skillVerifications,
    })),
  );
  await Promise.all(writers);
  const saved = await getProfile(ADDRESS);
  assert.equal((saved?.skillVerifications as unknown[] | undefined)?.length, 25);
});

test('a mutation that returns null leaves the profile untouched', async () => {
  const before = await getProfile(ADDRESS);
  const result = await updateProfile(ADDRESS, () => null);
  assert.equal(result, null);
  assert.deepEqual(await getProfile(ADDRESS), before);
});

test('an unknown address is not created by an update', async () => {
  assert.equal(await updateProfile('0x2222222222222222222222222222222222222222', (profile) => profile), null);
});
