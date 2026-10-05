'use client';
import type { DealView } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useChat } from '@/features/chat/hooks/useChat';
import { cn } from '@/shared/utils/cn';
import type { CheckStatus } from './checkStatus';
import { fill, formatDealDate } from './presentation';
import { latestLines, timelineRows } from './timeline';

/// The deal's steps, named and dated. The current step says whose move it is
/// and pulses while something is happening.
export function DealTimeline({ progress, viewerIsBuyer, name, check, dueAt }: {
  progress: DealView['progress'];
  viewerIsBuyer: boolean;
  name: string;
  check: CheckStatus | null;
  dueAt: number | null;
}) {
  const t = useTranslations();
  const steps = t.dealWorkspace.progress;
  const live = t.dealLive;
  const { locale } = useLocale();
  const rows = timelineRows(progress, { viewerIsBuyer, check, dueAt });
  return (
    <ol aria-label={steps.title} className="mt-6">
      {rows.map((row, index) => {
        const last = index === rows.length - 1;
        const title =
          row.kind === 'working' ? fill(live.working, { name })
            : row.kind === 'deliver' ? live.deliver
              : row.kind === 'checking' ? live.checking
                : steps[row.step];
        const detail =
          row.kind === 'checking' ? live.checkingDetail
            : row.dueAt != null ? fill(live.due, { date: formatDealDate(row.dueAt, locale) })
              : null;
        return (
          <li
            key={row.step}
            aria-current={row.state === 'current' ? 'step' : undefined}
            className="relative grid grid-cols-[22px_minmax(0,1fr)_auto] gap-x-3 pb-4 last:pb-0"
          >
            {!last ? (
              <span
                aria-hidden
                className={cn('absolute start-[10px] top-[24px] bottom-1 w-0.5 rounded-full', row.state === 'done' ? 'bg-[var(--lp-dark)]' : 'bg-[var(--lp-border-light)]')}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative grid size-[22px] place-items-center rounded-full',
                row.state === 'done' && 'bg-[var(--lp-dark)] text-[var(--lp-light)]',
                row.state === 'current' && 'border-2 border-[var(--lp-accent)] bg-[color-mix(in_srgb,var(--lp-accent)_18%,transparent)]',
                row.state === 'upcoming' && 'border-2 border-[var(--lp-border-light)]',
              )}
            >
              {row.state === 'done' ? <Icon name="check" size={16} className="size-3" /> : null}
              {row.state === 'current' ? (
                <span className="size-2 rounded-full bg-[var(--lp-accent)] motion-safe:animate-pulse" />
              ) : null}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[15px] leading-snug', row.state === 'upcoming' ? 'text-[var(--lp-text-sub)]' : 'font-medium text-[var(--lp-dark)]')}>
                {title}
              </span>
              {detail ? <span className="mt-0.5 block text-[13px] text-[var(--lp-text-sub)]">{detail}</span> : null}
            </span>
            <span className="pt-0.5 text-[12.5px] tabular-nums text-[var(--lp-text-sub)]">
              {row.at != null ? formatDealDate(row.at, locale) : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/// The last few things that happened on the deal, from the deal chat. Phones
/// only: on a wide screen the conversation already sits beside the deal.
export function DealLatest({ jobId, caller, name, onOpen }: {
  jobId: string;
  caller: string;
  name: string;
  onOpen: () => void;
}) {
  const t = useTranslations();
  const live = t.dealLive;
  const lines = t.chatPanel.timeline as Record<string, string>;
  const { locale } = useLocale();
  const { messages, fetchState } = useChat({ jobId, caller });
  const latest = latestLines(messages.filter((m) => (!m.channel || m.channel === 'trade') && !!m.body.trim()));
  if (fetchState !== 'ready' || latest.length === 0) return null;
  const me = caller.toLowerCase();
  return (
    <section aria-label={live.latest} className="pb-6">
      <h2 className="text-[15px] font-semibold text-[var(--lp-dark)]">{live.latest}</h2>
      <ul className="mt-1 divide-y divide-[var(--lp-border-light)]">
        {latest.map((m) => {
          const system = m.kind === 'system';
          const text = system
            ? (m.eventType && lines[m.eventType]) || m.body
            : `${m.sender.toLowerCase() === me ? live.you : name}: ${m.body}`;
          return (
            <li key={m.id} className="flex gap-3 py-3">
              <Icon name={system ? 'check' : 'messages'} size={16} className="mt-0.5 shrink-0 text-[var(--lp-text-sub)]" />
              <span className="min-w-0">
                <span dir="auto" className="line-clamp-2 text-[14px] leading-snug text-[var(--lp-dark)]">{text}</span>
                <span className="mt-0.5 block text-[12px] text-[var(--lp-text-sub)]">{formatDealDate(m.ts, locale)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onOpen} className="mt-1 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
        {live.openMessages}
      </button>
    </section>
  );
}
