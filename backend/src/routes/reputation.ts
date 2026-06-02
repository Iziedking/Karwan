import { Hono } from 'hono';
import { z } from 'zod';
import { reputation } from '../chain/contracts.js';
import { compute } from '../reputation/engine.js';
import { loadInputs } from '../reputation/signals.js';
import { tierRank, type Tier } from '../reputation/config.js';
import { getTierState, saveTierState } from '../db/tierState.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { bus } from '../events.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const CELEBRATE_MS = 12 * 60 * 60 * 1000;

/// Detect a tier-up on a reputation read and fire the one-shot celebration:
/// persist the new tier, set a 12h profile-card window, emit an event, and
/// Telegram the user if linked. First-ever read just records a baseline (we
/// don't congratulate a fresh NEW account). Returns the active celebration, if
/// any, for the response so the profile can render the congrats card.
async function maybeCelebrateTierUp(
  address: string,
  tier: Tier,
): Promise<{ tier: Tier; until: number } | null> {
  const now = Date.now();
  const prev = getTierState(address);
  const rank = tierRank(tier);

  if (!prev) {
    // First read. Record the baseline; never congratulate a fresh account.
    saveTierState(address, { tier, maxRank: rank, celebrateUntil: 0, updatedAt: now });
    return null;
  }

  // Back-compat: rows written before maxRank existed fall back to the stored tier.
  const prevMax = prev.maxRank ?? tierRank(prev.tier);

  if (rank > prevMax) {
    // Genuine all-time high. This is the only thing we celebrate, so dropping a
    // tier and climbing back into one you already reached never re-fires it.
    const celebrateUntil = now + CELEBRATE_MS;
    saveTierState(address, { tier, maxRank: rank, celebrateUntil, updatedAt: now });
    /// One emission, two delivery paths. The telegram notifier and the
    /// in-app feed both subscribe and format their own copy from the same
    /// payload. Previously this route fired a direct telegram message which
    /// bypassed the notifier, so the in-app bell never saw the event and
    /// users only learned about the tier change if they had connected
    /// telegram or happened to visit the profile within the celebrate window.
    bus.emitEvent({
      type: 'reputation.tier-up',
      actor: 'platform',
      payload: { address, fromTier: prev.tier, toTier: tier },
    });
    return { tier, until: celebrateUntil };
  }

  // Not a new high. Keep maxRank, sync the current tier. Show the congrats card
  // only while the user is still AT their peak tier and the window is live; a
  // drop below peak clears it so we never welcome them to a tier they passed.
  const stillAtPeak = rank >= prevMax;
  const celebrateUntil = stillAtPeak && prev.celebrateUntil > now ? prev.celebrateUntil : 0;
  saveTierState(address, { tier, maxRank: prevMax, celebrateUntil, updatedAt: now });
  return celebrateUntil > now ? { tier, until: celebrateUntil } : null;
}

export const reputationRoutes = new Hono();

// Short-lived server-side cache. The composite read fires several chain RPCs
// (scores, vault stake, legacy score), so without this every badge render on an
// address we haven't seen recently pays the full RPC latency. Keyed by the
// resolved account address (agent addresses collapse to their owner). A read
// with `?fresh=1` bypasses the cache (used by the frontend right after a stake
// change so the new tier shows without waiting out the window).
const REP_CACHE_TTL_MS = 45_000;
const repCache = new Map<string, { body: Record<string, unknown>; ts: number }>();

/// Composite reputation read. Returns the new engine output plus the legacy
/// `scoreBps` field so any UI still consuming the old shape keeps working
/// while frontend migrates to `score`/`tier`/`terms`.
reputationRoutes.get('/', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);

  try {
    // Reputation belongs to the account, not the agent wallet. If the queried
    // address is one of our agent DCWs (a buyer/seller agent), resolve it to the
    // owner so bid cards and match banners show the account's real tier instead
    // of a blank NEW. A normal account or web3 wallet does not match and is used
    // as-is.
    let repAddr = parsed.data;
    try {
      const owner = await findAgentWalletByAgentAddress(parsed.data);
      if (owner?.userAddress) repAddr = owner.userAddress;
    } catch {
      /* fall back to the queried address on lookup failure */
    }

    const cacheKey = repAddr.toLowerCase();
    const wantsFresh = c.req.query('fresh') === '1';
    if (!wantsFresh) {
      const hit = repCache.get(cacheKey);
      if (hit && Date.now() - hit.ts < REP_CACHE_TTL_MS) {
        return c.json(hit.body);
      }
    }

    // The composite inputs and the legacy bps score are independent chain reads.
    // Run them together so a cache miss pays one round-trip's latency, not two.
    const [inputs, scoreBps] = await Promise.all([
      loadInputs(repAddr),
      reputation.read
        .getReputationScore([repAddr as `0x${string}`])
        .then((raw) => Number(raw as bigint))
        // Fall back to neutral 5000 if the legacy view reverts on this address.
        .catch(() => 5000),
    ]);
    const result = compute(inputs);

    // Detect a tier-up and surface the 12h congrats window for the profile card.
    const tierCelebration = await maybeCelebrateTierUp(result.address, result.tier);

    const body: Record<string, unknown> = {
      address: result.address,
      score: result.score,
      tier: result.tier,
      terms: result.terms,
      inputs: result.inputs,
      modelVersion: result.modelVersion,
      /// Present + within the 12h window when the user just crossed into a higher
      /// tier. Drives the profile congrats card. null otherwise.
      tierCelebration,

      // Legacy fields. Mirrors the v1 response shape so old callers don't break.
      scoreBps,
      successCount: result.inputs.successCount,
      disputedCount: result.inputs.disputedCount,
      failedCount: result.inputs.failedCount,
      totalDeals:
        result.inputs.successCount +
        result.inputs.disputedCount +
        result.inputs.failedCount,
    };
    repCache.set(cacheKey, { body, ts: Date.now() });
    return c.json(body);
  } catch (err) {
    return c.json(
      { error: 'reputation read failed', detail: (err as Error).message },
      502,
    );
  }
});
