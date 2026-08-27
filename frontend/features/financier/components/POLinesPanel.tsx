'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { api, type POFinancingLine } from '@/core/api';
import Link from 'next/link';

/// The user's purchase-order financing lines, as financier and as seller, with
/// live status and on-chain proof. The advance reaches the seller in the
/// funding transaction itself, and once the underlying deal settles the escrow
/// pays the financier back ahead of the seller. This panel is where both sides
/// watch that happen and click through to the transactions.

const ARC_EXPLORER = 'https://testnet.arcscan.app';

function isTxHash(h?: string): boolean {
  return !!h && /^0x[0-9a-fA-F]{64}$/.test(h);
}

/// 'funded', 'released' and 'reclaimed' only appear on lines opened before the
/// custody rail was retired.
const STATE_LABEL: Record<POFinancingLine['state'], string> = {
  outstanding: 'Advanced, awaiting settlement',
  repaid: 'Repaid, settled',
  defaulted: 'Defaulted',
  funded: 'Funded, awaiting delivery',
  released: 'Delivered, principal sent',
  reclaimed: 'Reclaimed',
};

const STATE_TONE: Record<POFinancingLine['state'], string> = {
  outstanding: '#b25425',
  repaid: 'var(--lp-accent)',
  defaulted: '#7a1f1a',
  funded: '#b25425',
  released: '#3a6ea5',
  reclaimed: '#6b6b6b',
};

/// The single most-advanced on-chain proof for a line: the repayment, else the
/// release, else the funding. Each is a real Arc transaction.
function proofFor(line: POFinancingLine): { href: string; label: string } | null {
  const t = line.txHashes;
  if (isTxHash(t.repay)) return { href: `${ARC_EXPLORER}/tx/${t.repay}`, label: 'repayment ↗' };
  if (isTxHash(t.release)) return { href: `${ARC_EXPLORER}/tx/${t.release}`, label: 'release ↗' };
  if (isTxHash(t.reclaim)) return { href: `${ARC_EXPLORER}/tx/${t.reclaim}`, label: 'reclaim ↗' };
  if (isTxHash(t.fund)) return { href: `${ARC_EXPLORER}/tx/${t.fund}`, label: 'funding ↗' };
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
  const pb = useTranslations().pageBits;
  const proof = proofFor(line);
  const tone = STATE_TONE[line.state];
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
    <li className="border border-[var(--lp-border-light)] rounded-xl overflow-hidden">
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span
            className="mono text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded shrink-0"
            style={{ color: tone, background: `${tone}1f` }}
          >
            {STATE_LABEL[line.state]}
          </span>
          {/* A line in a custody-rail state sits on the retired contract, which
              has had its escrow assigner revoked and holds no USDC. It cannot
              progress and nothing will drive it. Saying so beats leaving a
              financier waiting on a delivery that will never release. */}
          {isLegacy ? (
            <span
              className="mono text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded shrink-0"
              style={{ color: '#6b6b6b', background: '#6b6b6b1f' }}
              title={pb.financierPanels.retiredContract}
            >
              RETIRED RAIL
            </span>
          ) : null}
          <span className="mono text-[13px] font-bold tabular-nums text-[var(--lp-dark)]">
            {side === 'financier'
              ? `${line.principalUsdc} → ${line.repayUsdc} USDC`
              : `${line.principalUsdc} USDC advance`}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3 flex-wrap mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          <span>{side === 'financier' ? 'seller' : 'financier'} {short(counterparty)}</span>
          {proof ? (
            <a
              href={proof.href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:opacity-80"
              style={{ color: tone }}
            >
              {proof.label}
            </a>
          ) : null}
          <Link href={'/financier/po/' + line.id}>{pb.financierPanels.positionDetails}</Link>
        </div>
        {isLegacy ? (
          <div className="mt-2.5 pt-2.5 border-t border-[var(--lp-border-light)] flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-[var(--lp-text-muted)] max-w-[46ch]">
              This line is on the retired contract. It holds no funds and cannot move, so it will
              not settle on its own.
            </span>
            <button
              type="button"
              onClick={dismiss}
              disabled={dismissing}
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold px-2.5 py-1.5 border border-[var(--lp-outline-strong)] disabled:opacity-50 shrink-0"
              style={{ borderRadius: 6 }}
            >
              {dismissing ? 'Dismissing…' : 'Dismiss'}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function POLinesPanel() {
  const [lines, setLines] = useState<{ asFinancier: POFinancingLine[]; asSeller: POFinancingLine[] } | null>(
    null,
  );

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
    <div
      className="mt-8 bg-[var(--lp-card)] border border-[var(--lp-border-light)] p-5"
      style={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          [:MY PO LINES:]
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
          {total} line{total === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)] max-w-[64ch]">
        The advance reaches the seller in the same transaction that funds the line, and the escrow
        repays you ahead of the seller when the deal settles. Every step links to its transaction
        on Arc.
      </p>

      {lines.asFinancier.length > 0 ? (
        <div className="mt-4">
          <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mb-2">
            You funded
          </p>
          <ul className="space-y-2">
            {lines.asFinancier.map((l) => (
              <LineRow key={l.id} line={l} side="financier" onDismissed={load} />
            ))}
          </ul>
        </div>
      ) : null}

      {lines.asSeller.length > 0 ? (
        <div className="mt-4">
          <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mb-2">
            Financed to you
          </p>
          <ul className="space-y-2">
            {lines.asSeller.map((l) => (
              <LineRow key={l.id} line={l} side="seller" onDismissed={load} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
