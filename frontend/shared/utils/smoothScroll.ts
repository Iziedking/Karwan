/// Where the page glides under a mouse wheel: every page on a desktop pointer,
/// the landing page included (owner, 24 Oct 2026), never for someone who asked
/// for less motion, never on a page with its own panel scrolling (lp-snap) or
/// the operator console.
export function smoothScrollAllowed(
  pathname: string | null,
  win: Pick<Window, 'matchMedia'> & { document: { documentElement: { classList: { contains: (c: string) => boolean } } } },
): boolean {
  if (!pathname || pathname.startsWith('/admin')) return false;
  if (win.document.documentElement.classList.contains('lp-snap')) return false;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return win.matchMedia('(pointer: fine) and (hover: hover)').matches;
}
