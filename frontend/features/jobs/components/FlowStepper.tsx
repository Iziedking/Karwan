export type StepKey =
  | 'posted'
  | 'bidding'
  | 'counter'
  | 'accepted'
  | 'escrow'
  | 'milestones'
  | 'settled';

const steps: Array<{ key: StepKey; label: string }> = [
  { key: 'posted', label: 'Posted' },
  { key: 'bidding', label: 'Bidding' },
  { key: 'counter', label: 'Negotiating' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'escrow', label: 'Escrow' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'settled', label: 'Settled' },
];

export function FlowStepper({
  active,
  completed,
}: {
  active: StepKey;
  completed: StepKey[];
}) {
  const activeIndex = steps.findIndex((s) => s.key === active);
  const completedSet = new Set(completed);

  return (
    <ol className="flex items-center w-full overflow-x-auto">
      {steps.map((s, i) => {
        const done = completedSet.has(s.key) || i < activeIndex;
        const isActive = i === activeIndex;
        const isLast = i === steps.length - 1;
        return (
          <li key={s.key} className="flex items-center flex-1 min-w-fit">
            <div className="flex flex-col items-center gap-2 px-2">
              <span
                className={`w-7 h-7 rounded-full grid place-items-center text-[11px] mono border ${
                  done
                    ? 'bg-[var(--color-positive)] text-[#ffffff] border-[var(--color-positive)]'
                    : isActive
                      ? 'bg-[var(--color-accent)] text-[#ffffff] border-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-ink-faint)] border-[var(--color-line)]'
                }`}
              >
                {done ? <Check /> : i + 1}
              </span>
              <span
                className={`text-[11px] tracking-tight whitespace-nowrap ${
                  isActive || done ? 'text-[var(--color-ink)] font-medium' : 'text-[var(--color-ink-faint)]'
                }`}
              >
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`flex-1 h-px ${
                  done ? 'bg-[var(--color-positive)]/60' : 'bg-[var(--color-line)]'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8.5 L6.5 12 L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
