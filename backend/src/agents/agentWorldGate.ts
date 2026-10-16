import { ARC } from '../chain/client.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { deleteHold, getHold, putHold } from '../db/agentWorldChecks.js';
import { bus } from '../events.js';
import { worldIdDealSessionsConfigured } from '../routes/worldId.js';
import { holdFor, nextStep, type AgentWorldHold, type AgentWorldStep } from '../trust/agentWorldCheck.js';
import { decideTrust } from '../trust/riskEngine.js';
import { loadPartyFacts } from '../trust/trustFacts.js';
import type { Role } from '../trust/riskEngine.js';

/// Testnet lets a person skip the check so a missing World ID never blocks
/// trying a deal. Mainnet always enforces it.
export const AGENT_WORLD_SKIP_ALLOWED = ARC.testnet;

/// Runs the trust rules for the offer the buyer is choosing and keeps the hold
/// in step with it. Returns who has to check next, or proceed.
export async function worldStepForChoice(input: {
  jobId: string;
  buyerUser: string;
  sellerAgent: string;
  priceUsdc: string;
  acknowledgeUnverified: boolean;
  now?: number;
}): Promise<{ hold: AgentWorldHold | null; step: AgentWorldStep }> {
  const now = input.now ?? Date.now();
  const prev = await getHold(input.jobId);
  if (!worldIdDealSessionsConfigured()) {
    if (prev) await deleteHold(input.jobId);
    return { hold: null, step: { kind: 'proceed' } };
  }
  const owner = await findAgentWalletByAgentAddress(input.sellerAgent).catch(() => null);
  const sellerUser = owner?.userAddress ?? null;
  const [buyer, seller] = await Promise.all([
    loadPartyFacts(input.buyerUser, now),
    sellerUser ? loadPartyFacts(sellerUser, now) : Promise.resolve(null),
  ]);
  // Price outliers only put a deal on watch; they never ask anyone for World ID.
  const decision = decideTrust({
    buyer,
    seller,
    deal: { amountUsdc: Number(input.priceUsdc), priceZ: null, githubDelivery: false },
    worldIdAvailable: true,
    now,
  });
  const hold = holdFor(prev, {
    jobId: input.jobId,
    sellerAgent: input.sellerAgent,
    priceUsdc: input.priceUsdc,
    buyerUser: input.buyerUser,
    sellerUser: sellerUser ?? '',
    decision,
    now,
  });
  if (!hold) {
    if (prev) await deleteHold(input.jobId);
    return { hold: null, step: { kind: 'proceed' } };
  }
  const kept = { ...hold, acknowledgeUnverified: input.acknowledgeUnverified };
  await putHold(kept);
  return { hold: kept, step: nextStep(kept, AGENT_WORLD_SKIP_ALLOWED) };
}

/// The buyer confirmed and only the seller's check is left: record it and tell
/// the seller, who sees it on their desk and by message.
export async function waitOnSeller(hold: AgentWorldHold): Promise<AgentWorldHold> {
  const waiting = { ...hold, buyerConfirmed: true, updatedAt: Date.now() };
  await putHold(waiting);
  publishWorldCheck(waiting);
  return waiting;
}

export async function skipWorldCheck(hold: AgentWorldHold, role: Role): Promise<AgentWorldHold> {
  const skipped = { ...hold, [role]: 'skipped' as const, updatedAt: Date.now() };
  await putHold(skipped);
  return skipped;
}

export function publishWorldCheck(hold: AgentWorldHold): void {
  const step = nextStep(hold, AGENT_WORLD_SKIP_ALLOWED);
  bus.emitEvent({
    type: 'request.world_check',
    jobId: hold.jobId,
    actor: 'platform',
    payload: {
      buyer: hold.buyerUser,
      seller: hold.sellerUser,
      sellerAgent: hold.sellerAgent,
      priceUsdc: hold.priceUsdc,
      waitingOn: step.kind === 'proceed' ? null : step.kind,
      reason: step.kind === 'proceed' ? null : step.reason,
      buyerConfirmed: hold.buyerConfirmed,
    },
  });
}

/// What the buyer's request page shows about the step, if anything.
export function worldCheckView(hold: AgentWorldHold | null) {
  if (!hold) return null;
  const step = nextStep(hold, AGENT_WORLD_SKIP_ALLOWED);
  return {
    sellerAgent: hold.sellerAgent,
    priceUsdc: hold.priceUsdc,
    buyer: hold.buyer,
    seller: hold.seller,
    waitingOn: step.kind === 'proceed' ? null : step.kind,
    reason: step.kind === 'proceed' ? null : step.reason,
    buyerConfirmed: hold.buyerConfirmed,
    skipAllowed: AGENT_WORLD_SKIP_ALLOWED,
  };
}
