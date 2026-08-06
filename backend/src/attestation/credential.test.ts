import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMOUNT_BANDS,
  DEAL_SETTLED_EIP712_TYPES,
  DEAL_SETTLED_TYPE,
  amountBand,
  dealRef,
  dealSettledSchema,
  issuerManifest,
  schemaUrl,
} from './credential.js';

/// The schema IS the agreement, so these tests guard the agreement.
///
/// The point of publishing a self-describing credential is that a consumer never
/// has to ask what a field means. That only holds if the published schema and the
/// code that emits documents cannot drift, and if a breaking change cannot happen
/// by accident. Everything here is one of those two things.
///
///   npx tsx --test src/attestation/credential.test.ts

/// A minimal validator. Enough for the shapes this schema uses (required, const,
/// enum, pattern, type, additionalProperties) and no more: pulling in a full
/// JSON Schema library to check our own document would be a dependency earning
/// nothing.
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

function example() {
  return {
    type: DEAL_SETTLED_TYPE,
    schema: schemaUrl(),
    id: 'karwan-att-000001',
    issuer: {
      name: 'Karwan' as const,
      domain: 'karwan.site',
      address: '0x1111111111111111111111111111111111111111',
    },
    subject: { address: '0x2222222222222222222222222222222222222222' },
    claim: {
      dealRef: dealRef('job-1'),
      role: 'seller' as const,
      settledAt: '2026-08-06T10:00:00.000Z',
      amountBand: '1k-10k' as const,
      currency: 'USDC' as const,
      chainId: 5042002,
      viaDispute: false,
    },
    issuedAt: '2026-08-06T10:00:01.000Z',
    status: { listUrl: 'https://karwan.site/attestations/revocations.json' },
  };
}

test('a real attestation validates against the published schema', () => {
  const errs = validate(dealSettledSchema(), example());
  assert.deepEqual(errs, [], errs.join('\n'));
});

test('the schema refuses an unknown field', () => {
  // additionalProperties: false is what makes a v1 consumer safe. If we could add
  // fields silently, "conforms to v1" would stop meaning anything.
  const bad = { ...example(), score: 900 };
  const errs = validate(dealSettledSchema(), bad);
  assert.ok(
    errs.some((e) => e.includes('score')),
    'an extra field must fail validation',
  );
});

test('the schema refuses a score, a tier or an aggregate', () => {
  // Not a style rule. Karwan attests to observations; the moment it publishes a
  // computed standing it becomes the assessor, and the consumer is being asked to
  // trust our judgement rather than our records.
  const props = Object.keys(dealSettledSchema().properties.claim.properties);
  for (const banned of ['score', 'tier', 'dealCount', 'totalVolume', 'disputeRate', 'rating']) {
    assert.ok(!props.includes(banned), `claim must not carry ${banned}`);
  }
});

test('the claim carries no counterparty and no raw deal id', () => {
  const props = Object.keys(dealSettledSchema().properties.claim.properties);
  assert.ok(!props.includes('counterparty'), 'a counterparty is not ours to publish');
  assert.ok(!props.includes('jobId'), 'the raw deal id would let anyone enumerate a business');
  assert.ok(props.includes('dealRef'), 'the commitment is what makes a deal provable without publishing it');
});

test('there is no expiry, because an event does not stop having happened', () => {
  const props = Object.keys(dealSettledSchema().properties);
  assert.ok(!props.includes('expiresAt'));
});

test('the manifest points at the schema the credential points at', () => {
  // A manifest naming a different URL than the credentials do is a manifest nobody
  // can use to validate.
  const m = issuerManifest(5042002);
  const declared = m.credentialTypes[0]!;
  assert.equal(declared.type, DEAL_SETTLED_TYPE);
  assert.equal(declared.schemaUrl, schemaUrl());
  assert.equal(declared.schemaUrl, dealSettledSchema().$id);
  assert.equal(example().schema, declared.schemaUrl);
});

test('the manifest publishes the EIP-712 types a verifier needs', () => {
  // Their side has an issuer contract that checks an attestation, so it has to be
  // able to rebuild the digest. Field ORDER is part of the hash, so publishing the
  // type array is publishing the hash definition.
  const m = issuerManifest(5042002);
  assert.deepEqual(m.credentialTypes[0]!.proof.types, DEAL_SETTLED_EIP712_TYPES);
  assert.equal(m.credentialTypes[0]!.proof.domain.chainId, 5042002);
});

test('every EIP-712 field exists on the claim, and nothing signed is missing', () => {
  // A signature over fields the schema does not carry, or a schema field the
  // signature does not cover, is a document that verifies but does not mean what it
  // appears to. Both directions are checked.
  const signed = DEAL_SETTLED_EIP712_TYPES.DealSettled.map((f) => f.name);
  const claim = Object.keys(dealSettledSchema().properties.claim.properties);
  for (const f of signed) {
    if (f === 'subject') continue; // lives on the envelope, not the claim
    assert.ok(claim.includes(f), `${f} is signed but not in the claim`);
  }
  for (const f of claim) {
    assert.ok(signed.includes(f), `${f} is in the claim but not covered by the signature`);
  }
});

test('amount bands cover the range with no gap and no overlap', () => {
  assert.equal(amountBand(0), 'under-100');
  assert.equal(amountBand(99.99), 'under-100');
  assert.equal(amountBand(100), '100-1k');
  assert.equal(amountBand(999.99), '100-1k');
  assert.equal(amountBand(1_000), '1k-10k');
  assert.equal(amountBand(99_999), '10k-100k');
  assert.equal(amountBand(100_000), 'over-100k');
  // A NaN must not silently land in a high band.
  assert.equal(amountBand(Number.NaN), 'under-100');
  assert.equal(new Set(AMOUNT_BANDS).size, AMOUNT_BANDS.length);
});

test('the deal reference is stable, opaque and per deal', () => {
  assert.equal(dealRef('job-1'), dealRef('job-1'));
  assert.notEqual(dealRef('job-1'), dealRef('job-2'));
  assert.match(dealRef('job-1'), /^0x[a-f0-9]{64}$/);
  // The raw id must not be recoverable by reading it.
  assert.ok(!dealRef('job-1').includes('job'));
});

test('the type name carries its version', () => {
  // Versioning lives in the type and the URL, never in a field, so a consumer pins
  // by fetching one document and never has to branch on content.
  assert.match(DEAL_SETTLED_TYPE, /\.v\d+$/);
  assert.match(schemaUrl(), /\/v1\.json$/);
});
