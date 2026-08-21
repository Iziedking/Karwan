'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';

/// The landing page as a stack of panels.
///
/// On a phone every row of the landing is exactly one screen tall, measured from
/// the real chrome (the top bar and the section strip publish their own heights
/// as `--lp-nav-h` / `--lp-strip-h`), so no row ever shows a sliver of the next
/// one under it. That sliver is what made the page read as unfinished: a film
/// hero with a cream edge cutting across its last centimetre.
///
/// The change of row is animated rather than merely scrolled. The media layer
/// drifts and dims as its row leaves, and the copy of the row now filling the
/// screen rises into place. One row is "active" at a time, which is what makes
/// it a switch and not a fade.
///
/// Desktop is untouched: rows keep their natural height and reveal once on
/// scroll, because more than one row is in frame at a time there and switching
/// panels would blank content the reader can still see.

/// True while the viewport is narrower than the `md` breakpoint, i.e. while the
/// panel behaviour applies. Starts false so the server render and the first
/// client render agree, then corrects on mount.
export function useIsPanelViewport(): boolean {
  const [isPanel, setIsPanel] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPanel(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return isPanel;
}

/// Turns on proximity snapping for the document while the landing is mounted,
/// and takes it away on leave. Proximity, never mandatory: a row taller than the
/// screen has to stay scrollable a line at a time. Breakpoint and reduced-motion
/// exclusions live in CSS so one rule owns the whole decision.
export function usePanelSnap(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('lp-snap');
    return () => root.classList.remove('lp-snap');
  }, []);
}

const PanelActiveContext = createContext(true);

/// Whether this row is the one filling the screen. Always true off the panel
/// viewport, so desktop content never waits on an observer.
export function usePanelActive(): boolean {
  return useContext(PanelActiveContext);
}

export function PanelActiveProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return <PanelActiveContext.Provider value={active}>{children}</PanelActiveContext.Provider>;
}

/// Tracks whether `ref` is the row the reader is on, defined as the row crossing
/// the middle of the screen.
///
/// NOT a visible-ratio threshold. A ratio is measured against the element's own
/// height, so a row three screens tall can never reach half of itself and would
/// never come on at all. That is not a tuning problem, it is the wrong
/// measurement: the row under the reader's eye is the row at the centre of the
/// viewport, whatever its height. The observer root is shrunk to a band across
/// that centre, so crossing it is the event.
///
/// Seeded synchronously from geometry so the first paint is already correct.
/// Waiting for the observer would blank whichever row a deep link landed on for
/// a frame, and on a page that fades copy in, one blank frame reads as broken.
export function usePanelFilling(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const crossesCentre = () => {
      const rect = el.getBoundingClientRect();
      const centre = window.innerHeight / 2;
      return rect.top <= centre && rect.bottom >= centre;
    };
    setActive(crossesCentre());

    if (typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setActive(entry.isIntersecting);
      },
      // A band across the middle of the viewport rather than a hairline: a
      // zero-height root is degenerate, and the overlap at a row boundary makes
      // the handover a crossfade instead of a cut.
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, ref]);
  return enabled ? active : true;
}

/// The copy side of a row. Rises into place when its row reaches the middle of
/// the screen, and then stays.
///
/// It stays on purpose. An exit animation is tempting, because a row that fades
/// out as the next arrives is the most obvious way to make a switch visible, and
/// it is wrong here: rows carrying a list are honestly taller than a screen, so
/// the heading would fade to nothing while the reader is still working down the
/// list under it. The switch is carried by the things that can afford it — the
/// screen-tall rows, the media layer, the snap — never by hiding copy someone is
/// reading.
///
/// `index` staggers siblings: 0 for the bracket label, 1 for the headline, 2 for
/// the body, 3 for the actions. Same rhythm as the hero's first paint.
export function PanelContent({
  children,
  className,
  style,
  index = 0,
  hoverLift = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  index?: number;
  /// The card hover from §4.6: a 2px rise, no shadow, no scale. Only meaningful
  /// where a pointer exists, which is why it is opt-in per call site.
  hoverLift?: boolean;
}) {
  const active = usePanelActive();
  const reduce = useReducedMotion();
  const isPanel = useIsPanelViewport();
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (active) setEntered(true);
  }, [active]);

  // Desktop keeps the once-only reveal, triggered by the row entering the
  // viewport rather than by which row owns the middle of it: more than one row
  // is in frame at a time there.
  if (!isPanel) {
    return (
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        whileHover={hoverLift && !reduce ? { y: -2 } : undefined}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: reduce ? dur.fast : dur.slow, ease: ease.out, delay: index * 0.07 }}
        className={className}
        style={style}
      >
        {children}
      </motion.div>
    );
  }

  const shown = entered || active;
  return (
    <motion.div
      initial={false}
      animate={
        reduce
          ? { opacity: 1 }
          : { opacity: shown ? 1 : 0, y: shown ? 0 : 26, scale: shown ? 1 : 0.985 }
      }
      transition={{
        duration: reduce ? 0 : dur.slow,
        ease: ease.out,
        delay: shown && !reduce ? index * 0.06 : 0,
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/// The media side of a row: film, map, product cutout.
///
/// Continuous rather than stepped, because the media is what the eye tracks
/// while the thumb moves. It drifts against the scroll, sits still while its row
/// owns the screen, and dims on the way out so the row arriving is the brighter
/// of the two. Under reduced motion it is a still image at full strength.
///
/// Renders as the absolute fill of its parent, which must be positioned. Pass
/// the image or video as the child exactly as it would be written inline.
export function PanelMedia({
  children,
  className,
  /// How far the layer drifts against the scroll, in px. Full-bleed film wants
  /// more travel than a product cutout standing on a light band.
  travel = 26,
  /// How far down the dim goes on the way out. A cutout on a light band cannot
  /// take the same dim as film on black without looking broken.
  dim = 0.5,
}: {
  children: ReactNode;
  className?: string;
  travel?: number;
  dim?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [travel, -travel]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.05, 1, 1.05]);
  const opacity = useTransform(scrollYProgress, [0, 0.24, 0.76, 1], [dim, 1, 1, dim]);

  return (
    <div ref={ref} className={cn('lp-panel-media', className)} aria-hidden="true">
      <motion.div className="absolute inset-0" style={reduce ? undefined : { y, scale, opacity }}>
        {children}
      </motion.div>
    </div>
  );
}

/// The cue that there is another row under this one, and that the page moves in
/// whole rows. It is a button, not a decoration: pressing it advances one row,
/// which is the only keyboard-reachable way to do that on a phone.
export function PanelAdvance({
  label,
  tone = 'dark',
  onAdvance,
}: {
  label: string;
  tone?: 'dark' | 'light';
  onAdvance: () => void;
}) {
  const active = usePanelActive();
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onAdvance}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: reduce ? 0 : dur.base, ease: ease.out }}
      className={cn(
        'group inline-flex min-h-11 items-center gap-2.5 px-2 mono text-[10px] uppercase tracking-[0.2em]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
        tone === 'dark'
          ? 'text-white/60 hover:text-white focus-visible:ring-offset-[var(--lp-band-dark)]'
          : 'text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] focus-visible:ring-offset-[var(--lp-light)]',
      )}
      style={{ pointerEvents: active ? 'auto' : 'none' }}
    >
      <span
        aria-hidden
        className="relative inline-flex h-[24px] w-[15px] items-start justify-center rounded-full border transition-colors"
        style={{ borderColor: tone === 'dark' ? 'rgba(255,255,255,0.34)' : 'var(--lp-outline)' }}
      >
        <motion.span
          className="mt-[4px] block"
          style={{ width: 2, height: 6, borderRadius: 2, background: 'var(--lp-accent)' }}
          animate={reduce ? undefined : { y: [0, 7, 0], opacity: [1, 0.35, 1] }}
          transition={reduce ? undefined : { duration: 1.7, ease: 'easeInOut', repeat: Infinity }}
        />
      </span>
      {label}
    </motion.button>
  );
}

/// Scrolls to the next row of the stack, landing it under the sticky chrome.
/// Used by `PanelAdvance` and by anything else that means "next row".
export function advanceToNextPanel(from: HTMLElement | null): void {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.lp-panel'));
  const current = from?.closest('.lp-panel') as HTMLElement | null;
  const index = current ? panels.indexOf(current) : -1;
  const next = panels[index + 1] ?? panels[0];
  if (!next) return;
  const chrome = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lp-nav-h') || '68',
  );
  const strip = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lp-strip-h') || '0',
  );
  const top = next.getBoundingClientRect().top + window.scrollY - (chrome + strip);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
}
