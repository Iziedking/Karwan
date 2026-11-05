import { createHash } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { AGENTKIT } from '@worldcoin/agentkit';
import { Hono } from 'hono';
import { canonicalAgentKitResourceUri, createAgentKitChallenge } from '../agentkit/agentKitChallenge.js';
import type { AgentKitVerifier } from '../agentkit/agentKitVerification.js';
import type { AgentIdentity } from '../agentJobs/agentJobs.js';
import { arcChain } from '../chain/client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { buildMcpServer, type McpDeps } from '../mcp/server.js';

/// POST /mcp: the Karwan MCP server for agents outside Karwan (view 15),
/// Streamable HTTP without sessions. Every request carries a World AgentKit
/// proof that one real person stands behind the agent; without one nothing
/// runs and the agent gets the challenge to sign.

let deps: McpDeps | null = null;
let verifier: AgentKitVerifier | null = null;

export function configureMcp(input: { deps: McpDeps | null; verifier: AgentKitVerifier | null }): () => void {
  deps = input.deps;
  verifier = input.verifier;
  return () => {
    deps = null;
    verifier = null;
  };
}

/// A proof is checked with World once and trusted until it expires, so one
/// conversation does not call World for every message.
const verified = new Map<string, { identity: AgentIdentity; until: number }>();
const KEEP_MAX = 5_000;
const MCP_STATEMENT = 'Verify this agent is backed by a person before it uses Karwan';

async function identityFor(header: string, resourceUri: string): Promise<AgentIdentity | { status: 403 | 503; message: string; code: string }> {
  const key = createHash('sha256').update(header).digest('hex');
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return hit.identity;
  const r = await verifier!.verify({ header, resourceUri });
  if (r.status !== 'verified') return { status: r.status === 'unavailable' ? 503 : 403, message: r.message, code: r.code };
  if (verified.size >= KEEP_MAX) verified.clear();
  const identity = { agentAddress: r.agentAddress.toLowerCase(), humanKeyDigest: r.humanKeyDigest };
  verified.set(key, { identity, until: r.expiresAt });
  return identity;
}

export const mcpRoutes = new Hono();

mcpRoutes.post('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  if (!deps || !verifier) return c.json({ error: 'The Karwan MCP is not available on this network.' }, 404);
  const resourceUri = canonicalAgentKitResourceUri(c.req.url, config.PUBLIC_API_BASE_URL);
  const header = c.req.header(AGENTKIT);
  if (!header) {
    return c.json({ ...createAgentKitChallenge({ resourceUri, network: `eip155:${arcChain.id}`, statement: MCP_STATEMENT }), message: 'Sign this AgentKit challenge and send it in the agentkit header on every request.' }, 401);
  }
  const identity = await identityFor(header, resourceUri);
  if ('status' in identity) return c.json({ error: identity.message, code: identity.code }, identity.status);
  const server = buildMcpServer(identity, deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(c.req.raw);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'mcp request failed');
    return c.json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }, 500);
  } finally {
    void server.close().catch(() => {});
  }
});

mcpRoutes.all('/', (c) => {
  c.header('Cache-Control', 'no-store');
  if (!deps || !verifier) return c.json({ error: 'The Karwan MCP is not available on this network.' }, 404);
  return c.json({ error: 'Use POST. This server keeps no sessions.' }, 405);
});
