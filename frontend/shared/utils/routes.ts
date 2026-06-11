/// The public marketing routes. They render their own chrome (no app nav, no
/// balance rail) and must stay fully decoupled from account state: no SIWE
/// auto-sign, no Terms gate, no sign-in prompt. Landing is always the first
/// thing a visitor sees, and a wallet account switch there should never pop an
/// app-auth flow. Launch app navigates into /app, where auth gating belongs.
export function isLandingRoute(pathname: string | null | undefined): boolean {
  return pathname === '/' || pathname === '/how-it-works';
}
