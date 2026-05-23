import { Hono } from 'hono';
import { z } from 'zod';
import { reputation } from '../chain/contracts.js';
import { compute } from '../reputation/engine.js';
import { loadInputs } from '../reputation/signals.js';
import { tierRank, type Tier } from '../reputation/config.js';
import { getTierState, saveTierState } from '../db/tierState.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { bus } from '../events.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { sendTelegramMessage, telegramEnabled } from '../telegram/bot.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const CELEBRATE_MS = 12 * 60 * 60 * 1000;

const TIER_BLURB: Record<Tier, string> = {
  NEW: 'Welcome aboard.',
  COLD: 'Your track record is taking shape.',
  ESTABLISHED: 'A solid, trusted profile.',
  STRONG: 'A preferred counterparty. agents move faster for you.',
  ELITE: 'Top tier. agents accept first-look within range, no auction.',
};

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

  if (!prev) {
    saveTierState(address, { tier, celebrateUntil: 0, updatedAt: now });
    return null;
  }

  if (tierRank(tier) > tierRank(prev.tier)) {
    const celebrateUntil = now + CELEBRATE_MS;
    saveTierState(address, { tier, celebrateUntil, updatedAt: now });
    bus.emitEvent({
      type: 'reputation.tier-up',
      actor: 'platform',
      payload: { address, fromTier: prev.tier, toTier: tier },
    });
    if (telegramEnabled()) {
      void getTelegramLink(address)
        .then((link) => {
          if (!link) return;
          return sendTelegramMessage(
            link.chatId,
            `*Tier up. you reached ${tier} on Karwan.*\n${TIER_BLURB[tier]}`,
          );
        })
        .catch((err) =>
          logger.warn({ err: (err as Error).message, address }, 'tier-up telegram failed'),
        );
    }
    return { tier, until: celebrateUntil };
  }

  // No promotion. Keep the stored tier in sync (it may have dropped) but never
  // celebrate a demotion. Preserve any still-active celebration window.
  if (tier !== prev.tier || (prev.celebrateUntil && prev.celebrateUntil <= now)) {
    saveTierState(address, {
      tier,
      celebrateUntil: prev.celebrateUntil > now ? prev.celebrateUntil : 0,
      updatedAt: now,
    });
  }
  return prev.celebrateUntil > now ? { tier: prev.tier, until: prev.celebrateUntil } : null;
}

export const reputationRoutes = new Hono();

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

    const inputs = await loadInputs(repAddr);
    const result = compute(inputs);

    // Detect a tier-up and surface the 12h congrats window for the profile card.
    const tierCelebration = await maybeCelebrateTierUp(result.address, result.tier);

    // Legacy basis-points score read straight off chain. Kept in the response
    // until the frontend reputation badge fully migrates to `score`/`tier`.
    let scoreBps = 5000;
    try {
      const raw = (await reputation.read.getReputationScore([
        repAddr as `0x${string}`,
      ])) as bigint;
      scoreBps = Number(raw);
    } catch {
      // Fall back to neutral 5000 if the legacy view reverts on this address.
    }

    return c.json({
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
    });
  } catch (err) {
    return c.json(
      { error: 'reputation read failed', detail: (err as Error).message },
      502,
    );
  }
});
