import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/// A job id is not a secret: open requests publish theirs on the market and a
/// matched listing shows its own. So every read keyed by a job id must decide
/// who is asking from the signed session (or, for the CRE workflow, its bearer
/// token), never from the id or a caller the client names.
const FILES = ['jobs.ts', 'deals.ts', 'chat.ts', 'cashout.ts', 'offers.ts', 'creDeliveryRequest.ts'];
const IDENTITY = /viewerAddress\(c\)|sessionAddress\(c\)|readSession\(c\)|isSessionSelf\(c,|session\(c\)|CRE_DELIVERY_REQUEST_TOKEN/;

test('every read keyed by a job id checks the signed session, never the id alone', async () => {
  const checked: string[] = [];
  for (const file of FILES) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    // A router-wide guard (the CRE bearer token) covers every route in its file.
    const guarded = /\.use\('\*'/.test(source) && IDENTITY.test(source.slice(0, source.search(/Routes\.get\(/)));
    const routes = [...source.matchAll(/\w+Routes\.get\('([^']*:jobId[^']*)'/g)];
    for (const [i, match] of routes.entries()) {
      const start = match.index!;
      const next = source.slice(start + 1).search(/\n\w+Routes\.(get|post|patch|put|delete|use)\(/);
      const handler = source.slice(start, next < 0 ? undefined : start + 1 + next);
      checked.push(`${file} ${match[1]}`);
      if (guarded) continue;
      // Public, deliberately: status-only views say so in the handler.
      assert.ok(IDENTITY.test(handler), `${file} GET ${match[1]} (route ${i + 1}) reads by job id without checking the session`);
    }
  }
  assert.ok(checked.length >= 10, `expected the job routes to be found, saw ${checked.length}`);
});

test('the public listing view still carries no negotiation floor or seed key', async () => {
  const source = await readFile(new URL('../marketplace/publicListing.ts', import.meta.url), 'utf8');
  assert.match(source, /negotiationMaxDecreasePct: _floor/);
  assert.match(source, /seedKey, \.\.\.rest/);
});
