import { Hono } from 'hono';
import { arcTestnet } from '../chain/client.js';
import {
  dealSettledSchema,
  issuerManifest,
  DEAL_SETTLED_TYPE,
} from '../attestation/credential.js';

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
  return c.json(issuerManifest(arcTestnet.id));
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
attestationRoutes.get('/attestations/revocations.json', (c) => {
  c.header('cache-control', CACHE);
  return c.json({
    schemaVersion: 1,
    issuer: issuerManifest(arcTestnet.id).issuer.domain,
    type: DEAL_SETTLED_TYPE,
    revoked: [] as Array<{ id: string; revokedAt: string; reason: string }>,
  });
});
