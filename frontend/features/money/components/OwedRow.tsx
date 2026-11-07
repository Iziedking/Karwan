'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { api } from '@/core/api';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { buttonClasses } from '@/shared/components/Button';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { owedMoneyCopy } from '@/shared/i18n/messages/owedMoney';
import { useMoneyText } from '../hooks/useMoneyText';
import { owedOutcome, owedView, type OwedView } from '../owedModel';

type Outcome = 'done' | 'partly' | 'failed';

/// Money owed to you (view 66): shown only when something is owed. Collect
/// pays the wallet that was owed, never anywhere else.
export function OwedRow() {
  const auth = useAuth();
  const { locale } = useLocale();
  const t = owedMoneyCopy[locale];
  const money = useMoneyText();
  const ownWallet = useOwnWalletSend();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [view, setView] = useState<OwedView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    setView(owedView(await api.moneyOwed().catch(() => null)));
  }, []);

  useEffect(() => {
    if (auth.address) void load();
  }, [auth.address, load]);

  if (!auth.address || (!view && !outcome)) return null;

  async function collect() {
    if (!view) return;
    setBusy(true);
    const requestId = crypto.randomUUID();
    let collected = 0;
    try {
      if (view.karwanIds.length) {
        const out = await api.collectOwed({ requestId }).catch(() => null);
        collected += out?.collected.length ?? 0;
      }
      for (const id of view.walletIds) {
        try {
          const intent = await api.owedIntent({ id, requestId });
          const sent = await ownWallet.send([{ to: intent.to, data: intent.data }]);
          if (arc) await requireConfirmedTx(arc, sent.txHash, t.failed);
          await api.owedComplete({ id, requestId, txHash: sent.txHash });
          collected++;
        } catch {
          // Left owed and shown again below; nothing moved that was not proved.
        }
      }
      setOutcome(owedOutcome({ asked: view.karwanIds.length + view.walletIds.length, collected }));
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const amount = view ? money.text(view.totalUsdc) : '';
  const exact = view ? money.usdc(view.totalUsdc, { exact: true }) : '';
  return (
    <section data-owed aria-labelledby="owed-heading" className="mt-6 border-t border-[var(--lp-border-light)] pt-5">
      <h3 id="owed-heading" className="text-[14px] font-semibold text-[var(--lp-text-muted)]">{t.title}</h3>
      {outcome ? <p role="status" className="mt-1.5 text-[15px] font-semibold text-[var(--lp-dark)]">{t[outcome]}</p> : null}
      {view && view.totalUsdc > 0 ? (
        <>
          <p className="mt-1.5 text-[15px] font-bold tabular-nums text-[var(--lp-dark)]">{t.amount.replace('{amount}', amount)}</p>
          <p className="mt-1 text-[14px] font-medium leading-5 text-[var(--lp-text-sub)]">{t.why}</p>
          <div className="mt-3">
            <button type="button" data-owed-collect onClick={() => setOpen(true)} className={buttonClasses({ variant: 'secondary' })}>
              {t.collect}
            </button>
          </div>
        </>
      ) : null}
      {view?.unreadable ? <p className="mt-1 text-[14px] font-medium leading-5 text-[var(--lp-text-sub)]">{t.unreadable}</p> : null}

      <ConfirmSheet
        open={open}
        title={t.sheet.title}
        consequence={t.sheet.body.replace('{amount}', exact)}
        irreversible
        busy={busy}
        error={null}
        onConfirm={() => void collect()}
        onClose={() => setOpen(false)}
        confirmLabel={t.sheet.confirm.replace('{amount}', exact)}
      >
        <dl className="text-[15px]">
          <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-[var(--lp-border-light)] py-3">
            <dt className="text-[var(--ink-secondary)]">{t.sheet.to}</dt>
            <dd className="font-medium text-[var(--ink)]">{t.sheet.toValue}</dd>
          </div>
        </dl>
      </ConfirmSheet>
    </section>
  );
}
