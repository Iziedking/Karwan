'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLiveEventsState } from '@/shared/hooks/useLiveEvents';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { EventList } from '@/features/jobs/components/EventList';
import { ActivityStats } from './ActivityStats';
import { ActivityFilters } from './ActivityFilters';
import {
  applyFilters,
  countByGroup,
  type ActorFilter,
  type ActivityFilters as Filters,
  type EventGroup,
} from '../types';
import { isOwnEvent } from '../types';
import { publicizeEvents } from '../publicFeed';
import { MyMoneyLedger } from './MyMoneyLedger';

const PAGE_SIZE = 20;

export function ActivityView({ explorer }: { explorer: string }) {
  const t = useTranslations().activity.view;
  const messages = useTranslations();
  const auth = useAuth();
  const address = auth.address ?? undefined;
  const isAuthed = auth.isAuthenticated;
  // Platform-wide stream: every deal moving across Karwan, not just the caller's.
  // Passing no caller returns the global feed. The page itself stays sign-in
  // gated below.
  const [retryKey, setRetryKey] = useState(0);
  const publicFeed = useLiveEventsState(undefined, 200, undefined, retryKey);
  // General feed = a privacy PULSE: it shows that activity is happening and of
  // what kind, never who, how much, or which deal. publicizeEvents drops every
  // party, amount, deal id, and free-form field (the live SSE stream carries raw
  // payloads, so the strip happens here, mirroring the backend's pulse). A user
  // still sees full detail of their OWN deals on the deal page; this network
  // feed is deliberately detail-free.
  const events = useMemo(() => publicizeEvents(publicFeed.events), [publicFeed.events]);

  // The caller's own events, as a SEPARATE subscription.
  //
  // The stream above passes no caller, so the backend pulses every row: that is
  // the public feed and it stays fully stripped. Passing the address asks the
  // backend to project for this caller, which returns full detail only for
  // events it can prove they own. Filtering on `isOwnEvent` then keeps what
  // survived that check.
  //
  // Two subscriptions rather than relaxing the strip on one. The public feed
  // never gains a code path that could leak, and the browser is never the thing
  // deciding what somebody may see.
  // `caller` is the THIRD argument. Passing the address positionally sent it as
  // `filterJobId`, so the backfill asked for events whose jobId equalled a
  // wallet address (never any) and the live branch dropped everything whose
  // jobId did not equal one. ME had returned zero events since it shipped.
  const myFeed = useLiveEventsState(undefined, 200, address, retryKey);
  const myEvents = useMemo(() => myFeed.events.filter(isOwnEvent), [myFeed.events]);
  // All hooks must run unconditionally on every render. they're hoisted above
  // the not-signed-in early return so the hook order stays stable when the
  // user signs in.
  const [groups, setGroups] = useState<Set<EventGroup>>(new Set());
  const [actors, setActors] = useState<Set<ActorFilter>>(new Set());
  const [jobIdSearch, setJobIdSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  // The private money register is the reason people open Activity. Keep it as
  // the default view, with the public event pulse one deliberate click away.
  const [activePanel, setActivePanel] = useState<'money' | 'events'>('money');
  // Public rows carry no deal id and no amounts, so there is nothing to open.
  // The caller's own rows do, and become links. The difference is the backend's
  // decision, surfaced rather than made here.
  const source = onlyMine ? myEvents : events;
  const sourceStatus = onlyMine ? myFeed.status : publicFeed.status;
  const filters: Filters = useMemo(
    () => ({ groups, actors, jobIdSearch }),
    [groups, actors, jobIdSearch],
  );
  const filtered = useMemo(() => applyFilters(source, filters), [source, filters]);
  const counts = useMemo(() => countByGroup(events), [events]);

  // Paginate so the stream doesn't grow into an endless scroll as new events
  // land. Newest first, so page 1 is always the latest activity.
  const [page, setPage] = useState(1);
  const streamTopRef = useRef<HTMLDivElement>(null);
  // Filtering changes the result set, so jump back to the first page.
  useEffect(() => {
    setPage(1);
  }, [groups, actors, jobIdSearch, onlyMine]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEvents = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const streamLoading = sourceStatus === 'loading' && source.length === 0;
  const streamError = sourceStatus === 'error' && source.length === 0;

  function goToPage(p: number) {
    setPage(p);
    // Bring the top of the stream into view so a new page starts at its head,
    // not wherever the previous page left the scroll position.
    streamTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Sign-in gate. The feed is platform-wide, but kept behind sign-in so the
  // full network log isn't exposed to anonymous crawlers.
  if (!isAuthed || !address) {
    return (
      <div className="py-12 text-center space-y-2.5 max-w-[48ch] mx-auto">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {t.notSignedInEyebrow}
        </p>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.notSignedInBody}
        </p>
      </div>
    );
  }

  const hasAnyFilter = groups.size > 0 || actors.size > 0 || jobIdSearch.trim().length > 0;

  function toggleGroup(g: EventGroup) {
    setGroups((cur) => {
      const next = new Set(cur);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }
  function toggleActor(a: ActorFilter) {
    setActors((cur) => {
      const next = new Set(cur);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }
  function clearAll() {
    setGroups(new Set());
    setActors(new Set());
    setJobIdSearch('');
  }

  return (
    <div className="space-y-6">
      {/* Three registers, in the order someone opening this page wants them:
          the network's headline counters, then the user's own money with real
          amounts and receipts, then the network pulse. The pulse has every
          amount and party stripped, so it can never answer "what did I do";
          the ledger above it is what answers that. */}
      <ActivityStats
        counts={counts}
        activeGroups={groups}
        onToggleGroup={toggleGroup}
        windowSize={events.length}
      />

      <div className="pt-2 border-t border-[var(--lp-border-light)]" />

      <section className="overflow-hidden rounded-xl border border-[var(--lp-border-light)]" data-guide="activity-register">
        <div role="tablist" aria-label={t.moneyTitle} className="flex flex-wrap items-stretch gap-1 border-b border-[var(--lp-border-light)] bg-[var(--lp-wash)] p-2">
          <ActivityPanelTab
            active={activePanel === 'money'}
            label={t.moneyTitle}
            tag=""
            onClick={() => setActivePanel('money')}
            controls="activity-money-panel"
          />
          <ActivityPanelTab
            active={activePanel === 'events'}
            label={t.streamEyebrow}
            tag=""
            onClick={() => setActivePanel('events')}
            controls="activity-events-panel"
          />
        </div>

        {activePanel === 'money' ? (
          <div id="activity-money-panel" className="p-4 sm:p-5" data-guide="activity-money">
            <MyMoneyLedger nested />
          </div>
        ) : (
          <div id="activity-events-panel" className="min-w-0 space-y-4 p-4 sm:p-5" data-guide="activity-stream">
        <div ref={streamTopRef} className="flex items-baseline justify-between gap-3 scroll-mt-24">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{t.streamEyebrow}:]
          </span>
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {filtered.length === 0
              ? t.countZero
              : t.countRange
                  .replace('{start}', String(pageStart + 1))
                  .replace('{end}', String(pageStart + pageEvents.length))
                  .replace('{total}', String(filtered.length))}
            {/* Counted against `source`, not the public feed: with "only mine"
                on those are different lists, and comparing across them reported
                a hidden count that belonged to nothing on screen. */}
            {hasAnyFilter && source.length > filtered.length && (
              <span>
                {' · '}
                {t.countHidden.replace('{n}', String(source.length - filtered.length))}
              </span>
            )}
          </p>
        </div>

        {/* Two words, no explanation. The behaviour explains itself: your own
            rows open, the network's do not. Describing the privacy mechanism in
            the UI told users about the backend instead of showing them their
            money. Public rows are stripped of parties, amounts and deal ids by
            `projectFor`, which is why they have nothing to link to. */}
        <div className="flex items-center gap-2">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setOnlyMine(v)}
              aria-pressed={onlyMine === v}
              className={`inline-flex min-h-11 items-center mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] ${
                onlyMine === v
                  ? 'bg-[var(--lp-band-dark)] text-[var(--lp-accent)] border-[var(--lp-band-dark)] font-bold'
                  : 'border-[var(--lp-border-light)] text-[var(--lp-text-muted)] hover:text-[var(--lp-ink)]'
              }`}
            >
              {v ? t.onlyMine : t.everyone}
            </button>
          ))}
        </div>

        {/* Directly above the list they filter. Sitting under the money ledger
            they read as filters on the user's own money, which they are not. */}
        <ActivityFilters
          activeActors={actors}
          onToggleActor={toggleActor}
          jobIdSearch={jobIdSearch}
          onJobIdSearch={setJobIdSearch}
          onClear={clearAll}
          hasAnyFilter={hasAnyFilter}
          showSearch={false}
        />

        {streamLoading ? (
          <StreamSkeleton label={messages.common.loading} />
        ) : streamError ? (
          <StreamError
            body={messages.activity.allTime.errorBody}
            retryLabel={messages.directDealDetail.settlementRecord.retry}
            onRetry={() => setRetryKey((value) => value + 1)}
          />
        ) : (
          <>
            {sourceStatus === 'error' && source.length > 0 && (
              <StreamRefreshNotice
                body={messages.activity.allTime.errorBody}
                retryLabel={messages.directDealDetail.settlementRecord.retry}
                onRetry={() => setRetryKey((value) => value + 1)}
              />
            )}
            <EventList events={pageEvents} explorer={explorer} variant="card" collapseRepeats />
          </>
        )}

        <Pager page={safePage} totalPages={totalPages} onPage={goToPage} />
          </div>
        )}
      </section>
    </div>
  );
}

function StreamSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2" data-testid="activity-stream-loading">
      {[80, 64, 72].map((width, index) => (
        <div
          key={index}
          aria-hidden
          className="h-16 rounded-xl border border-[var(--lp-border-light)] bg-[var(--lp-light)] motion-safe:animate-pulse"
          style={{ opacity: 0.82 - index * 0.12 }}
        >
          <div className="h-full flex items-center px-5">
            <span className="h-2 rounded-full bg-[var(--lp-border-light)]" style={{ width: `${width}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StreamError({ body, retryLabel, onRetry }: { body: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-[var(--lp-border-light)] p-5 text-center space-y-3">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">[:UNAVAILABLE:]</p>
      <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[42ch] mx-auto">{body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center justify-center px-4 rounded-md border border-[var(--lp-border-light)] mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function StreamRefreshNotice({ body, retryLabel, onRetry }: { body: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-3 py-2">
      <p className="text-[12px] leading-snug text-[var(--lp-text-sub)]">{body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center px-3 mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function ActivityPanelTab({
  active,
  label,
  tag,
  onClick,
  controls,
}: {
  active: boolean;
  label: string;
  tag: string;
  onClick: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      aria-controls={controls}
      role="tab"
      className={`min-h-11 flex-1 px-3 py-2 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)] sm:flex-none sm:min-w-[190px] ${
        active
          ? 'bg-[var(--lp-band-dark)] text-white'
          : 'text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-ink)]'
      }`}
    >
      {tag && (
        <span className="block mono text-[8px] uppercase tracking-[0.12em] leading-tight opacity-70 sm:text-[10px] sm:tracking-[0.18em]">
          [:{tag}:]
        </span>
      )}
      <span className={`block whitespace-nowrap text-[10px] leading-tight font-bold uppercase tracking-normal sm:text-[13px] sm:tracking-[0.02em] ${tag ? 'mt-0.5 sm:mt-1' : ''}`}>
        {label}
      </span>
    </button>
  );
}

/// Numbered pager for the event stream. Windowed so a long history collapses to
/// "1 … 4 5 6 … 12" instead of a wall of numbers. Renders nothing for a single
/// page. Matches the page's mono + lime grammar.
function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const t = useTranslations().activity.view;
  if (totalPages <= 1) return null;

  const items: Array<number | 'gap'> = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
      items.push(p);
    } else if (items[items.length - 1] !== 'gap') {
      items.push('gap');
    }
  }

  const radius = {
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 2,
  } as const;

  return (
    <nav
      aria-label={t.pagerAria}
      className="flex flex-wrap items-center justify-center gap-1.5 pt-4"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label={t.prevAria}
        className="inline-flex min-h-11 min-w-11 items-center justify-center mono text-[11px] px-2.5 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        style={{ borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }}
      >
        ←
      </button>

      {items.map((it, i) =>
        it === 'gap' ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="mono text-[11px] px-1 text-[var(--lp-text-muted)]"
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onPage(it)}
            aria-current={it === page ? 'page' : undefined}
            className="inline-flex min-h-11 min-w-11 items-center justify-center mono text-[11px] tabular-nums px-3 py-1.5 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            style={
              it === page
                ? { background: 'var(--lp-accent)', borderColor: 'var(--lp-accent)', color: 'var(--accent-ink)', ...radius }
                : { borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }
            }
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label={t.nextAria}
        className="inline-flex min-h-11 min-w-11 items-center justify-center mono text-[11px] px-2.5 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        style={{ borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }}
      >
        →
      </button>
    </nav>
  );
}
