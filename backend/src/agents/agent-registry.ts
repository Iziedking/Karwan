import {
  getAgentWallets,
  listAllAgentWallets,
  findAgentWalletByAgentAddress,
  type AgentWallets,
} from '../db/agentWallets.js';
import { getProfile, type UserProfile } from '../db/profiles.js';
import type { BuyerProfile } from './buyer-profile.js';
import type { SellerProfile } from './seller-profile.js';

// Managed deals run on each user's own agents. A user joins the auction only if
// they have activated (agent wallets) and filled the matching role profile.
// These two values are not part of the onboarding profile, so they default.
//
// MAX_COUNTER_ROUNDS is the hard cap on counter exchanges per side. Two means
// each agent can issue up to two counters before walking away. The constant is
// exported so the buyer and seller agents agree on the cap (previously they
// drifted: buyer used `>= n`, seller used `> n` with a hardcoded 2, which
// effectively let the seller run an extra round).
export const MAX_COUNTER_ROUNDS = 2;
const DEFAULT_MAX_COUNTER_ROUNDS = MAX_COUNTER_ROUNDS;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

function toBuyerProfile(agents: AgentWallets, profile: UserProfile): BuyerProfile | null {
  const b = profile.buyer;
  if (!b) return null;
  // KarwanEscrow rejects milestonePcts that are not 1..5 long and summing to 100.
  if (b.milestonePcts.length < 1 || b.milestonePcts.length > 5) return null;
  if (b.milestonePcts.reduce((a, c) => a + c, 0) !== 100) return null;
  return {
    walletId: agents.buyerWalletId,
    address: agents.buyerAddress,
    displayName: profile.displayName,
    maxBudgetUsdc: b.maxBudgetUsdc,
    minDeadlineDays: b.minDeadlineDays,
    maxDeadlineDays: b.maxDeadlineDays,
    bidCollectionSeconds: b.bidCollectionSeconds,
    maxCounterRounds: DEFAULT_MAX_COUNTER_ROUNDS,
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    milestonePcts: b.milestonePcts,
  };
}

function toSellerProfile(agents: AgentWallets, profile: UserProfile): SellerProfile | null {
  const s = profile.seller;
  if (!s) return null;
  return {
    walletId: agents.sellerWalletId,
    address: agents.sellerAddress,
    userAddress: agents.userAddress,
    displayName: profile.displayName,
    skills: s.skills,
    bio: s.bio,
    minBudgetUsdc: s.minBudgetUsdc,
    maxBudgetUsdc: s.maxBudgetUsdc,
    minDeadlineDays: s.minDeadlineDays,
    maxDeadlineDays: s.maxDeadlineDays,
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    keywords: s.keywords ?? [],
  };
}

/// The buyer profile for whoever's buyer agent posted a job, resolved from the
/// on-chain buyer address. Null if the address is not one of our buyer agents,
/// or the owner has no buyer profile.
export async function resolveBuyerProfile(
  buyerAgentAddress: string,
): Promise<BuyerProfile | null> {
  const agents = await findAgentWalletByAgentAddress(buyerAgentAddress);
  if (!agents) return null;
  if (agents.buyerAddress !== buyerAgentAddress.toLowerCase()) return null;
  const profile = await getProfile(agents.userAddress);
  if (!profile) return null;
  return toBuyerProfile(agents, profile);
}

/// The seller profile for a seller agent address. Null if not one of our seller
/// agents, or the owner has no seller profile.
export async function resolveSellerProfile(
  sellerAgentAddress: string,
): Promise<SellerProfile | null> {
  const agents = await findAgentWalletByAgentAddress(sellerAgentAddress);
  if (!agents) return null;
  if (agents.sellerAddress !== sellerAgentAddress.toLowerCase()) return null;
  const profile = await getProfile(agents.userAddress);
  if (!profile) return null;
  return toSellerProfile(agents, profile);
}

/// The buyer profile for a user, keyed by their identity wallet. Used by the
/// job-posting route to pick the wallet that signs postJob.
export async function resolveBuyerProfileForUser(
  userAddress: string,
): Promise<BuyerProfile | null> {
  const agents = await getAgentWallets(userAddress);
  if (!agents) return null;
  const profile = await getProfile(userAddress);
  if (!profile) return null;
  return toBuyerProfile(agents, profile);
}

/// Every user who has seller agent wallets and a seller profile. These are the
/// seller agents that evaluate and bid on each posted job.
export async function resolveAllSellerProfiles(): Promise<SellerProfile[]> {
  const all = await listAllAgentWallets();
  const out: SellerProfile[] = [];
  for (const agents of all) {
    const profile = await getProfile(agents.userAddress);
    if (!profile) continue;
    const sp = toSellerProfile(agents, profile);
    if (sp) out.push(sp);
  }
  return out;
}

/// The seller agent address belonging to the same user as a given buyer agent
/// address. Used to keep a user's seller agent out of their own auction.
export async function siblingSellerAddress(
  buyerAgentAddress: string,
): Promise<string | null> {
  const agents = await findAgentWalletByAgentAddress(buyerAgentAddress);
  return agents?.sellerAddress ?? null;
}

/// The walletId that controls a given agent address, on either side. Used to
/// release managed milestones through the job's own buyer agent.
export async function findWalletIdForAgent(agentAddress: string): Promise<string | null> {
  const agents = await findAgentWalletByAgentAddress(agentAddress);
  if (!agents) return null;
  const a = agentAddress.toLowerCase();
  if (agents.buyerAddress === a) return agents.buyerWalletId;
  if (agents.sellerAddress === a) return agents.sellerWalletId;
  return null;
}
