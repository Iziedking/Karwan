'use client';
import { useState } from 'react';
import { useActivation } from '@/shared/hooks/useActivation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatBalance } from '@/features/money/balanceModel';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { MoneySheet } from '@/features/money/components/MoneySheet';
import type { AgentKey, MoneyMove } from '@/features/money/moneySheetModel';
import { Row, RowGroup } from '../ui/ProfileUi';

const pill =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

/// Each agent's balance with top up and withdraw, opened in place.
export function AgentFundsList({ onSetUp }: { onSetUp: () => void }) {
  const t = useTranslations().money.home;
  const simple = useTranslations().profile.simple;
  const { locale } = useLocale();
  const balances = useMoneyBalances();
  const activation = useActivation();
  const [sheet, setSheet] = useState<{ move: MoneyMove; agent: AgentKey } | null>(null);

  if (balances.activationLoading) {
    return <div aria-busy="true" className="h-[104px] rounded-[18px] bg-[var(--lp-card)]" />;
  }
  if (!balances.activated) {
    return (
      <RowGroup>
        <Row label={t.agentsNotSetUp}>
          <button type="button" onClick={onSetUp} className={pill}>{simple.setUp}</button>
        </Row>
      </RowGroup>
    );
  }
  return (
    <>
      <RowGroup>
        {(['buyer', 'seller'] as const).map((agent) => {
          const amount = agent === 'buyer' ? balances.buyer : balances.seller;
          const custom = agent === 'buyer' ? activation.agents?.buyerName : activation.agents?.sellerName;
          return (
            <Row
              key={agent}
              label={
                <span className="block">
                  {custom || (agent === 'buyer' ? t.buyingAgent : t.sellingAgent)}
                  <span className="block text-[14px] font-normal tabular-nums text-[var(--lp-text-sub)]">
                    {amount == null ? simple.notAvailable : `${formatBalance(amount, locale)} USDC`}
                  </span>
                </span>
              }
            >
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setSheet({ move: 'topUp', agent })} className={pill}>{t.topUp}</button>
                <button type="button" onClick={() => setSheet({ move: 'withdraw', agent })} className={pill}>{t.withdraw}</button>
              </span>
            </Row>
          );
        })}
      </RowGroup>
      <MoneySheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        onDone={() => { setSheet(null); balances.refetch(); }}
        move={sheet?.move ?? 'topUp'}
        agent={sheet?.agent ?? 'buyer'}
      />
    </>
  );
}
