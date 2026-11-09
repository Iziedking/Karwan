'use client';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { routeTrack, type RouteLine, type RouteMark } from '../dealRouteModel';
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
  /// A short fact under the label, such as its date.
  sub?: string;
}

/// The route (view 48, Figma Route): the road travelled is a solid line, the
/// road ahead dashed, passed stops are dots, the current stop a ring. Flex rows
/// follow the page direction, so the route runs right to left in Arabic.
export function StepsTrack({ steps, vertical = false }: { steps: Array<TrackStep | LabelledStep>; vertical?: boolean }) {
  const t = useTranslations().dealPage;
  const track = routeTrack(steps);
  if (vertical) return <VerticalSteps steps={steps} track={track} />;
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
            {'sub' in step && step.sub ? (
              <span className="-mt-1.5 text-[13px] leading-[1.4] text-[var(--ink-muted)]">{step.sub}</span>
            ) : null}
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

/// The same route read top to bottom inside the deal card (owner, 9 Nov 2026,
/// Figma 233:1067): a filled tick for each step done, a ring for where the deal
/// is, an empty circle for what is ahead, and a line joining them.
function VerticalSteps({ steps, track }: { steps: Array<TrackStep | LabelledStep>; track: ReturnType<typeof routeTrack> }) {
  const t = useTranslations().dealPage;
  return (
    <ol aria-label={t.stepsLabel} className="flex flex-col" data-steps-track data-steps-vertical>
      {steps.map((step, i) => {
        const label = 'label' in step ? step.label : step.key === 'stage' ? fill(t.steps.stage, { n: step.stage ?? i + 1 }) : t.steps[step.key];
        const { mark } = track[i];
        const last = i === steps.length - 1;
        return (
          <li
            key={`${step.key}-${'stage' in step ? step.stage ?? i : i}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex gap-3"
          >
            <span aria-hidden className="flex w-[22px] shrink-0 flex-col items-center">
              {mark === 'passed' ? (
                <span data-route-mark="passed" className="grid size-[22px] place-items-center rounded-full bg-[var(--action)] text-[var(--on-action)]">
                  <Icon name="check" size={16} className="size-3.5" />
                </span>
              ) : mark === 'here' ? (
                <span data-route-mark="here" className="grid size-[22px] place-items-center rounded-full border-2 border-[var(--action)]">
                  <span className="size-2 rounded-full bg-[var(--action)]" />
                </span>
              ) : (
                <span data-route-mark="next" className="size-[22px] rounded-full border-2 border-[var(--line-strong)]" />
              )}
              {last ? null : <span className={cn('min-h-3 w-0.5 flex-1', mark === 'passed' ? 'bg-[var(--action)]' : 'bg-[var(--line-strong)]')} />}
            </span>
            <span className={cn('min-w-0 flex-1 pt-0.5', last ? '' : 'pb-4')}>
              <span
                className={cn(
                  'block text-[15px] leading-[1.35] [overflow-wrap:anywhere]',
                  mark === 'here' ? 'font-semibold text-[var(--ink)]' : mark === 'passed' ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-secondary)]',
                )}
              >
                {label}
              </span>
              {'sub' in step && step.sub ? <span className="mt-0.5 block text-[13px] text-[var(--ink-secondary)]">{step.sub}</span> : null}
              {'stageLine' in step && step.stageLine ? <span className="mt-0.5 block text-[13px] text-[var(--ink-secondary)]">{t.stageLine[step.stageLine]}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
