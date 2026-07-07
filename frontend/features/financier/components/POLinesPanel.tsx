'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type POFinancingLine } from '@/core/api';

/// The user's purchase-order financing lines, as financier and as seller, with
/// live status and on-chain proof. The money-out legs run automatically: once
/// the buyer accepts proof of delivery the platform releases the principal to
/// the seller on chain, and once the underlying deal settles it pulls the
/// repayment to the financier. This panel is where both sides watch that happen
/// and click through to the transactions.

const ARC_EXPLORER = 'https://testnet.arcscan.app';

function isTxHash(h?: string): boolean {
  return !!h && /^0x[0-9a-fA-F]{64}$/.test(h);
}

const STATE_LABEL: Record<POFinancingLine['state'], string> = {
  funded: 'Funded, awaiting delivery',
  released: 'Delivered, principal sent',
  repaid: 'Repaid, settled',
  reclaimed: 'Reclaimed',
  defaulted: 'Defaulted',
};

const STATE_TONE: Record<POFinancingLine['state'], string> = {
  funded: '#b25425',
  released: '#3a6ea5',
  repaid: '#4f8a3f',
  reclaimed: '#6b6b6b',
  defaulted: '#7a1f1a',
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

function LineRow({ line, side }: { line: POFinancingLine; side: 'financier' | 'seller' }) {
  const proof = proofFor(line);
  const tone = STATE_TONE[line.state];
  const counterparty = side === 'financier' ? line.seller : line.financier;
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
        </div>
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
        Release and repayment run automatically on chain. When the buyer accepts delivery the
        principal is sent to the seller, and when the deal settles the repayment is pulled to the
        financier. Every step links to its transaction on Arc.
      </p>

      {lines.asFinancier.length > 0 ? (
        <div className="mt-4">
          <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mb-2">
            You funded
          </p>
          <ul className="space-y-2">
            {lines.asFinancier.map((l) => (
              <LineRow key={l.id} line={l} side="financier" />
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
              <LineRow key={l.id} line={l} side="seller" />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
