import { useTranslations } from '@/shared/i18n/LocaleProvider';

export type StepKey =
  | 'posted'
  | 'bidding'
  | 'counter'
  | 'accepted'
  | 'escrow'
  | 'milestones'
  | 'settled';

const stepKeys: StepKey[] = [
  'posted',
  'bidding',
  'counter',
  'accepted',
  'escrow',
  'milestones',
  'settled',
];

const POSITIVE = '#0a7553';
const CRITICAL = '#b03d3a';
const NEUTRAL = '#6b6b6b';

export function FlowStepper({
  active,
  completed,
  ended = null,
}: {
  active: StepKey;
  completed: StepKey[];
  /// 'declined' = negotiation ended without agreement (red terminal label).
  /// 'expired' = request deadline lapsed with no match (neutral terminal label).
  /// 'out-of-reach' = no seller could meet the budget (neutral terminal label).
  /// null = live; the active step blinks. Replaces the old `declined` boolean.
  ended?: 'declined' | 'expired' | 'out-of-reach' | null;
}) {
  const fs = useTranslations().flowStepper;
  const steps: Array<{ key: StepKey; label: string }> = stepKeys.map((key) => ({
    key,
    label: fs.steps[key],
  }));
  const activeIndex = Math.max(
    steps.findIndex((s) => s.key === active),
    0,
  );
  const completedSet = new Set(completed);
  // Out-of-reach and expiry are neutral (no fault); only a real decline is red.
  const terminalColor = ended === 'declined' ? CRITICAL : NEUTRAL;
  const terminalLabel =
    ended === 'expired'
      ? fs.terminal.expired
      : ended === 'out-of-reach'
        ? fs.terminal.outOfReach
        : fs.terminal.ended;

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const done = completedSet.has(s.key) || i < activeIndex;
        const isActive = i === activeIndex;
        const isTerminal = ended != null && isActive;
        const isLast = i === steps.length - 1;

        const tileBg = isTerminal
          ? terminalColor
          : done
            ? POSITIVE
            : isActive
              ? 'rgba(175, 201, 91,0.12)'
              : 'var(--lp-card)';
        const tileBorder = isTerminal
          ? terminalColor
          : done
            ? POSITIVE
            : isActive
              ? 'var(--lp-accent)'
              : 'var(--lp-border-light)';
        const tileColor =
          done || isTerminal
            ? 'white'
            : isActive
              ? 'var(--lp-dark)'
              : 'var(--lp-text-muted)';
        const ledColor = isTerminal
          ? terminalColor
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
                className="absolute start-[13px] top-[26px] w-px"
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
                  isTerminal
                    ? 'font-bold'
                    : done || isActive
                      ? 'text-[var(--lp-dark)] font-bold'
                      : 'text-[var(--lp-text-muted)] font-semibold'
                }`}
                style={
                  isTerminal ? { color: terminalColor } : undefined
                }
              >
                {isTerminal ? terminalLabel : s.label}
              </span>
              <span
                aria-hidden
                data-instrument-blink={isActive && ended == null ? true : undefined}
                className="shrink-0 inline-block w-[6px] h-[6px]"
                style={{
                  background: ledColor,
                  animation:
                    isActive && ended == null
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
