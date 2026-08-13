'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
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
  const auth = useAuth();
  const address = auth.address ?? undefined;
  const isAuthed = auth.isAuthenticated;
  // Platform-wide stream: every deal moving across Karwan, not just the caller's.
  // Passing no caller returns the global feed. The page itself stays sign-in
  // gated below.
  const rawEvents = useLiveEvents(undefined, 200);
  // General feed = a privacy PULSE: it shows that activity is happening and of
  // what kind, never who, how much, or which deal. publicizeEvents drops every
  // party, amount, deal id, and free-form field (the live SSE stream carries raw
  // payloads, so the strip happens here, mirroring the backend's pulse). A user
  // still sees full detail of their OWN deals on the deal page; this network
  // feed is deliberately detail-free.
  const events = useMemo(() => publicizeEvents(rawEvents), [rawEvents]);

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
  const myRawEvents = useLiveEvents(undefined, 200, address);
  const myEvents = useMemo(() => myRawEvents.filter(isOwnEvent), [myRawEvents]);
  // All hooks must run unconditionally on every render. they're hoisted above
  // the not-signed-in early return so the hook order stays stable when the
  // user signs in.
  const [groups, setGroups] = useState<Set<EventGroup>>(new Set());
  const [actors, setActors] = useState<Set<ActorFilter>>(new Set());
  const [jobIdSearch, setJobIdSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  // Public rows carry no deal id and no amounts, so there is nothing to open.
  // The caller's own rows do, and become links. The difference is the backend's
  // decision, surfaced rather than made here.
  const source = onlyMine ? myEvents : events;
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
      <ActivityStats counts={counts} activeGroups={groups} onToggleGroup={toggleGroup} />

      <div className="pt-2 border-t border-[var(--lp-border-light)]" />

      {/* The money used to sit in a column beside the stream, which cost the
          stream half the width for a register most visits do not open. It is a
          tile now: one line saying whether there is anything to see, and a
          click to open it. The stream gets the whole page. */}
      <MoneyTile open={moneyOpen} onToggle={() => setMoneyOpen((v) => !v)} />

      <div className="min-w-0 space-y-4" data-guide="activity-stream">
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
              className={`mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-md border transition ${
                onlyMine === v
                  ? 'bg-[var(--lp-ink)] text-[var(--lp-paper)] border-[var(--lp-ink)] font-bold'
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

        <EventList events={pageEvents} explorer={explorer} variant="card" collapseRepeats />

        <Pager page={safePage} totalPages={totalPages} onPage={goToPage} />
      </div>
    </div>
  );
}

/// The money register, behind one click.
///
/// Collapsed it is a single row: the label, and an affordance. Expanded it is
/// the ledger. The point of the tile is that this is the only place on the page
/// with real amounts and receipts, so it should read as a deliberate act to
/// open rather than something that was already lying open next to a public
/// feed.
function MoneyTile({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useTranslations().activity.view;
  return (
    <div className="rounded-xl border border-[var(--lp-border-light)] overflow-hidden" data-guide="activity-money">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-[var(--lp-wash)] transition"
      >
        <span className="min-w-0">
          <span className="block mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{t.moneyTag}:]
          </span>
          <span className="mt-1 block text-[14px] font-bold text-[var(--lp-ink)]">
            {t.moneyTitle}
          </span>
        </span>
        <span className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {open ? t.moneyHide : t.moneyShow}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--lp-border-light)] p-4">
          <MyMoneyLedger />
        </div>
      )}
    </div>
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
        className="mono text-[11px] px-2.5 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--lp-light)]"
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
            className="mono text-[11px] tabular-nums px-3 py-1.5 border transition-colors"
            style={
              it === page
                ? { background: 'var(--lp-accent)', borderColor: 'var(--lp-accent)', color: 'var(--lp-dark)', ...radius }
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
        className="mono text-[11px] px-2.5 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--lp-light)]"
        style={{ borderColor: 'var(--lp-border-light)', color: 'var(--lp-text-sub)', ...radius }}
      >
        →
      </button>
    </nav>
  );
}
