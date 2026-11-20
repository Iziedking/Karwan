import { config } from '../config.js';
import { progressStore } from '../db/agentProgress.js';
import { getAgentRecord } from '../db/agentRecords.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { formatLocalAmount } from '../rates/localAmounts.js';
import { readSharedRates } from '../rates/sharedRate.js';
import { tellFit, type FitDeps, type FitInput, type FitResult } from './fitAlert.js';

/// The fit path on the live stores (view 96): the person's time and quiet hours
/// from their agent record, language and money from their profile, and the note
/// on the agent note every channel shows. Off unless FIT_ALERTS is set.

export const liveFitDeps: FitDeps = {
  now: Date.now,
  // Resolved on use: the database pool opens after this module loads.
  progress: {
    claim: (...a) => progressStore().claim(...a),
    markSent: (...a) => progressStore().markSent(...a),
    toldSince: (...a) => progressStore().toldSince(...a),
  },
  recordFor: (owner) => getAgentRecord(owner),
  locale: async (owner) => ((await getProfile(owner).catch(() => null))?.settings?.locale ?? 'en') as UserLocale,
  money: async (owner, usdc) => {
    const [profile, rates] = await Promise.all([getProfile(owner).catch(() => null), readSharedRates()]);
    return formatLocalAmount(usdc, profile?.settings?.displayCurrency, rates) ?? `${Math.round(usdc * 100) / 100} USDC`;
  },
  emit: (e) => bus.emitEvent({ type: e.type, actor: 'platform', ...(e.data.jobId ? { jobId: e.data.jobId } : {}), payload: { user: e.user, sellerUser: e.user, ...e.data } }),
};

export function fitAlertsOn(): boolean {
  return config.FIT_ALERTS === true;
}

/// Tells a fit on the live stores, or nothing while the switch is off. Never
/// throws: an alert that fails is logged and the trade goes on.
export async function tellFitLive(input: FitInput): Promise<FitResult | 'off' | 'failed'> {
  if (!fitAlertsOn()) return 'off';
  try {
    return await tellFit(liveFitDeps, input);
  } catch (err) {
    logger.warn({ to: input.to, kind: input.kind, ref: input.ref, err: (err as Error).message }, 'fit alert failed');
    return 'failed';
  }
}
