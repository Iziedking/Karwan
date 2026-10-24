/// Where the page glides under a mouse wheel: product pages on a desktop
/// pointer, never for someone who asked for less motion, never on the landing
/// page (its own panel scrolling) or the operator console.
export function smoothScrollAllowed(
  pathname: string | null,
  win: Pick<Window, 'matchMedia'> & { document: { documentElement: { classList: { contains: (c: string) => boolean } } } },
): boolean {
  if (!pathname || pathname === '/' || pathname.startsWith('/admin')) return false;
  if (win.document.documentElement.classList.contains('lp-snap')) return false;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return win.matchMedia('(pointer: fine) and (hover: hover)').matches;
}
