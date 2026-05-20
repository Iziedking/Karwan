'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/// In-app guided tours for newcomers. Each page can declare a short tour that
/// spotlights its tools one at a time with a plain-language line. Tours open
/// once on first visit and are remembered per-tour; a single "skip all tips"
/// turns them off everywhere for people who already know their way around.
/// Built to the Karwan UI law: lime accent, bracket-tag metadata, asymmetric
/// corners, motion with reduced-motion fallback.

export interface TourStep {
  /// `data-guide` value of the element to spotlight. Omit for a centered card
  /// (intro / outro steps that frame the page rather than point at one tool).
  target?: string;
  title: string;
  body: string;
}

interface ActiveTour {
  id: string;
  steps: TourStep[];
  index: number;
}

interface GuideContextValue {
  disabled: boolean;
  dismissAll: () => void;
  enableTips: () => void;
  isSeen: (id: string) => boolean;
  hasActive: boolean;
  startTour: (id: string, steps: TourStep[], opts?: { force?: boolean }) => void;
  next: () => void;
  prev: () => void;
  close: (markSeen?: boolean) => void;
  active: ActiveTour | null;
  /// Quality-weighted experience. Using DIFFERENT tools advances it; repeating
  /// the same action plateaus. Tips fade as it climbs and stop past
  /// GUIDE_MASTERY_XP. Record real actions via `recordAction(type)`.
  experience: number;
  recordAction: (type: string) => void;
  mastered: boolean;
}

/// Transactions after which a user is treated as having "mastered" the app:
/// auto-tips stop (the replay pill stays for on-demand). Picked in the 10-20
/// band the product owner asked for.
export const GUIDE_MASTERY_XP = 15;

/// Decides whether a page tour should auto-open on mount. New users see unseen
/// tours every time and seen ones at random; the re-show chance decays with
/// experience and hits zero at mastery. After mastery nothing auto-opens.
export function shouldAutoOpenTour(args: {
  disabled: boolean;
  experience: number;
  seen: boolean;
}): boolean {
  if (args.disabled) return false;
  if (args.experience >= GUIDE_MASTERY_XP) return false;
  if (!args.seen) return true;
  const reshowChance = (1 - args.experience / GUIDE_MASTERY_XP) * 0.5;
  return Math.random() < reshowChance;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error('useGuide must be used within GuideProvider');
  return ctx;
}

const DISABLED_KEY = 'karwan:guide:disabled';
const SEEN_KEY = 'karwan:guide:seen';

function loadSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function loadDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

const ACTIONS_KEY = 'karwan:guide:actions';
const SKIPS_KEY = 'karwan:guide:skips';

/// Skip a tour (bail out before finishing) this many times in a row and we
/// take the hint: tours stop auto-opening for this account.
const MAX_CONSECUTIVE_SKIPS = 5;

function loadActions(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ACTIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function loadSkips(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(localStorage.getItem(SKIPS_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

/// Experience is quality-weighted, not a raw transaction count: spamming the
/// same action plateaus fast, while using DIFFERENT tools keeps advancing it.
/// Each distinct action type is worth PER_DISTINCT; repeats add a little, hard
/// capped, so a user can't grind one button to mute the tips early.
function computeExperience(actions: Record<string, number>): number {
  const PER_DISTINCT = 3;
  const PER_REPEAT = 0.5;
  const REPEAT_CAP = 10; // repeats beyond this add nothing
  let distinct = 0;
  let repeats = 0;
  for (const count of Object.values(actions)) {
    if (count <= 0) continue;
    distinct += 1;
    repeats += count - 1;
  }
  return distinct * PER_DISTINCT + Math.min(repeats, REPEAT_CAP) * PER_REPEAT;
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const [disabled, setDisabled] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<ActiveTour | null>(null);
  const [actions, setActions] = useState<Record<string, number>>({});
  // Consecutive bail-outs. A ref because no UI depends on the live value; it is
  // persisted so the "5 skips and stop" rule survives reloads.
  const skipsRef = useRef(0);

  // Hydrate persisted state on the client (avoids SSR localStorage access).
  useEffect(() => {
    setDisabled(loadDisabled());
    setSeen(loadSeen());
    setActions(loadActions());
    skipsRef.current = loadSkips();
  }, []);

  const recordAction = useCallback((type: string) => {
    setActions((prev) => {
      const nextMap = { ...prev, [type]: (prev[type] ?? 0) + 1 };
      try {
        localStorage.setItem(ACTIONS_KEY, JSON.stringify(nextMap));
      } catch {
        /* ignore */
      }
      return nextMap;
    });
  }, []);

  const experience = useMemo(() => computeExperience(actions), [actions]);

  const persistSeen = useCallback((s: Set<string>) => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
    } catch {
      /* quota / unavailable; in-memory still works for the session */
    }
  }, []);

  const markSeen = useCallback(
    (id: string) => {
      setSeen((prev) => {
        if (prev.has(id)) return prev;
        const nextSet = new Set(prev);
        nextSet.add(id);
        persistSeen(nextSet);
        return nextSet;
      });
    },
    [persistSeen],
  );

  const isSeen = useCallback((id: string) => seen.has(id), [seen]);

  const close = useCallback(
    (doMarkSeen = true) => {
      setActive((cur) => {
        if (cur) {
          if (doMarkSeen) markSeen(cur.id);
          // Closing a tour before finishing it counts as a skip. Five in a row
          // and we stop auto-opening tours for this account.
          skipsRef.current += 1;
          try {
            localStorage.setItem(SKIPS_KEY, String(skipsRef.current));
          } catch {
            /* ignore */
          }
          if (skipsRef.current >= MAX_CONSECUTIVE_SKIPS) {
            try {
              localStorage.setItem(DISABLED_KEY, '1');
            } catch {
              /* ignore */
            }
            setDisabled(true);
          }
        }
        return null;
      });
    },
    [markSeen],
  );

  const startTour = useCallback(
    (id: string, steps: TourStep[], opts?: { force?: boolean }) => {
      if (steps.length === 0) return;
      if (!opts?.force && (disabled || seen.has(id))) return;
      setActive({ id, steps, index: 0 });
    },
    [disabled, seen],
  );

  const next = useCallback(() => {
    setActive((cur) => {
      if (!cur) return cur;
      if (cur.index >= cur.steps.length - 1) {
        markSeen(cur.id);
        // Finishing a tour is engagement: reset the consecutive-skip counter so
        // a later bail-out starts the "5 in a row" count fresh.
        skipsRef.current = 0;
        try {
          localStorage.setItem(SKIPS_KEY, '0');
        } catch {
          /* ignore */
        }
        return null;
      }
      return { ...cur, index: cur.index + 1 };
    });
  }, [markSeen]);

  const prev = useCallback(() => {
    setActive((cur) => (cur && cur.index > 0 ? { ...cur, index: cur.index - 1 } : cur));
  }, []);

  const dismissAll = useCallback(() => {
    try {
      localStorage.setItem(DISABLED_KEY, '1');
    } catch {
      /* ignore */
    }
    setDisabled(true);
    setActive(null);
  }, []);

  const enableTips = useCallback(() => {
    // Re-enabling gives a clean slate so the skip counter doesn't immediately
    // re-trip the "5 in a row" rule.
    try {
      localStorage.removeItem(DISABLED_KEY);
      localStorage.setItem(SKIPS_KEY, '0');
    } catch {
      /* ignore */
    }
    skipsRef.current = 0;
    setDisabled(false);
  }, []);

  const value = useMemo<GuideContextValue>(
    () => ({
      disabled,
      dismissAll,
      enableTips,
      isSeen,
      hasActive: active != null,
      startTour,
      next,
      prev,
      close,
      active,
      experience,
      recordAction,
      mastered: experience >= GUIDE_MASTERY_XP,
    }),
    [disabled, dismissAll, enableTips, isSeen, active, startTour, next, prev, close, experience, recordAction],
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideOverlay />
    </GuideContext.Provider>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function GuideOverlay() {
  const { active, next, prev, close, dismissAll } = useGuide();
  const step = active ? active.steps[active.index] : undefined;
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Track the spotlight target's position. Scroll it into view on step change,
  // then keep the highlight glued to it through scroll / resize.
  useEffect(() => {
    if (!active || !step?.target) {
      setRect(null);
      return;
    }
    const reduced = prefersReducedMotion();
    const find = () =>
      document.querySelector(`[data-guide="${step.target}"]`) as HTMLElement | null;
    const update = () => {
      const el = find();
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const el = find();
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    update();
    const settle = window.setTimeout(update, reduced ? 0 : 340);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [active, step?.target]);

  // Keyboard: Esc closes, arrows step.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, prev, close]);

  if (!active || !step || typeof document === 'undefined') return null;

  const total = active.steps.length;
  const isLast = active.index === total - 1;
  const isFirst = active.index === 0;
  const reduced = prefersReducedMotion();

  return createPortal(
    <div aria-live="polite" role="dialog" aria-modal="true">
      {/* Click blocker so the page underneath isn't interactive mid-tour. */}
      <div
        onClick={() => close(true)}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, cursor: 'default' }}
      />

      {/* Spotlight: a hole punched in the dim via a big box-shadow when a target
          exists, otherwise a flat dim for centered intro/outro steps. */}
      {rect ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(10,10,11,0.66)',
            border: '2px solid var(--lp-accent)',
            pointerEvents: 'none',
            zIndex: 1001,
            transition: reduced ? 'none' : 'all 240ms cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,10,11,0.66)',
            zIndex: 1001,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Step card, pinned bottom-center (bottom sheet feel on mobile). The
          spotlight points; the card explains. */}
      {/* Centered via left/right insets + auto margin, NOT transform: the
          fade-up animation animates transform and would clobber a translateX,
          which pushed the card off-screen on mobile. */}
      <div
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 'max(16px, env(safe-area-inset-bottom))',
          marginInline: 'auto',
          maxWidth: 420,
          zIndex: 1002,
        }}
        className={reduced ? undefined : 'fade-up'}
      >
        <div
          style={{
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 20px 56px -18px rgba(0,0,0,0.34)',
          }}
          className="p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:TIP {active.index + 1}/{total}:]
            </span>
            <button
              type="button"
              onClick={dismissAll}
              className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
              title="Turn off tips everywhere. You can re-enable them in Settings."
            >
              Skip all tips
            </button>
          </div>

          <h3 className="mt-2 font-sans text-[18px] font-extrabold tracking-[-0.01em] leading-tight text-[var(--lp-dark)]">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            {step.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* progress dots */}
            <div className="flex items-center gap-1.5" aria-hidden>
              {active.steps.map((_, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full transition-colors"
                  style={{
                    width: i === active.index ? 16 : 6,
                    height: 6,
                    background:
                      i === active.index ? 'var(--lp-accent)' : 'var(--lp-border-light)',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={prev}
                  className="mono text-[11px] uppercase tracking-[0.1em] font-semibold px-3 py-2 text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 mono text-[11px] uppercase tracking-[0.08em] font-bold px-4 py-2 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
                style={{
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 3,
                }}
              >
                {isLast ? 'Done' : 'Next'}
                {!isLast && <span aria-hidden>→</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
