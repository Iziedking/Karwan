'use client';
import { useCallback, useEffect, useState } from 'react';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { financeDeskCopy } from '@/shared/i18n/messages/financeDesk';
import { api, type POFinancingLine } from '@/core/api';
import Link from 'next/link';
import { settlementExplorer } from '@/core/arcNetwork';

/// The user's purchase-order financing lines, as financier and as seller, with
/// live status and on-chain proof. The advance reaches the seller in the
/// funding transaction itself, and once the underlying deal settles the escrow
/// pays the financier back ahead of the seller. This panel is where both sides
/// watch that happen and click through to the transactions.

const ARC_EXPLORER = settlementExplorer;

function isTxHash(h?: string): boolean {
  return !!h && /^0x[0-9a-fA-F]{64}$/.test(h);
}

/// The single most-advanced on-chain proof for a line: the repayment, else the
/// release, else the funding. Each is a real Arc transaction.
function proofFor(line: POFinancingLine): { href: string; kind: 'repay' | 'release' | 'reclaim' | 'fund' } | null {
  const t = line.txHashes;
  for (const kind of ['repay', 'release', 'reclaim', 'fund'] as const) {
    if (isTxHash(t[kind])) return { href: `${ARC_EXPLORER}/tx/${t[kind]}`, kind };
  }
  return null;
}

function short(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

const LEGACY_STATES = ['funded', 'released', 'reclaimed'];

function LineRow({
  line,
  side,
  onDismissed,
}: {
  line: POFinancingLine;
  side: 'financier' | 'seller';
  onDismissed: () => void;
}) {
  const { locale } = useLocale();
  const copy = financeDeskCopy[locale].poLines;
  const mt = useMoneyText({ compact: true });
  const proof = proofFor(line);
  const counterparty = side === 'financier' ? line.seller : line.financier;
  // A retired-rail line cannot progress: the contract holding it has no USDC
  // and can no longer assign. Leaving it on the desk reads as a delivery that
  // is still coming.
  const isLegacy = LEGACY_STATES.includes(line.state);
  const [dismissing, setDismissing] = useState(false);

  async function dismiss() {
    setDismissing(true);
    try {
      await api.archivePOLine({ lineId: line.id });
      onDismissed();
    } catch {
      setDismissing(false);
    }
  }

  return (
    <li className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium text-[var(--ink)]">
          {copy.states[line.state]}
          {/* A line in a custody-rail state sits on the retired contract, which
              has had its escrow assigner revoked and holds no USDC. It cannot
              progress and nothing will drive it. Saying so beats leaving a
              financier waiting on a delivery that will never release. */}
          {isLegacy ? <span className="text-[var(--ink-secondary)]"> · {copy.retired}</span> : null}
        </p>
        <p className="shrink-0 text-[15px] tabular-nums text-[var(--ink)]">
          {side === 'financier'
            ? mt.fill(copy.outAndBack, { principal: line.principalUsdc, repay: line.repayUsdc })
            : mt.fill(copy.advance, { amount: line.principalUsdc })}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--ink-secondary)]">
        <span>{(side === 'financier' ? copy.seller : copy.financier).replace('{who}', short(counterparty))}</span>
        {proof ? (
          <a href={proof.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--ink)]">
            {copy.proof[proof.kind]}
          </a>
        ) : null}
        <Link href={'/financier/po/' + line.id} className="underline underline-offset-2 hover:text-[var(--ink)]">
          {copy.details}
        </Link>
      </div>
      {isLegacy ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[46ch] text-[14px] text-[var(--ink-muted)]">{copy.retiredBody}</p>
          <button type="button" onClick={dismiss} disabled={dismissing} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {dismissing ? copy.dismissing : copy.dismiss}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function POLinesPanel() {
  const [lines, setLines] = useState<{ asFinancier: POFinancingLine[]; asSeller: POFinancingLine[] } | null>(
    null,
  );

  const { locale } = useLocale();
  const copy = financeDeskCopy[locale].poLines;
  const load = useCallback(() => {
    api
      .listMyPOLines()
      .then(setLines)
      .catch(() => setLines({ asFinancier: [], asSeller: [] }));
  }, []);

  useEffect(() => {
    load();
    // The legs settle a minute or two after PoD / settlement, so poll while the
    // desk is open rather than making the user refresh.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (!lines) return null;
  const total = lines.asFinancier.length + lines.asSeller.length;
  if (total === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-[var(--ink)]">{copy.title}</h2>
        <span className="text-[14px] text-[var(--ink-secondary)]">
          {total === 1 ? copy.one : copy.many.replace('{count}', String(total))}
        </span>
      </div>
      <p className="mt-2 max-w-[64ch] text-[14px] leading-snug text-[var(--ink-secondary)]">{copy.intro}</p>

      {lines.asFinancier.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[15px] font-medium text-[var(--ink)]">{copy.youFunded}</h3>
          <ul className={`${CARD_CLASS} divide-y divide-[var(--line)] px-5`}>
            {lines.asFinancier.map((l) => (
              <LineRow key={l.id} line={l} side="financier" onDismissed={load} />
            ))}
          </ul>
        </div>
      ) : null}

      {lines.asSeller.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[15px] font-medium text-[var(--ink)]">{copy.financedToYou}</h3>
          <ul className={`${CARD_CLASS} divide-y divide-[var(--line)] px-5`}>
            {lines.asSeller.map((l) => (
              <LineRow key={l.id} line={l} side="seller" onDismissed={load} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
