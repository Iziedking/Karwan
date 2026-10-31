'use client';

/// This moment (rule 3): whose move it is, one sentence, and what happens on
/// its own and when.
export function DealMoment({ label, yours, sentence, automatic }: {
  label: string;
  yours: boolean;
  sentence: string | null;
  automatic: string | null;
}) {
  return (
    <div data-deal-moment>
      <p className={yours ? 'text-[14px] font-bold text-[var(--lp-accent-on-light)]' : 'text-[14px] font-semibold text-[var(--lp-text-sub)]'}>{label}</p>
      {sentence ? <p className="mt-1 text-[16px] leading-snug text-[var(--lp-dark)]">{sentence}</p> : null}
      {automatic ? <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{automatic}</p> : null}
    </div>
  );
}
