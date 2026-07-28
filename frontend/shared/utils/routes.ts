/// The public marketing routes. They render their own chrome (no app nav, no
/// balance rail) and must stay fully decoupled from account state: no SIWE
/// auto-sign, no Terms gate, no sign-in prompt. Landing is always the first
/// thing a visitor sees, and a wallet account switch there should never pop an
/// app-auth flow. Launch app navigates into /app, where auth gating belongs.
export function isLandingRoute(pathname: string | null | undefined): boolean {
  if (pathname === '/' || pathname === '/how-it-works') return true;
  // The newsletter archive and every issue under it. These are linked from
  // inside sent email and from Telegram, so most people arriving have no wallet
  // and no session, and popping a sign-in flow at somebody who clicked "read
  // this in your browser" is how a reader becomes a former reader.
  return pathname === '/newsletter' || (pathname?.startsWith('/newsletter/') ?? false);
}
