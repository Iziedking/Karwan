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
  declined = false,
}: {
  active: StepKey;
  completed: StepKey[];
  declined?: boolean;
}) {
  const activeIndex = Math.max(steps.findIndex((s) => s.key === active), 0);
  const completedSet = new Set(completed);
  const total = steps.length;
  // When the negotiation ended without agreement, the progress bar should stop
  // at the last completed step (i.e. just before the terminal active step) and
  // the terminal step gets a critical-tone marker instead of the pulsing dot.
  const progressIndex = declined ? Math.max(activeIndex - 1, 0) : activeIndex;
  const progress = progressIndex / (total - 1);

  return (
    <div className="relative">
      {/* track */}
      <div
        aria-hidden
        className="absolute left-3.5 right-3.5 top-3.5 h-px bg-[var(--color-line)]"
      />
      {/* progress */}
      <div
        aria-hidden
        className="absolute left-3.5 top-3.5 h-px"
        style={{
          width: `calc((100% - 28px) * ${progress})`,
          background: 'var(--color-positive)',
          transition: 'width 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
        }}
      />

      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const done = completedSet.has(s.key) || i < activeIndex;
          const isActive = i === activeIndex;
          const isTerminalDeclined = declined && isActive;
          return (
            <li key={s.key} className="flex flex-col items-center gap-2">
              <span
                className={`relative w-7 h-7 rounded-full grid place-items-center text-[11px] mono border transition-colors duration-300 ${
                  done
                    ? 'bg-[var(--color-positive)] text-[#ffffff] border-[var(--color-positive)]'
                    : isTerminalDeclined
                    ? 'bg-[var(--color-critical)] text-[#ffffff] border-[var(--color-critical)]'
                    : isActive
                    ? 'bg-[var(--color-accent)] text-[#ffffff] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-ink-faint)] border-[var(--color-line)]'
                }`}
              >
                {isActive && !declined && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'var(--color-accent)',
                      opacity: 0.4,
                      animation: 'flowPulse 1.8s ease-out infinite',
                    }}
                  />
                )}
                <span className="relative z-10">
                  {done ? <Check /> : isTerminalDeclined ? <Cross /> : i + 1}
                </span>
              </span>
              <span
                className={`text-[11px] tracking-tight whitespace-nowrap text-center px-1 transition-colors duration-300 ${
                  isTerminalDeclined
                    ? 'text-[var(--color-critical)] font-semibold'
                    : isActive
                    ? 'text-[var(--color-ink)] font-semibold'
                    : done
                    ? 'text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-faint)]'
                }`}
              >
                {isTerminalDeclined ? 'Ended here' : s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
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

function Cross() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
