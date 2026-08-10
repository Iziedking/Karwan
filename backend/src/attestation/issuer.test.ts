import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';

/// What the signature is worth.
///
/// credential.test.ts guards the shape of the agreement. This file guards the one
/// thing a consumer actually relies on: that a document we publish was signed by
/// the key our manifest names, over exactly the values the document displays.
///
/// A proof that verifies while covering different values than the reader sees is
/// worse than no proof, because it passes every check a careful consumer performs.
/// Most of the tests below are that failure, approached from a different field
/// each time.
///
///   npx tsx --test src/attestation/issuer.test.ts

/// Hardhat's first well-known development account. Published in their docs and
/// burned a hundred thousand times over; it exists here so the test derives a real
/// signature rather than asserting against a recorded one.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Set before the first import, because config reads the environment once at module
// load and the issuer memoises the key it finds.
process.env.ATTESTATION_ISSUER_PRIVATE_KEY = TEST_KEY;
delete process.env.ATTESTATION_ISSUER_ADDRESS;

const {
  issueDealSettled,
  verifyDealSettled,
  issuerAddress,
  issuanceEnabled,
  keyMatchesDeclaredAddress,
} = await import('./issuer.js');
const { dealSettledSchema, attestationId, dealRef, issuerManifest } = await import(
  './credential.js'
);

const CHAIN_ID = 5042002;

function input(over: Partial<Parameters<typeof issueDealSettled>[0]> = {}) {
  return {
    jobId: 'job-1',
    subject: '0x2222222222222222222222222222222222222222',
    role: 'seller' as const,
    settledAt: Date.parse('2026-08-06T10:00:00.000Z'),
    amountUsdc: 4200,
    viaDispute: false,
    chainId: CHAIN_ID,
    ...over,
  };
}

async function issued(over: Parameters<typeof input>[0] = {}) {
  const out = await issueDealSettled(input(over));
  assert.ok(out, 'the test key must produce a document');
  return out;
}

test('the issuer signs with the key it publishes', async () => {
  const expected = privateKeyToAccount(TEST_KEY).address;
  assert.equal(issuanceEnabled(), true);
  assert.equal(issuerAddress(), expected);

  const { document } = await issued();
  assert.equal(document.issuer.address, expected);
  // The manifest is where a consumer learns which key to check against, so it has
  // to name the one that actually signed.
  assert.equal(issuerManifest(CHAIN_ID, issuerAddress()).issuer.address, expected);
  assert.equal(await verifyDealSettled(document), true);
});

test('the signature covers every value the document displays', async () => {
  // One mutation per signed field. If any of these still verifies, that field is
  // decoration: a reader would see it, and a verifier would not be checking it.
  const { document } = await issued();
  const mutations: Array<[string, () => typeof document]> = [
    ['subject', () => ({ ...document, subject: { address: '0x3333333333333333333333333333333333333333' } })],
    ['dealRef', () => ({ ...document, claim: { ...document.claim, dealRef: dealRef('job-2') } })],
    ['role', () => ({ ...document, claim: { ...document.claim, role: 'buyer' as const } })],
    ['settledAt', () => ({ ...document, claim: { ...document.claim, settledAt: '2020-01-01T00:00:00.000Z' } })],
    ['amountBand', () => ({ ...document, claim: { ...document.claim, amountBand: 'over-100k' as const } })],
    ['chainId', () => ({ ...document, claim: { ...document.claim, chainId: 1 } })],
    ['viaDispute', () => ({ ...document, claim: { ...document.claim, viaDispute: true } })],
  ];

  for (const [field, mutate] of mutations) {
    assert.equal(
      await verifyDealSettled(mutate()),
      false,
      `changing ${field} must break the proof`,
    );
  }
});

test('a document claiming a different issuer does not verify', async () => {
  // The attack this closes: take a real Karwan attestation, rewrite the issuer
  // address to one you control, and present it as yours. The signature is over the
  // claim, so the swapped address is what fails.
  const { document } = await issued();
  const forged = {
    ...document,
    issuer: { ...document.issuer, address: '0x4444444444444444444444444444444444444444' },
  };
  assert.equal(await verifyDealSettled(forged), false);
});

test('an unsigned document never passes as evidence', async () => {
  const { document } = await issued();
  const { proof: _dropped, ...unsigned } = document;
  assert.equal(await verifyDealSettled(unsigned as typeof document), false);
});

test('a signed document still validates against the published schema', async () => {
  // The proof block is part of the schema, so adding it must not make our own
  // documents fail our own agreement.
  const { document } = await issued();
  const errs = validate(dealSettledSchema(), document);
  assert.deepEqual(errs, [], errs.join('\n'));
});

test('the same deal and role always produce the same id', async () => {
  // Idempotency lives here, not in the sweep. The sweep re-reads every settled deal
  // on every tick, so a fresh id per pass would publish a new statement about one
  // event every hour.
  const a = await issued();
  const b = await issued();
  assert.equal(a.id, b.id);
  assert.equal(a.dealRef, b.dealRef);

  const otherRole = await issued({ role: 'buyer' });
  const otherDeal = await issued({ jobId: 'job-2' });
  assert.notEqual(a.id, otherRole.id, 'both sides of a deal are separate statements');
  assert.notEqual(a.id, otherDeal.id);
});

test('the id is a single URL path segment', () => {
  // It is served at /attestations/{id}.json and named by the revocation list, so
  // anything needing escaping would break one of the two.
  const id = attestationId(dealRef('job-1'), 'seller');
  assert.equal(encodeURIComponent(id), id);
  assert.ok(!id.includes('/'));
  assert.ok(!id.includes('0x'), 'the 0x prefix would read as a path oddity, not a hash');
});

test('issuedAt is when we said it, settledAt is when it happened', async () => {
  // A backfill issues decades-old settlements today. Collapsing the two would make
  // a catch-up sweep look like a burst of fresh trading.
  const { document } = await issued();
  assert.equal(document.claim.settledAt, '2026-08-06T10:00:00.000Z');
  assert.notEqual(document.issuedAt, document.claim.settledAt);
  assert.ok(Date.parse(document.issuedAt) > Date.parse(document.claim.settledAt));
});

test('neither the raw deal id nor the exact amount reaches the document', async () => {
  const { document } = await issued();
  assert.ok(
    !JSON.stringify(document).includes('job-1'),
    'publishing the id lets anyone enumerate a business against the public job board',
  );
  // Checked against the claim's own values rather than the serialised document,
  // because Arc's chain id is 5042002 and a substring search for an amount finds
  // digits inside it.
  assert.equal(document.claim.amountBand, '1k-10k');
  for (const [field, value] of Object.entries(document.claim)) {
    assert.notEqual(value, 4200, `${field} carries the exact amount`);
    assert.notEqual(value, '4200', `${field} carries the exact amount`);
  }
});

test('a declared address that does not match the key refuses to sign', () => {
  // Fail closed. The manifest publishes the declared address as the verification
  // key, so signing with any other one produces a run of documents that every
  // consumer reads as forged.
  const derived = privateKeyToAccount(TEST_KEY).address;
  assert.equal(keyMatchesDeclaredAddress(undefined, derived), true);
  assert.equal(keyMatchesDeclaredAddress(derived.toLowerCase(), derived), true);
  assert.equal(keyMatchesDeclaredAddress(derived.toUpperCase().replace('0X', '0x'), derived), true);
  assert.equal(
    keyMatchesDeclaredAddress('0x5555555555555555555555555555555555555555', derived),
    false,
  );
});

/// Same minimal validator as credential.test.ts, for the same reason: checking our
/// own document against our own schema should not need a dependency.
function validate(schema: any, value: any, path = '$'): string[] {
  const errs: string[] = [];
  if (schema.const !== undefined && value !== schema.const) {
    errs.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errs.push(`${path}: ${JSON.stringify(value)} not in enum`);
  }
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null) {
      errs.push(`${path}: expected object`);
      return errs;
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) errs.push(`${path}.${key}: required but missing`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties?.[key]) errs.push(`${path}.${key}: not allowed by the schema`);
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errs.push(...validate(sub, value[key], `${path}.${key}`));
    }
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') errs.push(`${path}: expected string`);
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errs.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    }
  }
  if (schema.type === 'integer' && !Number.isInteger(value)) errs.push(`${path}: expected integer`);
  if (schema.type === 'boolean' && typeof value !== 'boolean') errs.push(`${path}: expected boolean`);
  return errs;
}
