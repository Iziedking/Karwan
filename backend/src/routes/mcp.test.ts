import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import type { AgentKitVerifier } from '../agentkit/agentKitVerification.js';
import type { AgentJobs } from '../agentJobs/agentJobs.js';
import { createPaidTools } from '../mcp/payments.js';
import { MCP_TOOLS, type McpDeps } from '../mcp/server.js';
import { configureMcp, mcpRoutes } from './mcp.js';

/// The Karwan MCP (view 15): nothing runs without a World AgentKit proof, the
/// tools are exactly the agreed ones, and a refused paid call is never charged.

const AGENT = '0x1111111111111111111111111111111111111111';

const verifier: AgentKitVerifier = {
  async verify({ header }) {
    if (header !== 'good-proof') return { status: 'rejected', code: 'PROOF_REJECTED', message: 'bad proof' };
    return { status: 'verified', agentAddress: AGENT, humanKeyDigest: 'human-1', verifier: 'world-agentbook', checkedAt: Date.now(), expiresAt: Date.now() + 60_000, domain: 'api.karwan.site', nonce: 'n' };
  },
};

// The kinds Circle Gateway's testnet facilitator returned for Arc on 5 Nov 2026.
const KIND = {
  x402Version: 2, scheme: 'exact', network: 'eip155:5042002',
  extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: '0x0077777d7eba4688bdef3e311b846f25870a19b9', minValiditySeconds: 604800,
    assets: [{ symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6, authorizationVersions: ['1', '2'] }] },
};

function fakeFacilitator() {
  const settled: unknown[] = [];
  return {
    settled,
    client: {
      getSupported: async () => ({ kinds: [KIND], extensions: [], signers: {} }),
      verify: async () => ({ isValid: true, payer: AGENT }),
      settle: async (payload: unknown) => {
        settled.push(payload);
        return { success: true, transaction: '0xabc', network: 'eip155:5042002', payer: AGENT };
      },
    },
  };
}

const core = {
  async open() {
    return { ok: false, code: 'NOT_PAIRED', message: 'pair first', link: 'https://karwan.site/pair/x' };
  },
} as unknown as AgentJobs;

function app(over: Partial<McpDeps> = {}) {
  configureMcp({ deps: { core, paid: null, find: async () => [], check: async () => ({ ok: true, found: false }), ...over }, verifier });
  return new Hono().route('/mcp', mcpRoutes);
}

const rpc = (method: string, params: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const post = (a: Hono, body: unknown, header?: string) =>
  a.request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(header ? { agentkit: header } : {}) },
    body: JSON.stringify(body),
  });
const toolCall = async (a: Hono, name: string, args: unknown, meta?: unknown) => {
  const res = await post(a, rpc('tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) }), 'good-proof');
  assert.equal(res.status, 200);
  return ((await res.json()) as { result: { isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> } }).result;
};

test('without an AgentKit proof nothing runs and the agent gets the challenge', async () => {
  const a = app();
  const none = await post(a, rpc('tools/list', {}));
  assert.equal(none.status, 401);
  const challenge = (await none.json()) as { extensions: { agentkit: { info: { statement: string } } } };
  assert.equal(challenge.extensions.agentkit.info.statement, 'Verify this agent is backed by a person before it uses Karwan');
  const bad = await post(a, rpc('tools/list', {}), 'forged');
  assert.equal(bad.status, 403);
});

test('the tools are exactly the agreed seven', async () => {
  const res = await post(app(), rpc('tools/list', {}), 'good-proof');
  assert.equal(res.status, 200);
  const names = ((await res.json()) as { result: { tools: Array<{ name: string }> } }).result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [...MCP_TOOLS].sort());
});

test('a refusal comes back as an error result with the pairing link', async () => {
  const r = await toolCall(app(), 'open_protected_deal', { seller: 'ada', work: 'A logo', amountUsdc: 50, deadlineDays: 5 });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent?.code, 'NOT_PAIRED');
  assert.equal(r.structuredContent?.link, 'https://karwan.site/pair/x');
});

test('a paid tool asks for payment first, and settles only when it answers', async () => {
  const f = fakeFacilitator();
  const paid = await createPaidTools('0x00000000000000000000000000000000000000aa', [f.client as never]);
  let sellers: unknown[] = [];
  const a = app({ paid, find: async () => sellers as never });
  const ask = await toolCall(a, 'find_counterparty', { need: 'logo design', budgetUsdc: 50, deadlineDays: 5 });
  assert.equal(ask.isError, true, 'no payment, no answer');
  assert.equal(f.settled.length, 0);
  const accepted = (ask.structuredContent as { accepts?: unknown[] } | undefined)?.accepts?.[0];
  assert.ok(accepted, 'the payment requirements come back');
  const payment = { x402Version: 2, accepted, payload: { signature: '0x00', authorization: {} } };
  sellers = [{ tag: '@ada', name: 'Ada', verified: true, tier: 'gold', rating: '4.8 from 23 deals', reasons: [], priceUsdc: '50', days: 5, recommended: true }];
  const answered = await toolCall(a, 'find_counterparty', { need: 'logo design', budgetUsdc: 50, deadlineDays: 5 }, { 'x402/payment': payment });
  assert.notEqual(answered.isError, true);
  assert.equal(f.settled.length, 1, 'charged once, for an answer');
});

test('paid tools say so when payments are off, without charging', async () => {
  const r = await toolCall(app(), 'check_person', { handle: '@ada' });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent?.code, 'PAYMENTS_OFF');
});
