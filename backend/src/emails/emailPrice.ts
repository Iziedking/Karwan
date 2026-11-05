import { findProfileByEmail, getProfile } from '../db/profiles.js';
import { readUsdcRates } from '../rates/usdcRates.js';
import { formatLocalAmount } from '../rates/localAmounts.js';
import { emailAmount } from './brand.js';
import { formatEmailUsdc } from './dealEventEmail.js';

/// A deal amount in an invite, update or cancel email reads the way prices do
/// on the site (owner, 5 Nov 2026): the chosen currency leads, the USDC it
/// really is stays beside it. With no local figure, USDC alone.

/// "₦26,922 · 20.00 USDC", or "20.00 USDC".
export function emailPriceText(usdc: string, local?: string): string {
  const figure = `${formatEmailUsdc(usdc)} USDC`;
  return local ? `${local} · ${figure}` : figure;
}

/// The big amount at the top of the email.
export function emailPriceHero(usdc: string, local?: string): string {
  return local ? emailAmount(local, `${formatEmailUsdc(usdc)} USDC`) : emailAmount(formatEmailUsdc(usdc));
}

/// The amount in the currency the person chose. An invited email that already
/// belongs to an account uses that account's choice; someone new to Karwan
/// sees the inviter's currency, the one the deal was priced in.
export async function localAmountForEmail(usdc: string, who: { email?: string; address?: string; inviter?: string }): Promise<string | undefined> {
  try {
    const own = who.address ? await getProfile(who.address) : who.email ? await findProfileByEmail(who.email) : null;
    const profile = own?.settings?.displayCurrency ? own : who.inviter ? await getProfile(who.inviter) : null;
    const currency = profile?.settings?.displayCurrency;
    if (!currency || currency === 'USDC') return undefined;
    const rates = await readUsdcRates();
    return formatLocalAmount(Number(usdc), currency, rates, own?.settings?.locale ?? profile?.settings?.locale ?? 'en') ?? undefined;
  } catch {
    return undefined;
  }
}
