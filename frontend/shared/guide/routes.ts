/// Public/editorial, operator and initial sign-in flows never run customer
/// coachmarks. Sensitive signed-in forms can offer manual guidance, but the
/// welcome component separately blocks automatic tours on focused flows.
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
    pathname.startsWith('/admin') ||
    pathname.startsWith('/brand') ||
    pathname.startsWith('/newsletter') ||
    pathname.startsWith('/credit-passport')
  );
}
