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
  /// Mechanical confidence: 'grounded' = at least two price quotes verified
  /// in code against distinct sources. Absent on legacy reads.
  priceConfidence?: 'grounded' | 'rough' | 'none';
  /// Market price band computed from the verified observations.
  priceBandUsdc?: { low: number; mid: number; high: number };
  /// Price points that survived quote verification, each citing its source.
  priceObservations?: {
    amountUsdc: number;
    unit: string;
    quote: string;
    sourceIndex: number;
  }[];
  highlights: string[];
  sources: { title: string; url: string; publishedDate?: string }[];
  /// Research angles the sweep ran (pricing/demand/landscape).
  anglesRun?: string[];
  amountUsd: number;
  txHash?: string;
  payer?: string;
  researchedAt: number;
}

const usdcFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const TONES: Record<MarketReadData['demand'], { fg: string; bg: string }> = {
  hot: { fg: '#4f8a3f', bg: 'rgba(79,138,63,0.14)' },
  soft: { fg: '#b07d1f', bg: 'rgba(176,125,31,0.14)' },
  steady: { fg: '#3a6ea5', bg: 'rgba(58,110,165,0.12)' },
};

/// Frame the price takeaway from the viewer's side. The market FACTS (summary,
/// highlights, fair price) are shared; only the advice differs: hot demand is
/// leverage for a seller but a premium for a buyer. Derived from `demand` so each
/// party reads guidance that fits its own situation, not the counterparty's.
function roleNote(demand: MarketReadData['demand'], role: 'buyer' | 'seller'): string {
  if (demand === 'hot') {
    return role === 'buyer'
      ? 'Demand is hot, so expect to pay toward the top of the range.'
      : 'Demand is hot, so you hold leverage on price here.';
  }
  if (demand === 'soft') {
    return role === 'buyer'
      ? 'Demand is soft, so there is room to negotiate the price down.'
      : 'Demand is soft, so expect some price pressure.';
  }
  return 'Demand is steady, so the price should sit near the market rate.';
}

export function MarketReadCard({
  mr,
  role,
}: {
  mr: MarketReadData;
  /// The viewer's side, so the price note reads from their angle. Omitted on
  /// role-less surfaces (e.g. the user's own market scout), which fall back to
  /// the neutral note the agent wrote.
  role?: 'buyer' | 'seller';
}) {
  const tone = TONES[mr.demand];
  const note = role ? roleNote(mr.demand, role) : mr.priceNote;
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
          {mr.priceBandUsdc && mr.priceBandUsdc.low !== mr.priceBandUsdc.high ? (
            <span
              className="mono text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 text-[var(--lp-text-sub)] tabular-nums"
              style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 3 }}
            >
              market {usdcFmt.format(mr.priceBandUsdc.low)} to{' '}
              {usdcFmt.format(mr.priceBandUsdc.high)} USDC
            </span>
          ) : mr.fairPriceUsdc != null ? (
            <span
              className="mono text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 text-[var(--lp-text-sub)] tabular-nums"
              style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 3 }}
            >
              market ~{usdcFmt.format(mr.fairPriceUsdc)} USDC
            </span>
          ) : null}
          <span
            className="mono text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-0.5"
            style={{ color: tone.fg, background: `${tone.fg}26`, borderRadius: 3 }}
          >
            {mr.demand} demand
          </span>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)]">{mr.summary}</p>
      {note && (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--lp-text-sub)] italic">{note}</p>
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
      {(mr.priceObservations?.length ?? 0) > 0 && (
        <div className="mt-2.5">
          <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:PRICES FOUND IN SOURCES:]
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {mr.priceObservations!.slice(0, 4).map((o, i) => {
              const src = mr.sources[o.sourceIndex];
              return (
                <li key={`${o.sourceIndex}-${i}`} className="text-[11px] leading-snug">
                  <span className="mono font-bold text-[var(--lp-dark)] tabular-nums">
                    {usdcFmt.format(o.amountUsdc)} USDC
                  </span>
                  <span className="mono text-[10px] text-[var(--lp-text-muted)]"> · {o.unit}</span>
                  <span className="text-[var(--lp-text-sub)] italic"> “{o.quote.length > 110 ? `${o.quote.slice(0, 110)}…` : o.quote}”</span>
                  {src && (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[10px] underline underline-offset-2 hover:opacity-80 ms-1"
                      style={{ color: tone.fg }}
                    >
                      source ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {mr.priceConfidence === 'grounded'
              ? 'each price checked word for word against its source'
              : 'one sourced price found. treat the number as a hint'}
          </p>
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-3 flex-wrap mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        <span>
          agent paid ${mr.amountUsd} to research
          {(mr.anglesRun?.length ?? 0) > 1 ? ` · ${mr.anglesRun!.length}-angle search` : ''} · Base
        </span>
        {/^0x[0-9a-fA-F]{64}$/.test(mr.txHash ?? '') ? (
          <a
            href={`https://basescan.org/tx/${mr.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
            style={{ color: tone.fg }}
          >
            view payment ↗
          </a>
        ) : /^0x[0-9a-fA-F]{40}$/.test(mr.payer ?? '') ? (
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
        {mr.sources.length > 0 && (
          <span>
            {mr.sources.length} sources
            {(() => {
              const dates = mr.sources
                .map((s) => s.publishedDate)
                .filter((d): d is string => !!d)
                .sort();
              const latest = dates[dates.length - 1];
              return latest ? ` · latest ${latest.slice(0, 7)}` : '';
            })()}
          </span>
        )}
      </div>
    </div>
  );
}
