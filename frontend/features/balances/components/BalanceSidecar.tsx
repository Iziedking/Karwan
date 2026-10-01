'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { useActivation } from '@/shared/hooks/useActivation';
import { formatBalance } from '@/features/money/balanceModel';
import { toMicros } from '@/features/money/usdc';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { MoneySheet } from '@/features/money/components/MoneySheet';
import { useDealAmountNeed } from '../dealAmount';

const button =
  'inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

/// The agent wallet a deal form spends from, beside the form. Topping up opens
/// in place, and a price above the balance shows the gap before posting.
export function BalanceSidecar({ agent = 'buyer' }: { agent?: 'buyer' | 'seller' }) {
  const t = useTranslations().money.home;
  const { locale } = useLocale();
  const balances = useMoneyBalances();
  const activation = useActivation();
  const need = useDealAmountNeed();
  const [sheet, setSheet] = useState<{ amount?: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const amount = agent === 'buyer' ? balances.buyer : balances.seller;
  const custom = agent === 'buyer' ? activation.agents?.buyerName : activation.agents?.sellerName;
  const name = custom || (agent === 'buyer' ? t.buyingAgent : t.sellingAgent);
  const gapMicros = agent === 'buyer' && need != null && amount != null ? toMicros(need) - toMicros(amount) : 0;
  const gap = gapMicros > 0 ? Math.ceil(gapMicros / 10_000) / 100 : 0;

  return (
    <aside aria-labelledby="sidecar-balance" className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <h2 id="sidecar-balance" className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{name}</h2>
      {balances.activationLoading ? (
        <div aria-busy="true" className="mt-2 h-8 w-32 rounded-[8px] bg-[var(--lp-light)]" />
      ) : !balances.activated ? (
        <div className="mt-2 space-y-3">
          <p className="text-[14px] text-[var(--lp-dark)]">{t.agentsNotSetUp}</p>
          <button type="button" onClick={() => setSetupOpen(true)} className={`${button} bg-[var(--lp-accent)] text-[var(--lp-band-dark)]`}>
            {t.setUpAgents}
          </button>
        </div>
      ) : (
        <>
          {amount === null ? (
            <div aria-busy="true" className="mt-2 h-8 w-32 rounded-[8px] bg-[var(--lp-light)]" />
          ) : (
            <p className="mt-1 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{formatBalance(amount, locale)}</span>
              <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">USDC</span>
            </p>
          )}
          {gap > 0 ? (
            <p role="status" className="mt-2 text-[14px] leading-snug text-[var(--lp-dark)]">
              {t.shortTemplate.replace('{need}', formatBalance(need!, locale)).replace('{gap}', formatBalance(gap, locale))}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setSheet(gap > 0 ? { amount: gap } : {})}
            className={`${button} mt-4 ${gap > 0 ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]' : 'border border-[var(--lp-border-light)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]'}`}
          >
            {gap > 0 ? t.topUpGapTemplate.replace('{gap}', formatBalance(gap, locale)) : t.topUp}
          </button>
        </>
      )}
      <MoneySheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        onDone={() => { setSheet(null); balances.refetch(); }}
        move="topUp"
        agent={agent}
        prefillAmount={sheet?.amount}
      />
      <ActivationModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        activate={activation.activate}
        renameAgents={activation.renameAgents}
        activating={activation.activating}
        error={activation.error}
        activated={activation.activated}
        agents={activation.agents}
      />
    </aside>
  );
}
