'use client';
import { useEffect } from 'react';

/// Takes the floating launchers away while something that must not be covered
/// is sitting under them.
///
/// `useScrollQuiet` fades them during a scroll, which handles reading in motion
/// and nothing else: the moment the page settles they come back, and if it
/// settled on a row of money they come back on top of it. A value you cannot
/// read is worse than a button you cannot reach.
///
/// So a surface can declare itself with `data-float-guard`, and while any such
/// surface overlaps the band the launchers occupy, they leave. Marked rather
/// than inferred, because "would this cover something important" is a judgement
/// about the content, and the surface making the claim is the one that knows.
///
/// An IntersectionObserver, so this costs nothing per frame. The root is shrunk
/// to the bottom of the viewport, which is the only part the launchers are in:
/// they sit at `bottom-24`, so roughly the last 15% of a phone screen. A guard
/// higher up the page is not in their way and does not fire.
///
/// ONLY MARK A BOUNDED SURFACE. A guard has to be something a reader scrolls
/// past, so the launchers come back. Marking a whole page's list would keep some
/// part of it in the band forever and the assistant would be unreachable on that
/// route, which is a worse fault than a circle over one row. `MyMoneyLedger` was
/// tagged for exactly one screenshot and untagged again for exactly this reason:
/// on /activity that list IS the page. Long lists are served by the fade in
/// `useScrollQuiet`; this is for action cards, records and status blocks.
const LAUNCHER_BAND = '-85% 0px 0px 0px';

export function useFloatGuard(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (typeof IntersectionObserver === 'undefined') return;

    // Count, not a boolean: several guards can be in the band at once, and the
    // last one leaving is what brings the launchers back.
    const inBand = new Set<Element>();
    const sync = () => root.classList.toggle('float-clear', inBand.size > 0);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target);
          else inBand.delete(entry.target);
        }
        sync();
      },
      { rootMargin: LAUNCHER_BAND, threshold: 0 },
    );

    // Guards mount and unmount with routes and with data, so the set is watched
    // rather than read once. Without this, navigating to a guarded page after
    // this hook mounted would observe nothing.
    const observeAll = () => {
      for (const el of document.querySelectorAll('[data-float-guard]')) io.observe(el);
    };
    observeAll();
    // Coalesced to one rescan per frame. These pages take live events, so an
    // un-debounced observer would re-query the document on every row that
    // arrives, which is the kind of cost that shows up as scroll jank.
    let queued = 0;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        observeAll();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (queued) cancelAnimationFrame(queued);
      io.disconnect();
      mo.disconnect();
      root.classList.remove('float-clear');
    };
  }, []);
}
