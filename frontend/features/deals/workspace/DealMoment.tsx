'use client';

/// This moment (rule 3, view 48): whose move it is in a small line, then one
/// sentence as the heading of the page.
export function DealMoment({ label, yours, sentence, automatic, compact = false }: {
  /// Inside the deal card the sentence reads as the card's title, not the page's.
  compact?: boolean;
  label: string;
  yours: boolean;
  sentence: string | null;
  automatic: string | null;
}) {
  return (
    <div data-deal-moment>
      <p className={yours ? 'text-[13px] font-semibold text-[var(--ink)]' : 'text-[13px] text-[var(--ink-secondary)]'}>{label}</p>
      {sentence ? <p className={compact ? 'mt-0.5 text-[17px] font-semibold leading-[1.3] text-[var(--ink)]' : 'mt-1 text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--ink)]'}>{sentence}</p> : null}
      {automatic ? <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">{automatic}</p> : null}
    </div>
  );
}
