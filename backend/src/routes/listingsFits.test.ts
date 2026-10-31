import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-fits-')));
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ??= 'listing-fits-test-secret-at-least-32-characters';
process.env.SHORTLIST_MODE = '1';

const { signSession } = await import('../auth/session.js');
const { createBrief, patchBrief } = await import('../db/briefs.js');
const { listingsRoutes } = await import('./listings.js');

const ADA = '0x00000000000000000000000000000000000000aa';
const BISI = '0x00000000000000000000000000000000000000bb';
const cookieOf = (address: string) => `karwan_session=${signSession({ address, method: 'circle', email: 'a@example.com' })}`;

test('a seller learns which open requests they fit, and nobody else can ask for them', async () => {
  createBrief({ jobId: `0x${'1'.repeat(64)}`, briefText: 'Logo for a food business', postedBy: BISI });
  patchBrief(`0x${'1'.repeat(64)}`, { shortlist: [{ sellerUser: ADA }] as never });
  const mine = await listingsRoutes.request(`/fits?caller=${ADA}`, { headers: { cookie: cookieOf(ADA) } });
  assert.equal(mine.status, 200);
  assert.deepEqual(await mine.json(), { jobIds: [`0x${'1'.repeat(64)}`] });
  assert.equal((await listingsRoutes.request(`/fits?caller=${ADA}`, { headers: { cookie: cookieOf(BISI) } })).status, 403);
  assert.equal((await listingsRoutes.request(`/fits?caller=${ADA}`)).status, 403);
});
