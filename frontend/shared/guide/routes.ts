/// Routes where coachmark tours never run. Two kinds: public / marketing pages
/// (landing, docs, info), and active setup flows where a popup would talk over
/// the task the user is mid-way through (onboarding language/profile, invite
/// claim, cashout). Used both to gate STARTING a tour and to hide an
/// already-open tour's overlay if the user navigates into one of these flows,
/// so a tour started elsewhere never paints over onboarding.
export function isNoTourRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === '/') return true;
  return (
    pathname.startsWith('/docs') ||
    pathname.startsWith('/how-it-works') ||
    pathname.startsWith('/feedback') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/cashout')
  );
}
