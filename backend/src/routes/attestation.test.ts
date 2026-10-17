import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// What verifiers and the passport read about published deal statements.
///
///   npx tsx --test src/routes/attestation.test.ts

const source = readFileSync(new URL('./attestation.ts', import.meta.url), 'utf8');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-attestation-routes-')));
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;

const { attestationRoutes } = await import('./attestation.js');

test('statements about a person are revalidated on every read, so a removal shows at once', async () => {
  const res = await attestationRoutes.request('/attestations/by-subject/0x1111111111111111111111111111111111111111.json');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, no-cache');
  for (const route of ["'/attestations/revocations.json'", "'/attestations/by-subject/:address'", "'/attestations/:id/vc'", "'/attestations/:id',"]) {
    const start = source.indexOf(`attestationRoutes.get(${route}`);
    assert.ok(start > 0, route);
    const body = source.slice(start, source.indexOf('});', start));
    assert.match(body, /cache-control', FRESH\)/, route);
  }
});

test('the Karwan context defines every term the W3C copy uses', async () => {
  const res = await attestationRoutes.request('/schemas/deal-settled/v1.context.jsonld');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/ld\+json/);
  const ctx = ((await res.json()) as { '@context': Record<string, unknown> })['@context'];
  for (const term of ['KarwanDealSettled', 'KarwanRevocationList', 'KarwanEip712Signature', 'dealRef', 'role', 'settledAt', 'amountBand', 'currency', 'chainId', 'viaDispute', 'revocationList', 'revoked', 'address', 'eip712']) {
    assert.ok(term in ctx, term);
  }
});
