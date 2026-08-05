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
  const touchX = useRef<number | null>(null);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback(
    (next: number) => {
      const target = (next + panels.length) % panels.length;
      if (target === active) return;
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

    setLeaving({ index: from, back: active < from });
    // Mount the incoming panel in its "entering" pose, then release it on the
    // next frame so the browser has a start state to animate FROM. Setting
    // both in one paint produces no transition at all.
    setEntering(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLeaving(null), DURATION_MS);
  }, [active, reduced]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal arrows from a field the user is typing in.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      if (e.key === 'ArrowRight') go(active + 1);
      if (e.key === 'ArrowLeft') go(active - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, go]);

  /// How far back in the stack a panel sits, for the shells behind the front
  /// card. Only the next two are drawn: past that the offsets collapse into
  /// each other and add nothing but paint.
  const depthOf = (i: number) => (i - active + panels.length) % panels.length;

  return (
    <div className="w-full">
      <div
        className="relative"
        // The outgoing card travels past the deck edge, which on a phone is the
        // viewport edge, and that would hand the page a horizontal scrollbar.
        // `clip` rather than `hidden`: hidden on one axis forces the other to
        // auto and would cut the front card's shadow into a scroll area.
        style={{ overflowX: 'clip' }}
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          if (start == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? start) - start;
          // 48px so a vertical scroll that drifts sideways does not page.
          if (Math.abs(dx) < 48) return;
          go(dx < 0 ? active + 1 : active - 1);
        }}
      >
        {/* Cards behind. Visual only, and the affordance: their edge is what
            says there is more, and clicking one advances. That is why there is
            no "swipe" icon anywhere. */}
        {panels.map((p, i) => {
          const d = depthOf(i);
          if (d === 0 || d > 2) return null;
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

        {/* Edge arrows. The sequential controls used to live only in a small row
            under the card, which is below the fold on a long panel: the deck read
            as one page because nothing at eye level said otherwise. These sit at
            the vertical middle of the card where the eye already is.

            Outside the card on wide screens, tucked just inside on narrow ones,
            because there is no gutter to sit in on a phone. zIndex above the
            front card, and the clipping container is overflow-x clip rather than
            hidden, so an arrow at a negative offset is not cut off. */}
        <EdgeArrow
          side="start"
          onClick={() => go(active - 1)}
          label={`Previous: ${panels[(active - 1 + panels.length) % panels.length]!.label}`}
        />
        <EdgeArrow
          side="end"
          onClick={() => go(active + 1)}
          label={`Next: ${panels[(active + 1) % panels.length]!.label}`}
        />
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
          <DeckNav onClick={() => go(active - 1)} label="Previous" back />
          <DeckNav
            onClick={() => go(active + 1)}
            label={`Next: ${panels[(active + 1) % panels.length]!.label}`}
            showLabel={panels[(active + 1) % panels.length]!.label}
          />
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
        'transition-colors',
        // Outside the card where there is room, just inside it when there is not.
        back ? 'start-0 -ms-5 lg:-ms-7' : 'end-0 -me-5 lg:-me-7',
      )}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        color: 'var(--lp-dark)',
        boxShadow: '0 2px 10px -4px rgba(0,0,0,0.25)',
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
