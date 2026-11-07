import type { UserProfile } from '../db/profiles.js';
import { readUsdcRates, type UsdcRates } from '../rates/usdcRates.js';
import type { BriefMoney } from './agentBriefParse.js';

/// The currency a person answers setup in: the one they read amounts in (set
/// by their country at sign-up, or on /settings), with today's rate. Null for
/// USDC or when no fresh rate exists, so prices are read as USDC and never at
/// an old rate.
export function briefMoney(profile: Pick<UserProfile, 'settings'> | null, rates: UsdcRates): BriefMoney | null {
  const currency = profile?.settings?.displayCurrency;
  if (!currency || currency === 'USDC') return null;
  const rate = rates.rates[currency];
  return rate && rates.updatedAt !== null ? { currency, rate } : null;
}

export async function briefMoneyFor(profile: Pick<UserProfile, 'settings'> | null): Promise<BriefMoney | null> {
  if (!profile?.settings?.displayCurrency || profile.settings.displayCurrency === 'USDC') return null;
  try {
    return briefMoney(profile, await readUsdcRates());
  } catch {
    return null;
  }
}
