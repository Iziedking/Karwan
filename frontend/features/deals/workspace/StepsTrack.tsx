'use client';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { routeTrack, type RouteLine, type RouteMark } from '../dealRoute';
import type { StepKey } from './dealSteps';
import { fill } from './presentation';

export interface TrackStep {
  key: StepKey;
  state: 'done' | 'current' | 'upcoming';
  stage?: number;
  stageLine?: 'delivered' | 'paidOut';
}

/// A step that brings its own words, such as the steps of an open problem.
export interface LabelledStep {
  key: string;
  state: 'done' | 'current' | 'upcoming';
  label: string;
}

/// The route (view 48, Figma Route): the road travelled is a solid line, the
/// road ahead dashed, passed stops are dots, the current stop a ring. Flex rows
/// follow the page direction, so the route runs right to left in Arabic.
export function StepsTrack({ steps }: { steps: Array<TrackStep | LabelledStep> }) {
  const t = useTranslations().dealPage;
  const track = routeTrack(steps);
  return (
    <ol aria-label={t.stepsLabel} className="flex w-full items-start" data-steps-track>
      {steps.map((step, i) => {
        const label = 'label' in step ? step.label : step.key === 'stage' ? fill(t.steps.stage, { n: step.stage ?? i + 1 }) : t.steps[step.key];
        const { mark, lineBefore, lineAfter, align } = track[i];
        return (
          <li
            key={`${step.key}-${'stage' in step ? step.stage ?? i : i}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-2',
              align === 'start' && 'items-start text-start',
              align === 'center' && 'items-center text-center',
              align === 'end' && 'items-end text-end',
            )}
          >
            <span aria-hidden className="flex h-4 w-full items-center">
              {lineBefore ? <Line kind={lineBefore} /> : null}
              <Mark kind={mark} />
              {lineAfter ? <Line kind={lineAfter} /> : null}
            </span>
            <span
              className={cn(
                'max-w-full text-[13px] leading-[1.4] [overflow-wrap:anywhere]',
                step.state === 'current' || mark === 'here'
                  ? 'font-semibold text-[var(--ink)]'
                  : step.state === 'done' ? 'text-[var(--ink-secondary)]' : 'text-[var(--ink-muted)]',
              )}
            >
              {label}
            </span>
            {'stageLine' in step && step.stageLine ? (
              <span className="-mt-1 text-[13px] leading-[1.4] text-[var(--ink-secondary)]">{t.stageLine[step.stageLine]}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Line({ kind }: { kind: RouteLine }) {
  return (
    <span
      data-route-line={kind}
      className={cn(
        'h-0.5 min-w-0 flex-1',
        kind === 'travelled'
          ? 'bg-[var(--ink)]'
          : 'bg-[repeating-linear-gradient(90deg,var(--line-strong)_0_4px,transparent_4px_8px)]',
      )}
    />
  );
}

function Mark({ kind }: { kind: RouteMark }) {
  if (kind === 'here') {
    return (
      <span data-route-mark="here" className="grid size-4 shrink-0 place-items-center rounded-full border-2 border-[var(--ink)]">
        <span className="size-1.5 rounded-full bg-[var(--ink)]" />
      </span>
    );
  }
  return (
    <span
      data-route-mark={kind}
      className={cn(
        'size-2 shrink-0 rounded-full',
        kind === 'passed' ? 'bg-[var(--ink)]' : 'border-[1.5px] border-[var(--line-strong)]',
      )}
    />
  );
}
