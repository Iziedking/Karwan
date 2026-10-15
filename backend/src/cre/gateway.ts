import { createHash, randomUUID } from 'node:crypto';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { canonicalJson } from './shared/canonical.js';

/// Starts a deployed CRE workflow's HTTP trigger through Chainlink's gateway.
/// The request is signed by Karwan's gateway key, which the workflow lists in
/// its authorizedKeys; the gateway answers only ACCEPTED and an execution id,
/// and the result comes back later as a report the workflow posts.
const MIN_GAP_MS = 30_000;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function buildExecuteRequest(input: {
  signerKey: Hex;
  workflowId: string;
  input: unknown;
  nowSec: number;
  jti?: string;
  id?: string;
}): Promise<{ body: string; token: string }> {
  const account = privateKeyToAccount(input.signerKey);
  const body = canonicalJson({
    jsonrpc: '2.0',
    id: input.id ?? randomUUID(),
    method: 'workflows.execute',
    params: { input: input.input, workflow: { workflowID: input.workflowId.replace(/^0x/, '') } },
  });
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ETH', typ: 'JWT' })));
  const claims = b64url(Buffer.from(JSON.stringify({
    digest: `0x${createHash('sha256').update(body).digest('hex')}`,
    iss: account.address,
    iat: input.nowSec,
    exp: input.nowSec + 300,
    jti: input.jti ?? randomUUID(),
  })));
  const signature = await account.signMessage({ message: `${header}.${claims}` });
  return { body, token: `${header}.${claims}.${b64url(Buffer.from(signature.slice(2), 'hex'))}` };
}

export interface GatewayDeps {
  url: string;
  signerKey: string;
  now(): number;
  sleep(ms: number): Promise<void>;
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<Response>;
}

/// One start per workflow every 30 seconds (the HTTP trigger's limit); later
/// starts wait their turn instead of being refused.
export function createGatewayClient(deps: GatewayDeps) {
  const tails = new Map<string, Promise<number>>();

  async function send(workflowId: string, input: unknown): Promise<{ executionId: string }> {
    const { body, token } = await buildExecuteRequest({ signerKey: deps.signerKey as Hex, workflowId, input, nowSec: Math.floor(deps.now() / 1000) });
    const res = await deps.fetch(deps.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body });
    const json = (await res.json().catch(() => null)) as { result?: { workflow_execution_id?: string }; error?: { message?: string } } | null;
    const executionId = json?.result?.workflow_execution_id;
    if (!res.ok || !executionId) throw new Error(`CRE_GATEWAY: ${json?.error?.message ?? res.status}`);
    return { executionId };
  }

  return {
    start(workflowId: string, input: unknown): Promise<{ executionId: string }> {
      const previous = tails.get(workflowId) ?? Promise.resolve(-Infinity);
      const result = previous.then(async (lastSentAt) => {
        const wait = lastSentAt + MIN_GAP_MS - deps.now();
        if (wait > 0) await deps.sleep(wait);
        return { sentAt: deps.now(), outcome: await send(workflowId, input).then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e })) };
      });
      tails.set(workflowId, result.then((r) => r.sentAt));
      return result.then((r) => {
        if (!r.outcome.ok) throw r.outcome.e;
        return r.outcome.v;
      });
    },
  };
}
