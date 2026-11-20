import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { FitInput } from './fitAlert.js';

process.chdir(mkdtempSync(join(tmpdir(), 'offerfits-')));
delete process.env.DATABASE_URL;

const { scanBuyersForListing } = await import('./buyerHistoryScan.js');
const { saveAgentWallets } = await import('../db/agentWallets.js');
const { createBrief } = await import('../db/briefs.js');
const { bus } = await import('../events.js');

/// A new offer for sale with fit alerts on (view 96): the person it fits hears
/// once through the fit path; nobody else is sent news.

const SELLER = '0x' + '5'.repeat(40);
const FITS = '0x' + 'a'.repeat(40);
const OTHER = '0x' + 'b'.repeat(40);

test('with the fit path, an offer reaches only the people it fits, and no news goes to each person', async () => {
  for (const [i, user] of [SELLER, FITS, OTHER].entries()) {
    await saveAgentWallets({ userAddress: user, buyerWalletId: `wb${i}`, buyerAddress: '0x' + String(i + 1).repeat(40), sellerWalletId: `ws${i}`, sellerAddress: '0x' + String(i + 4).repeat(40) });
  }
  createBrief({ jobId: '0x' + '1'.repeat(64), briefText: 'Need capacitors and electronics components for a repair shop', postedBy: FITS });
  createBrief({ jobId: '0x' + '2'.repeat(64), briefText: 'A logo for my bakery', postedBy: OTHER });
  const events: string[] = [];
  const stop = bus.subscribe((e) => { if (e.type === 'listing.new' || e.type === 'listing.match.proactive') events.push(e.type); });
  const told: FitInput[] = [];
  try {
    const listing = {
      id: 'l_parts', sellerUser: SELLER, title: 'Electronics Parts Supplier', description: 'Components in stock', askingPriceUsdc: 40,
    } as Parameters<typeof scanBuyersForListing>[0];
    const out = await scanBuyersForListing(listing, { tellFit: async (i) => { told.push(i); } });
    assert.deepEqual(out, { fits: 1, news: 0 });
    assert.deepEqual(told.map((t) => [t.to, t.kind, t.what, t.path, t.facts.amountUsdc]), [[FITS, 'offer', 'fits', '/listings/l_parts', 40]]);
    assert.deepEqual(events, [], 'neither the old fit event nor news per person');
  } finally {
    stop();
  }
});
