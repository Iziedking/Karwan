import { logger } from '../logger.js';
import { config } from '../config.js';
import { sendTelegramMessage, supportOperatorChatId } from '../telegram/bot.js';
import { readVaultLiquidity } from './vaultLiquidity.js';

/// Tell the operator when a withdrawal has just created a funding gap.
///
/// Claims are paid from the vault's liquid USDC, the vault cannot redeem USYC
/// itself, and the scheduled wrap only runs once a day. So there is a window
/// where a cooldown matures and the money is not there. The cooldown is also
/// the warning: a withdrawal request says three days ahead of time exactly how
/// much will be needed and when.
///
/// This turns that request into a message, so the gap is closed before a user
/// meets it rather than after they report it.
///
/// Fire-and-forget on purpose. A failed alert must never fail the withdrawal
/// the user just asked for.

/// Don't repeat the same alert every time somebody requests a withdrawal while
/// the vault is already known to be short. One message per hour is enough to
/// act on and few enough to keep reading.
const REPEAT_AFTER_MS = 60 * 60_000;
let lastAlertAt = 0;

function fmtUsd(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v;
}

export function alertIfClaimLiquidityShort(vaultAddress: string | undefined): void {
  if (!vaultAddress) return;
  void (async () => {
    try {
      const liq = await readVaultLiquidity(vaultAddress);
      const shortfall = Number(liq.shortfallUsdc);
      if (!(shortfall > 0)) return;

      // Always log, even when the Telegram message is rate-limited away: the
      // log is what an incident review reads.
      logger.warn(
        {
          vault: liq.vault,
          liquidUsdc: liq.liquidUsdc,
          liabilityUsdc: liq.liabilityUsdc,
          shortfallUsdc: liq.shortfallUsdc,
          urgentShortfallUsdc: liq.urgentShortfallUsdc,
          nextDueAt: liq.nextDueAt,
        },
        'vault cannot cover every position in cooldown',
      );

      const chat = supportOperatorChatId();
      if (!chat) return;
      if (Date.now() - lastAlertAt < REPEAT_AFTER_MS) return;
      lastAlertAt = Date.now();

      const urgent = Number(liq.urgentShortfallUsdc) > 0;
      const due = liq.nextDueAt
        ? `Next cooldown matures ${new Date(liq.nextDueAt * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC.`
        : '';
      const base = config.FRONTEND_BASE_URL ?? 'https://karwan.site';

      await sendTelegramMessage(
        chat,
        [
          urgent
            ? `*Claims are failing.* The vault is short ${fmtUsd(liq.urgentShortfallUsdc)} USDC against stakes that are claimable RIGHT NOW.`
            : `*Stake cooldown needs funding.* The vault holds ${fmtUsd(liq.liquidUsdc)} USDC against ${fmtUsd(liq.liabilityUsdc)} owed.`,
          `Short ${fmtUsd(liq.shortfallUsdc)} USDC. ${due}`.trim(),
          `Redeem and cover: ${base}/admin/usyc`,
        ].join('\n\n'),
      );
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'claim liquidity alert failed');
    }
  })();
}
