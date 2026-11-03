import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-own-brief-')));
delete process.env.DATABASE_URL;

const { firstOwnBriefSkip } = await import('./listings.js');

test('the own-request skip is written once per request and listing, not on every sweep', () => {
  assert.equal(firstOwnBriefSkip('0xJob1', 'listing-1'), true);
  assert.equal(firstOwnBriefSkip('0xjob1', 'listing-1'), false);
  assert.equal(firstOwnBriefSkip('0xjob1', 'listing-2'), true);
  assert.equal(firstOwnBriefSkip('0xjob2', 'listing-1'), true);
});
