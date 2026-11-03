import { Hono } from 'hono';
import { AGENTKIT } from '@worldcoin/agentkit';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { viewerAddress } from '../auth/session.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { RESEARCH_PRICE } from '../x402/researchPricing.js';
import {
  unavailableAgentKitVerifier,
  type AgentKitVerifier,
} from '../agentkit/agentKitVerification.js';
import { canonicalAgentKitResourceUri, createAgentKitChallenge } from '../agentkit/agentKitChallenge.js';
import { arcChain } from '../chain/client.js';
import {
  ResearchAllowanceExpiredError,
  ResearchAllowanceReplayError,
  emptyResearchAllowanceSnapshot,
  type AgentKitBindingRecord,
  type ResearchAllowanceStore,
} from '../evidence/researchAllowance.js';

/// "Agent research" activation. The user pays a one-time fee in USDC on Arc
/// from their agent wallet; it becomes a prepaid credit the agent draws down as
/// it pays for live market research (x402, off-platform). UI copy never says
/// "x402"; it frames this as the agent paying for its own research.
export const researchRoutes = new Hono();

let agentKitResearchEnabled = false;
let agentKitVerifier: AgentKitVerifier = unavailableAgentKitVerifier();
let agentKitAllowanceStore: ResearchAllowanceStore | null = null;

export function configureAgentKitResearch(input: {
  enabled: boolean;
  verifier?: AgentKitVerifier;
  allowanceStore?: ResearchAllowanceStore;
}): () => void {
  agentKitResearchEnabled = input.enabled;
  agentKitVerifier = input.verifier ?? unavailableAgentKitVerifier();
  agentKitAllowanceStore = input.allowanceStore ?? null;
  return () => {
    agentKitResearchEnabled = false;
    agentKitVerifier = unavailableAgentKitVerifier();
    agentKitAllowanceStore = null;
  };
}

export async function ownerAgentKitResearchAccess(
  owner: string,
  now = Date.now(),
): Promise<{
  store: ResearchAllowanceStore;
  binding: AgentKitBindingRecord;
  allowance: Awaited<ReturnType<ResearchAllowanceStore['get']>>;
} | null> {
  const store = agentKitResearchEnabled ? agentKitAllowanceStore : null;
  if (!store) return null;
  const wallets = await getAgentWallets(owner);
  if (!wallets) return null;
  for (const agentAddress of [wallets.buyerAddress, wallets.sellerAddress]) {
    const binding = await store.getBinding(agentAddress);
    if (binding && binding.expiresAt > now) {
      return { store, binding, allowance: await store.get({ humanKeyDigest: binding.humanKeyDigest, now }) };
    }
  }
  return null;
}

/// What research costs a person's agents (view 48, decision 2). Agents pay
/// for it from their own balance; there is no credit to buy.
researchRoutes.get('/status', (c) =>
  c.json({ freshSearchUsdc: RESEARCH_PRICE.freshAngleUsdc, cachedSearchUsdc: RESEARCH_PRICE.cachedAngleUsdc, paidBy: 'agent' as const }),
);

researchRoutes.get('/agentkit/status', async (c) => {
  const owner = viewerAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  const access = await ownerAgentKitResearchAccess(owner);
  return c.json({
    verification: access ? 'verified' as const : 'not-checked' as const,
    provider: 'world-agentbook' as const,
    mode: agentKitResearchEnabled && agentKitAllowanceStore ? 'configured' as const : 'unavailable' as const,
    allowancePolicy: { scope: 'counterparty-report' as const, reportsPer24Hours: 3 },
    allowance: access ? (access.allowance ?? emptyResearchAllowanceSnapshot()) : null,
  });
});

researchRoutes.post('/agentkit/verify', async (c) => {
  c.header('Cache-Control', 'no-store');
  if (!agentKitResearchEnabled || !agentKitAllowanceStore) {
    return c.json({ error: 'agentkit verification unavailable', code: 'PROVIDER_UNAVAILABLE' }, 503);
  }
  const resourceUri = canonicalAgentKitResourceUri(c.req.url, config.PUBLIC_API_BASE_URL);
  const header = c.req.header(AGENTKIT);
  if (!header) {
    return c.json(createAgentKitChallenge({
      resourceUri,
      network: `eip155:${arcChain.id}`,
    }), 402);
  }
  const result = await agentKitVerifier.verify({ header, resourceUri });
  if (result.status !== 'verified') {
    return c.json({ error: result.message, code: result.code }, result.status === 'unavailable' ? 503 : 403);
  }
  try {
    await agentKitAllowanceStore.verifyBinding({
      agentAddress: result.agentAddress,
      humanKeyDigest: result.humanKeyDigest,
      verifier: result.verifier,
      checkedAt: result.checkedAt,
      expiresAt: result.expiresAt,
      domain: result.domain,
      nonce: result.nonce,
      nonceExpiresAt: result.expiresAt,
    });
    const allowance = await agentKitAllowanceStore.get({ humanKeyDigest: result.humanKeyDigest });
    return c.json({
      verification: 'verified' as const,
      provider: result.verifier,
      allowance: allowance ?? emptyResearchAllowanceSnapshot(),
      boundAgentCount: (await agentKitAllowanceStore.listBindings(result.humanKeyDigest)).length,
    });
  } catch (error) {
    if (error instanceof ResearchAllowanceReplayError) return c.json({ error: error.message, code: 'NONCE_REPLAY' }, 409);
    if (error instanceof ResearchAllowanceExpiredError) return c.json({ error: error.message, code: 'NONCE_EXPIRED' }, 400);
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'agentkit allowance failed');
    return c.json({ error: 'agentkit allowance unavailable', code: 'ALLOWANCE_UNAVAILABLE' }, 503);
  }
});
