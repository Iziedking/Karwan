'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { MoneySheet } from '@/features/money/components/MoneySheet';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import type { AgentKey } from '@/features/money/moneySheetModel';
import { Icon, type IconName } from '@/shared/components/Icon';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { walletActions, type WalletAction, type WalletActionIcon, type WalletTab } from './walletActions';

const ICON: Record<WalletActionIcon, IconName> = {
  plus: 'plus',
  out: 'arrow-up-right',
  send: 'send',
  request: 'receipt',
  back: 'arrow-down-left',
};

const TILE =
  'flex min-h-[128px] flex-col items-start gap-3 rounded-[18px] p-4 text-start transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

/// What the selected wallet lets you do, as button tiles (view 19, Money
/// board). Your wallet opens the add, withdraw, send and request pages; an
/// agent wallet moves money to or from your wallet in the quick-move sheet.
export function WalletPanel({ tab }: { tab: WalletTab }) {
  const t = useTranslations().walletPanel;
  const auth = useAuth();
  const balances = useMoneyBalances();
  const [sheet, setSheet] = useState<{ move: 'topUp' | 'withdraw'; agent: AgentKey } | null>(null);
  const account = auth.method === 'circle' ? 'email' : 'wallet';
  const actions = walletActions(tab, account, ARC_NETWORK === 'testnet' ? 'testnet' : 'mainnet');

  return (
    <section aria-labelledby="wallet-panel-title" className="flex h-full flex-col rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6">
      <h2 id="wallet-panel-title" className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--lp-dark)]">{t.title[tab]}</h2>
      <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.intro[tab]}</p>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        {actions.map((a) => (
          <Tile key={`${a.key}-${a.note}`} action={a} label={t.label[a.key]} note={t.note[a.note]} onMove={(go) => setSheet(go)} />
        ))}
      </div>
      <MoneySheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        onDone={() => { setSheet(null); balances.refetch(); }}
        move={sheet?.move ?? 'topUp'}
        agent={sheet?.agent ?? 'buyer'}
      />
    </section>
  );
}

function Tile({ action, label, note, onMove }: {
  action: WalletAction;
  label: string;
  note: string;
  onMove: (go: { move: 'topUp' | 'withdraw'; agent: AgentKey }) => void;
}) {
  const tone = action.primary
    ? 'bg-[var(--lp-accent)] text-[var(--accent-ink)] hover:bg-[var(--lp-accent-hover)]'
    : 'border border-[var(--lp-border-light)] bg-[var(--lp-light)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]';
  const body = (
    <>
      <span aria-hidden className={cn('grid size-10 place-items-center rounded-[12px]', action.primary ? 'bg-black/10' : 'bg-[var(--lp-card)]')}>
        <Icon name={ICON[action.icon]} size={20} />
      </span>
      <span>
        <span className="block text-[16px] font-semibold">{label}</span>
        <span className={cn('mt-0.5 block text-[14px] font-medium leading-snug', action.primary ? 'opacity-80' : 'text-[var(--lp-text-sub)]')}>{note}</span>
      </span>
    </>
  );
  if ('href' in action.go) {
    return <Link href={action.go.href} className={cn(TILE, tone)}>{body}</Link>;
  }
  const go = action.go;
  return (
    <button type="button" onClick={() => onMove(go)} className={cn(TILE, tone)}>
      {body}
    </button>
  );
}
