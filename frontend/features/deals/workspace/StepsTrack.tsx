'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import type { StepKey } from './dealSteps';
import { fill } from './presentation';

export interface TrackStep {
  key: StepKey;
  state: 'done' | 'current' | 'upcoming';
  stage?: number;
  stageLine?: 'delivered' | 'paidOut';
}

/// The steps of a deal as a row of dots with the step's name under each
/// (rule 2): done filled, the current one ringed in the accent, later ones
/// hollow. Labels wrap; the row never scrolls sideways.
export function StepsTrack({ steps }: { steps: TrackStep[] }) {
  const t = useTranslations().dealPage;
  return (
    <ol aria-label={t.stepsLabel} className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} data-steps-track>
      {steps.map((step, i) => {
        const label = step.key === 'stage' ? fill(t.steps.stage, { n: step.stage ?? i + 1 }) : t.steps[step.key];
        return (
          <li key={`${step.key}-${step.stage ?? i}`} aria-current={step.state === 'current' ? 'step' : undefined} className="relative flex min-w-0 flex-col items-center px-1 text-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn('absolute top-[8px] h-0.5 w-full -start-1/2', step.state === 'upcoming' ? 'bg-[var(--lp-border-light)]' : 'bg-[var(--lp-dark)]')}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] size-[18px] rounded-full border-2',
                step.state === 'done' && 'border-[var(--lp-dark)] bg-[var(--lp-dark)]',
                step.state === 'current' && 'border-[var(--lp-accent)] bg-[var(--lp-card)] ring-4 ring-[color-mix(in_srgb,var(--lp-accent)_30%,transparent)]',
                step.state === 'upcoming' && 'border-[var(--lp-border-light)] bg-[var(--lp-card)]',
              )}
            />
            <span className={cn('mt-2 text-[13px] leading-tight', step.state === 'upcoming' ? 'text-[var(--lp-text-sub)]' : 'font-semibold text-[var(--lp-dark)]')}>
              {label}
            </span>
            {step.stageLine ? <span className="mt-0.5 text-[13px] leading-tight text-[var(--lp-text-sub)]">{t.stageLine[step.stageLine]}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
