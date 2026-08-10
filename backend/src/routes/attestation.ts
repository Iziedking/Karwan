import { Hono } from 'hono';
import { arcTestnet } from '../chain/client.js';
import {
  dealSettledSchema,
  issuerManifest,
  subjectUrl,
  DEAL_SETTLED_TYPE,
} from '../attestation/credential.js';
import { issuerAddress } from '../attestation/issuer.js';
import {
  getAttestation,
  listAttestationsForSubject,
  listRevokedAttestations,
} from '../db/attestations.js';

/// The public face of Karwan as an attestation issuer.
///
/// Three documents, all generated from one module so the published schema cannot
/// drift from the code that emits attestations:
///
///   /.well-known/attestation-issuer.json   who we are, what we issue, how to verify
///   /schemas/deal-settled/v1.json          the agreement itself
///   /attestations/revocations.json         what we have withdrawn
///
/// This is deliberately the same shape as the two agreements this codebase already
/// honours. We serve OAuth authorization-server metadata at /.well-known so clients
/// can configure themselves without asking, and the MCP package carries a
/// server.json validated against a published schema. Neither was negotiated over
/// chat. Publishing first also settles who authors the schema: a consumer that
/// reads ours conforms to ours.
export const attestationRoutes = new Hono();

/// Cacheable and public. These are stable documents, and a verifier hitting them on
/// every attestation should be served from a cache rather than our origin.
const CACHE = 'public, max-age=300, stale-while-revalidate=86400';

attestationRoutes.get('/.well-known/attestation-issuer.json', (c) => {
  c.header('cache-control', CACHE);
  return c.json(issuerManifest(arcTestnet.id, issuerAddress()));
});

attestationRoutes.get('/schemas/deal-settled/v1.json', (c) => {
  c.header('cache-control', CACHE);
  return c.json(dealSettledSchema());
});

/// Revocation list.
///
/// A flat list of attestation ids rather than a bitstring status list. Bitstrings
/// exist to keep a verifier from learning WHICH credential you are checking, which
/// matters for personal credentials and not for public settlement records. A list a
/// human can read is worth more here than privacy we do not need.
///
/// Empty is the correct and expected state. Paytag counts revocations on the issuer
/// profile, so using this is an incident, not a workflow: nothing reversible gets
/// attested in the first place.
attestationRoutes.get('/attestations/revocations.json', async (c) => {
  const rows = await listRevokedAttestations();
  c.header('cache-control', CACHE);
  return c.json({
    schemaVersion: 1,
    issuer: issuerManifest(arcTestnet.id, issuerAddress()).issuer.domain,
    type: DEAL_SETTLED_TYPE,
    revoked: rows.map((r) => ({
      id: r.id,
      revokedAt: new Date(r.revokedAt ?? 0).toISOString(),
      reason: r.revokedReason ?? 'unspecified',
    })),
  });
});

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/// Everything Karwan has attested about one address.
///
/// The endpoint the manifest points a consumer at, and the reason the rest of
/// this exists: Paytag holds a wallet and needs to ask what we have said about
/// it. Public and unauthenticated by design. These are statements we chose to
/// publish about deals whose escrows are already on a public chain, and evidence
/// behind a key is not evidence, because a consumer who has to negotiate access
/// scores us as absent instead.
///
/// An address with nothing on it returns an empty list and a 200, not a 404. The
/// question "what has Karwan attested about this wallet" has a correct answer for
/// every wallet, and "nothing" is one of them.
attestationRoutes.get('/attestations/by-subject/:address', async (c) => {
  const raw = c.req.param('address').replace(/\.json$/, '');
  if (!ADDRESS.test(raw)) {
    return c.json({ error: 'not an address' }, 400);
  }
  const rows = await listAttestationsForSubject(raw);
  c.header('cache-control', CACHE);
  return c.json({
    schemaVersion: 1,
    subject: raw.toLowerCase(),
    self: subjectUrl(raw),
    count: rows.length,
    // The documents themselves, not references. A consumer that has to make one
    // request per attestation to learn anything will make none.
    attestations: rows.map((r) => ({
      ...r.document,
      ...(r.revokedAt ? { revokedAt: new Date(r.revokedAt).toISOString() } : {}),
    })),
  });
});

/// One attestation by id, for a holder who has a document and wants to confirm we
/// still stand behind it.
attestationRoutes.get('/attestations/:id', async (c) => {
  const id = c.req.param('id').replace(/\.json$/, '');
  const row = await getAttestation(id);
  if (!row) return c.json({ error: 'unknown attestation' }, 404);
  c.header('cache-control', CACHE);
  return c.json({
    ...row.document,
    ...(row.revokedAt
      ? {
          revokedAt: new Date(row.revokedAt).toISOString(),
          revokedReason: row.revokedReason ?? 'unspecified',
        }
      : {}),
  });
});
