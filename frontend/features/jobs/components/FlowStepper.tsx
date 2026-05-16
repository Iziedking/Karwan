export type StepKey =
  | 'posted'
  | 'bidding'
  | 'counter'
  | 'accepted'
  | 'escrow'
  | 'milestones'
  | 'settled';

const steps: Array<{ key: StepKey; label: string }> = [
  { key: 'posted', label: 'POSTED' },
  { key: 'bidding', label: 'BIDDING' },
  { key: 'counter', label: 'NEGOTIATING' },
  { key: 'accepted', label: 'ACCEPTED' },
  { key: 'escrow', label: 'ESCROW' },
  { key: 'milestones', label: 'MILESTONES' },
  { key: 'settled', label: 'SETTLED' },
];

const POSITIVE = '#0a7553';
const CRITICAL = '#b03d3a';

export function FlowStepper({
  active,
  completed,
  declined = false,
}: {
  active: StepKey;
  completed: StepKey[];
  declined?: boolean;
}) {
  const activeIndex = Math.max(
    steps.findIndex((s) => s.key === active),
    0,
  );
  const completedSet = new Set(completed);

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const done = completedSet.has(s.key) || i < activeIndex;
        const isActive = i === activeIndex;
        const isTerminalDeclined = declined && isActive;
        const isLast = i === steps.length - 1;

        const tileBg = isTerminalDeclined
          ? CRITICAL
          : done
            ? POSITIVE
            : isActive
              ? 'rgba(189, 225, 34,0.12)'
              : 'var(--lp-card)';
        const tileBorder = isTerminalDeclined
          ? CRITICAL
          : done
            ? POSITIVE
            : isActive
              ? 'var(--lp-accent)'
              : 'var(--lp-border-light)';
        const tileColor =
          done || isTerminalDeclined
            ? 'white'
            : isActive
              ? 'var(--lp-dark)'
              : 'var(--lp-text-muted)';
        const ledColor = isTerminalDeclined
          ? CRITICAL
          : done
            ? POSITIVE
            : isActive
              ? 'var(--lp-accent)'
              : 'rgba(0,0,0,0.10)';

        return (
          <li key={s.key} className="relative flex items-start gap-3 pb-3 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[13px] top-[26px] w-px"
                style={{
                  bottom: 0,
                  background: done ? POSITIVE : 'var(--lp-border-light)',
                }}
              />
            )}
            <span
              className="relative shrink-0 inline-flex items-center justify-center w-[26px] h-[26px] mono text-[10px] font-bold tabular-nums"
              style={{
                background: tileBg,
                color: tileColor,
                border: `1px solid ${tileBorder}`,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0 pt-1 flex items-center justify-between gap-3 flex-wrap">
              <span
                className={`mono text-[11px] uppercase tracking-[0.14em] ${
                  isTerminalDeclined
                    ? 'font-bold'
                    : done || isActive
                      ? 'text-[var(--lp-dark)] font-bold'
                      : 'text-[var(--lp-text-muted)] font-semibold'
                }`}
                style={
                  isTerminalDeclined ? { color: CRITICAL } : undefined
                }
              >
                {isTerminalDeclined ? 'ENDED HERE' : s.label}
              </span>
              <span
                aria-hidden
                data-instrument-blink={isActive && !declined ? true : undefined}
                className="shrink-0 inline-block w-[6px] h-[6px]"
                style={{
                  background: ledColor,
                  animation:
                    isActive && !declined
                      ? 'instrumentBlink 1.6s ease-in-out infinite'
                      : undefined,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
