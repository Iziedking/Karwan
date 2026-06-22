'use client';

/// The agent's paid market read, rendered identically on the match-proposal
/// banner and the deal page. UI copy says "agent research" / "Market read" and
/// "agent paid $X to research" — never "x402" (that's documentation-only).

export interface MarketReadData {
  keywords: string[];
  summary: string;
  demand: 'hot' | 'steady' | 'soft';
  priceNote: string;
  fairPriceUsdc?: number;
  highlights: string[];
  sources: { title: string; url: string }[];
  amountUsd: number;
  txHash?: string;
  payer?: string;
  researchedAt: number;
}

const TONES: Record<MarketReadData['demand'], { fg: string; bg: string }> = {
  hot: { fg: '#4f8a3f', bg: 'rgba(79,138,63,0.14)' },
  soft: { fg: '#b07d1f', bg: 'rgba(176,125,31,0.14)' },
  steady: { fg: '#3a6ea5', bg: 'rgba(58,110,165,0.12)' },
};

export function MarketReadCard({ mr }: { mr: MarketReadData }) {
  const tone = TONES[mr.demand];
  return (
    <div
      className="px-4 py-3"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.fg}3a`,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:MARKET READ:]
        </span>
        <div className="flex items-center gap-2">
          {mr.fairPriceUsdc != null && (
            <span
              className="mono text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 text-[var(--lp-text-sub)]"
              style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 3 }}
            >
              market ~${mr.fairPriceUsdc.toFixed(0)}
            </span>
          )}
          <span
            className="mono text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-0.5"
            style={{ color: tone.fg, background: `${tone.fg}26`, borderRadius: 3 }}
          >
            {mr.demand} demand
          </span>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)]">{mr.summary}</p>
      {mr.priceNote && (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--lp-text-sub)] italic">
          {mr.priceNote}
        </p>
      )}
      {mr.highlights.length > 0 && (
        <ul className="mt-2 space-y-1">
          {mr.highlights.map((h) => (
            <li
              key={h}
              className="text-[11px] leading-snug text-[var(--lp-text-sub)] ps-3"
              style={{ textIndent: '-0.7rem' }}
            >
              • {h}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex items-center gap-3 flex-wrap mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        <span>agent paid ${mr.amountUsd} to research · Base</span>
        {mr.txHash ? (
          <a
            href={`https://basescan.org/tx/${mr.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
            style={{ color: tone.fg }}
          >
            view payment ↗
          </a>
        ) : mr.payer ? (
          <a
            href={`https://basescan.org/tokentxns?a=${mr.payer}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
            style={{ color: tone.fg }}
          >
            view payer ↗
          </a>
        ) : null}
        {mr.sources.length > 0 && <span>{mr.sources.length} sources</span>}
      </div>
    </div>
  );
}
