import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// A display name belongs to one account. Linking X before a profile exists
/// used to copy the X name straight in, which is how two accounts could read
/// the same in a list of offers.
///
///   npx tsx --test src/db/profileNames.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-names-')));
delete process.env.DATABASE_URL;

const { upsertProfile } = await import('./profiles.js');
const { freeDisplayName } = await import('./profiles.js');

const TAKEN_BY = '0x1111111111111111111111111111111111111111';
const NEWCOMER = '0x2222222222222222222222222222222222222222';
await upsertProfile({ address: TAKEN_BY, role: 'seller', displayName: 'Forge Coder' } as never);

test('a free name is kept', async () => {
  assert.equal(await freeDisplayName(['Ada Lovelace'], NEWCOMER), 'Ada Lovelace');
});

test('a name someone holds is skipped, whatever its case, for the next free one', async () => {
  assert.equal(await freeDisplayName(['forge coder ', 'forgecoder_x'], NEWCOMER), 'forgecoder_x');
});

test('nothing free leaves the name for the person to choose', async () => {
  assert.equal(await freeDisplayName(['Forge Coder'], NEWCOMER), '');
});

test('your own name is yours', async () => {
  assert.equal(await freeDisplayName(['Forge Coder'], TAKEN_BY), 'Forge Coder');
});
