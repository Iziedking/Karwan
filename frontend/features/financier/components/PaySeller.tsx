'use client';

import { useState } from 'react';
import { usePublicClient } from 'wagmi';
import { api, ConfirmCancelled, type FactoringOffer } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { formatUsdc } from '@/shared/utils/format';
import { PRIMARY } from '@/shared/ui/controls';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { runWalletLegacyCalls } from '@/features/guarantee/walletGuarantee';

/// A financier who pays from their own wallet pays a seller who took their
/// offer (view 18): the server prepares the two calls, the wallet sends them,
/// and the receipt is checked before the line counts.
export function PaySeller({ offer, onPaid }: { offer: FactoringOffer; onPaid: () => void }) {
  const tr = useTranslations();
  const t = tr.financierDashboard.positions;
  const { locale } = useLocale();
  const ownWallet = useOwnWalletSend();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const by = offer.sellerDeadline
    ? new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(offer.sellerDeadline)
    : '';

  async function pay() {
    setBusy(true);
    setNote(null);
    try {
      const { calls } = await api.factoringOpenCalls(offer.id);
      if (!arc) throw new Error('no wallet to sign');
      const sent = await runWalletLegacyCalls({ calls, ownWallet, arcClient: arc, revertedText: tr.chainErrors.reverted });
      await api.factoringOpenComplete(offer.id, sent.txHash);
      setNote(t.paid);
      onPaid();
    } catch (err) {
      if (err instanceof ConfirmCancelled) return;
      setNote(err instanceof Error && err.message && err.message !== 'no wallet to sign' ? err.message : t.payFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button type="button" disabled={busy} onClick={() => void pay()} className={PRIMARY}>
        {t.paySeller}
      </button>
      <p className="text-[14px] tabular-nums text-[var(--lp-text-sub)]">
        {t.paySellerBy.replace('{amount}', formatUsdc(offer.offeredAdvanceUsdc, { withSuffix: false })).replace('{time}', by)}
      </p>
      {note ? <p role="status" className="text-[14px] text-[var(--lp-dark)]">{note}</p> : null}
    </div>
  );
}
