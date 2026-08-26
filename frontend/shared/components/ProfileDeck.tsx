'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// A deck of panels stacked in Z, one visible at a time.
///
/// The profile used to be one long column with a tab strip that scrolled to
/// anchors. Tabs and scrolling fought each other: the strip implied a container
/// and there wasn't one, so users scrolled past the thing they had just clicked
/// to. This makes the container real.
///
/// Why a stack rather than a horizontal track: a stack is full width on a
/// phone. A side-by-side track has to give up 40-50px to the peeking next panel
/// to stay discoverable, which is a lot on a 375px screen. The cards behind do
/// the same job here without taking width from the one you are reading.
///
/// ONLY THE ACTIVE PANEL RENDERS ITS CONTENT. The cards behind are shells: a
/// label and an edge. That is not just a rendering shortcut, it is the point.
/// Mounting all four panels would run every hook on the page at once, which is
/// the waste that had /profile firing eighteen chain reads for a collapsed
/// card. You cannot read the card behind anyway; it is scaled and dimmed.

export interface DeckPanel {
  key: string;
  label: string;
  content: ReactNode;
  /// The agents section was a dark full-bleed band. Rather than flatten it to
  /// match the others, the card carries the tone, so the deck keeps the visual
  /// rhythm the scrolling page had.
  tone?: 'light' | 'dark';
}

/// Long enough to read as physical, short enough not to feel like waiting. The
/// card travels the full width of the deck now rather than fading 10px, so it
/// needs more time than a crossfade would.
const DURATION_MS = 460;
/// Matches the app's layout easing.
const EASE = 'cubic-bezier(0.83, 0, 0.17, 1)';
/// The outgoing card leads, so it uses an ease-out: quick off the mark, settling
/// as it clears the edge. Sharing the layout curve made it look pushed.
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

const SWIPE_THRESHOLD_PX = 56;
const HORIZONTAL_INTENT_RATIO = 1.35;

export type DeckSwipeDirection = 'next' | 'previous' | null;

/// Turn a touch gesture into one deliberate deck step. Vertical page movement
/// always wins, and a diagonal drag must be decisively horizontal before it can
/// change financial controls under the user's hand.
export function resolveDeckSwipe(deltaX: number, deltaY: number): DeckSwipeDirection {
  const x = Math.abs(deltaX);
  const y = Math.abs(deltaY);
  if (x < SWIPE_THRESHOLD_PX || x < y * HORIZONTAL_INTENT_RATIO) return null;
  return deltaX < 0 ? 'next' : 'previous';
}

export function ProfileDeck({
  panels,
  activeKey,
  onChange,
}: {
  panels: DeckPanel[];
  /// Controlled by the page's tab strip. The deck owns the motion, not the
  /// selection: the strip is already sticky, named and on screen, and a second
  /// selector for four panels would be one too many.
  activeKey: string;
  onChange: (key: string) => void;
}) {
  const activeFromKey = panels.findIndex((p) => p.key === activeKey);
  const active = activeFromKey === -1 ? 0 : activeFromKey;
  const prevActive = useRef(active);
  /// The panel on its way out. Kept mounted for one transition so it can
  /// recede with its content intact; unmounting immediately would make the
  /// card look like it emptied before it moved.
  const [leaving, setLeaving] = useState<{ index: number; back: boolean } | null>(null);
  const [entering, setEntering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  /// The direction the user actually asked for, when they asked through this
  /// component. Null when the change came from the tab strip or a hash, where
  /// there is no next/prev intent and comparing indices is the right inference.
  const intent = useRef<'next' | 'prev' | null>(null);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= panels.length || next === active) return;
      const target = next;
      // Recorded before the prop change because the animation direction is a
      // fact about the control or gesture that initiated the move.
      intent.current = next > active ? 'next' : 'prev';
      onChange(panels[target]!.key);
    },
    [active, panels, onChange],
  );

  // The animation is driven by the prop changing, so it runs whether the move
  // came from the deck's own controls, the tab strip above it, or a browser
  // back button restoring a hash.
  useEffect(() => {
    const from = prevActive.current;
    prevActive.current = active;
    if (from === active || reduced) return;

    // Intent wins when we have it; otherwise fall back to comparing indices,
    // which is correct for a tab-strip or hash jump.
    const back = intent.current ? intent.current === 'prev' : active < from;
    intent.current = null;
    setLeaving({ index: from, back });
    // Mount the incoming panel in its "entering" pose, then release it on the
    // next frame so the browser has a start state to animate FROM. Setting
    // both in one paint produces no transition at all.
    setEntering(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLeaving(null), DURATION_MS);
  }, [active, reduced]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /// How far back in the stack a panel sits, for the shells behind the front
  /// card. Only the next two are drawn: past that the offsets collapse into
  /// each other and add nothing but paint.
  const depthOf = (i: number) => i - active;

  const previousPanel = active > 0 ? panels[active - 1] : undefined;
  const nextPanel = active < panels.length - 1 ? panels[active + 1] : undefined;

  function gestureStartsOnControl(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(
      target.closest('button, a, input, textarea, select, [contenteditable="true"], [data-deck-swipe-lock]'),
    );
  }

  return (
    // Capped and centred rather than full width. At a desktop measure the card ran
    // to ~1800px, which turned every wallet row into a long band with its balance
    // floated to the far edge: the eye had to cross the whole viewport to connect
    // a wallet to its number. 1040px sits about square against the tallest panel.
    //
    // The number is a compromise and worth knowing why. Narrower reads calmer for
    // Wallets and Identity, but the Agents panel puts the money card and research
    // side by side, and Tailwind breakpoints are viewport-based rather than
    // container-based, so a 780px cap would still take two columns on a wide screen
    // and give each about 390px. 1040 keeps those near 500px and still roughly
    // halves the old width.
    <div
      className="w-full max-w-[1040px] mx-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--lp-accent)]"
      tabIndex={0}
      role="region"
      aria-label={`Profile section ${active + 1} of ${panels.length}: ${panels[active]!.label}`}
      onKeyDown={(event) => {
        if (gestureStartsOnControl(event.target)) return;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          go(active + 1);
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          go(active - 1);
        }
      }}
    >
      {/* Outer wrapper is positioned so the edge arrows can anchor to it. It is
          deliberately NOT clipped: the inner container clips the outgoing card so
          it cannot cause a horizontal scrollbar, and an arrow anchored inside that
          clip loses the half of itself that sits outside the card. That is what
          rendered it as a semicircle. */}
      <div className="relative">
      <div
        className="relative"
        // The outgoing card travels past the deck edge, which on a phone is the
        // viewport edge, and that would hand the page a horizontal scrollbar.
        // `clip` rather than `hidden`: hidden on one axis forces the other to
        // auto and would cut the front card's shadow into a scroll area.
        style={{ overflowX: 'clip', touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          if (gestureStartsOnControl(e.target)) {
            touchStart.current = null;
            return;
          }
          const touch = e.touches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (start == null) return;
          const touch = e.changedTouches[0];
          if (!touch) return;
          const direction = resolveDeckSwipe(touch.clientX - start.x, touch.clientY - start.y);
          if (direction === 'next') go(active + 1);
          if (direction === 'previous') go(active - 1);
        }}
      >
        {/* Cards behind. Visual only, and the affordance: their edge is what
            says there is more, and clicking one advances. That is why there is
            no "swipe" icon anywhere. */}
        {panels.map((p, i) => {
          const d = depthOf(i);
          if (d <= 0 || d > 2) return null;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => go(active + 1)}
              aria-label={`Next: ${p.label}`}
              className="absolute inset-x-0 top-0 w-full text-start"
              style={{
                transform: `translateY(${d * 10}px) scale(${1 - d * 0.03})`,
                opacity: 1 - d * 0.35,
                zIndex: 10 - d,
                transition: reduced ? 'none' : `transform ${DURATION_MS}ms ${EASE}, opacity ${DURATION_MS}ms ${EASE}`,
              }}
            >
              <div
                className="h-full min-h-[220px]"
                style={{
                  background: p.tone === 'dark' ? 'var(--lp-band-dark)' : 'var(--lp-card)',
                  border: `1px solid ${p.tone === 'dark' ? 'rgba(255,255,255,0.08)' : 'var(--lp-border-light)'}`,
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 22,
                  borderBottomLeftRadius: 22,
                  borderBottomRightRadius: 5,
                }}
              >
                <span className="block px-6 pt-6 mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  [:{p.label}:]
                </span>
              </div>
            </button>
          );
        })}

        {/* The outgoing card, receding. Absolute so it cannot push layout
            while the incoming card is already defining the height. */}
        {leaving ? (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 pointer-events-none"
            style={{
              // Off the side and tilting, the way a hand actually moves the top
              // card of a stack. It travels far enough to clear the deck edge, so
              // the eye follows it away rather than watching it dissolve in place.
              // Opacity trails the movement instead of leading it: fading first
              // would make it read as deleted rather than filed behind.
              transform: leaving.back
                ? 'translateX(-116%) translateY(-14px) rotate(-7deg) scale(0.94)'
                : 'translateX(116%) translateY(-14px) rotate(7deg) scale(0.94)',
              opacity: 0,
              zIndex: 40,
              transition: `transform ${DURATION_MS}ms ${EASE_OUT}, opacity ${Math.round(DURATION_MS * 0.7)}ms linear ${Math.round(DURATION_MS * 0.3)}ms`,
            }}
          >
            <DeckCard tone={panels[leaving.index]!.tone}>{panels[leaving.index]!.content}</DeckCard>
          </div>
        ) : null}

        {/* The active card. In normal flow, so IT defines the container height
            and the deck grows and shrinks with whatever is on show. */}
        <div
          className="relative"
          style={{
            zIndex: 30,
            // Starts exactly where its shell sat one step back in the stack, and
            // at that shell's opacity, so it reads as the same card promoted
            // rather than a new one appearing. Fading up from zero was what made
            // this feel like a slideshow.
            transform: entering ? 'translateY(10px) scale(0.97)' : 'none',
            opacity: entering ? 0.65 : 1,
            transition: reduced || entering ? 'none' : `transform ${DURATION_MS}ms ${EASE}, opacity ${DURATION_MS}ms ${EASE}`,
          }}
        >
          <DeckCard shadow tone={panels[active]!.tone}>{panels[active]!.content}</DeckCard>
        </div>

      </div>

      {/* Edge arrows, OUTSIDE the clip. The sequential controls used to live only
          in a small row under the card, which is below the fold on a long panel,
          so nothing at eye level said the deck had more than one page. These sit
          at the vertical middle where the eye already is. */}
      {previousPanel ? (
        <EdgeArrow
          side="start"
          onClick={() => go(active - 1)}
          label={`Previous: ${previousPanel.label}`}
        />
      ) : null}
      {nextPanel ? (
        <EdgeArrow
          side="end"
          onClick={() => go(active + 1)}
          label={`Next: ${nextPanel.label}`}
        />
      ) : null}
      </div>

      {/* Controls. Random access lives in the tab strip above; this row is the
          sequential half, plus a counter so the deck says how far through it
          you are without anyone having to count the tabs. */}
      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
            {String(active + 1).padStart(2, '0')}/{String(panels.length).padStart(2, '0')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {previousPanel ? (
            <DeckNav onClick={() => go(active - 1)} label={`Previous: ${previousPanel.label}`} back />
          ) : null}
          {nextPanel ? (
            <DeckNav
              onClick={() => go(active + 1)}
              label={`Next: ${nextPanel.label}`}
              showLabel={nextPanel.label}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/// A round arrow pinned to one edge of the deck, vertically centred.
///
/// 44px so it clears the minimum touch target, with a solid surface and a
/// hairline rather than a ghost button: at the edge of a dark card an outline-only
/// control disappears. The glyph is the same custom chevron as the row below, so
/// the deck has one arrow language.
function EdgeArrow({
  side,
  onClick,
  label,
}: {
  side: 'start' | 'end';
  onClick: () => void;
  label: string;
}) {
  const back = side === 'start';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'group absolute top-1/2 -translate-y-1/2 z-40 hidden sm:flex items-center justify-center',
        'border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-text-muted)]',
        'shadow-[0_8px_22px_-14px_rgba(10,10,11,0.35)] transition-[color,background,border-color,box-shadow] duration-200',
        'hover:border-black/25 hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] hover:shadow-[0_10px_24px_-14px_rgba(10,10,11,0.45)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]',
        // Clear of the card on wide screens, closer in when there is less room.
        back ? 'start-0 -ms-6 lg:-ms-9' : 'end-0 -me-6 lg:-me-9',
      )}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
      }}
    >
      <Chev back={back} big />
    </button>
  );
}

function DeckCard({
  children,
  shadow,
  tone = 'light',
}: {
  children: ReactNode;
  shadow?: boolean;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div
      className={cn('overflow-hidden', dark && 'text-white')}
      style={{
        background: dark ? 'var(--lp-band-dark)' : 'var(--lp-card)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'var(--lp-border-light)'}`,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
        // Only the front card carries a shadow. Shadowing the stack too would
        // flatten the depth it exists to create.
        boxShadow: shadow
          ? '0 1px 2px rgba(0,0,0,0.04), 0 24px 64px -24px rgba(0,0,0,0.18)'
          : 'none',
      }}
    >
      {children}
    </div>
  );
}

function DeckNav({
  onClick,
  label,
  back,
  showLabel,
}: {
  onClick: () => void;
  label: string;
  back?: boolean;
  showLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group inline-flex items-center gap-2 px-3 py-2 mono text-[10px] uppercase tracking-[0.14em] font-bold border border-[var(--lp-border-light)] text-[var(--lp-text-sub)] hover:text-[var(--lp-ink)] hover:border-[var(--lp-ink)] transition-colors"
      style={{
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 2,
      }}
    >
      {back ? <Chev back /> : null}
      {showLabel ? <span className="hidden sm:inline">{showLabel}</span> : null}
      {back ? null : <Chev />}
    </button>
  );
}

function Chev({ back, big }: { back?: boolean; big?: boolean }) {
  const size = big ? 16 : 10;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="square"
      className={cn(
        'transition-transform duration-200',
        back ? 'group-hover:-translate-x-[2px]' : 'group-hover:translate-x-[2px]',
        '[[dir=rtl]_&]:-scale-x-100',
      )}
    >
      <path d={back ? 'M6.5 1.5 3 5l3.5 3.5' : 'M3.5 1.5 7 5l-3.5 3.5'} />
    </svg>
  );
}
