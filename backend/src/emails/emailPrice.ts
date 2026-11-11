import { findProfileByEmail, getProfile } from '../db/profiles.js';
import { readSharedRates } from '../rates/sharedRate.js';
import { figureFor } from '../rates/figure.js';
import type { LocalCurrency } from '../rates/usdcRates.js';
import { emailAmount } from './brand.js';
import { formatEmailUsdc } from './dealEventEmail.js';

/// A deal amount in an invite, update or cancel email reads the way prices do
/// on the site (view 54): one figure in the chosen currency. Only the big
/// amount at the top, the email's block balance, keeps the USDC under it.

/// "₦26,922", or "20.00 USDC".
export function emailPriceText(usdc: string, local?: string): string {
  return local ?? `${formatEmailUsdc(usdc)} USDC`;
}

/// The big amount at the top of the email, the USDC beside it.
export function emailPriceHero(usdc: string, local?: string): string {
  return local ? emailAmount(local, `${formatEmailUsdc(usdc)} USDC`) : emailAmount(formatEmailUsdc(usdc));
}

/// The amount in the currency the person chose. An invited email that already
/// belongs to an account uses that account's choice; someone new to Karwan
/// sees the inviter's currency, the one the deal was priced in. A price agreed
/// in that currency reads as agreed (view 77).
export async function localAmountForEmail(
  usdc: string,
  who: { email?: string; address?: string; inviter?: string },
  agreed?: { currency: LocalCurrency; amount: string } | null,
): Promise<string | undefined> {
  try {
    const own = who.address ? await getProfile(who.address) : who.email ? await findProfileByEmail(who.email) : null;
    const profile = own?.settings?.displayCurrency ? own : who.inviter ? await getProfile(who.inviter) : null;
    const currency = profile?.settings?.displayCurrency;
    if (!currency || currency === 'USDC') return undefined;
    const rates = await readSharedRates().catch(() => ({ rates: {}, updatedAt: null, source: null }) as const);
    const kept = agreed ? [{ usdc: Number(usdc), local: agreed }] : [];
    return figureFor(Number(usdc), currency, rates, own?.settings?.locale ?? profile?.settings?.locale ?? 'en', kept) ?? undefined;
  } catch {
    return undefined;
  }
}
