import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// IDKit is a browser-first SDK and resolves its bundled WASM through
// `fetch(import.meta.url)`. Node's native fetch does not support file:// URLs,
// so the staging-only CLI adapts that one local asset while preserving normal
// HTTPS fetches for the Karwan API and World simulator.
const fetchWithLocalWasm = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  if (url.startsWith('file://')) {
    const bytes = await readFile(fileURLToPath(url));
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'application/wasm' },
    });
  }

  return fetchWithLocalWasm(input, init);
};

const { IDKit, orbLegacy } = await import('@worldcoin/idkit-core');

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

// The bridge can return a transient network error while the simulator is
// opening the request. Keep polling until the short-lived RP request expires
// instead of terminating before the user has time to approve it.
const pollDeadline = signature.expires_at * 1000;
let result: unknown;
while (Date.now() < pollDeadline) {
  let status: { type?: string; result?: unknown; error?: string };
  try {
    status = await request.pollOnce();
  } catch (error) {
    console.warn(`World ID poll retry: ${error instanceof Error ? error.message : String(error)}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    continue;
  }

  if (status.type === 'confirmed' && status.result) {
    result = status.result;
    break;
  }
  if (status.type === 'failed') {
    throw new Error(`World ID poll failed: ${status.error ?? 'generic_error'}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

if (!result) throw new Error('World ID poll timed out before the simulator completed');

const verifyResponse = await fetch(`${apiBase}/api/world-id/verify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ idkitResponse: result }),
});
const verification = await verifyResponse.json();
if (!verifyResponse.ok) throw new Error(`World ID proof rejected: ${JSON.stringify(verification)}`);
console.log(JSON.stringify({ ...verification, executionMode: 'world-id-sandbox' }, null, 2));
