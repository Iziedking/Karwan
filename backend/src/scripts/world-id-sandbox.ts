import { IDKit, orbLegacy } from '@worldcoin/idkit-core';

const apiBase = process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const appId = process.env.WORLD_ID_APP_ID;
const rpId = process.env.WORLD_ID_RP_ID;
const action = process.env.WORLD_ID_ACTION;
const environment = process.env.WORLD_ID_ENVIRONMENT ?? 'staging';

if (!apiBase || !appId || !rpId || !action) {
  throw new Error('PUBLIC_API_BASE_URL, WORLD_ID_APP_ID, WORLD_ID_RP_ID and WORLD_ID_ACTION are required');
}
if (environment !== 'staging') throw new Error('This script is intentionally staging-only');

const signatureResponse = await fetch(`${apiBase}/api/world-id/rp-signature`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action }),
});
if (!signatureResponse.ok) throw new Error(`RP signature request failed: ${signatureResponse.status}`);
const signature = await signatureResponse.json() as {
  sig: string; nonce: string; created_at: number; expires_at: number;
};

const request = await IDKit.request({
  app_id: appId as `app_${string}`,
  action,
  rp_context: {
    rp_id: rpId,
    nonce: signature.nonce,
    created_at: signature.created_at,
    expires_at: signature.expires_at,
    signature: signature.sig,
  },
  allow_legacy_proofs: true,
  environment: 'staging',
}).preset(orbLegacy({ signal: 'karwan-ethonline-sandbox' }));

console.log(JSON.stringify({
  executionMode: 'world-id-sandbox',
  provider: 'world-id-simulator',
  connectorURI: request.connectorURI,
  expiresAt: signature.expires_at,
}, null, 2));

const result = await request.pollUntilCompletion();
const verifyResponse = await fetch(`${apiBase}/api/world-id/verify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ idkitResponse: result }),
});
const verification = await verifyResponse.json();
if (!verifyResponse.ok) throw new Error(`World ID proof rejected: ${JSON.stringify(verification)}`);
console.log(JSON.stringify({ ...verification, executionMode: 'world-id-sandbox' }, null, 2));
