'use client';
import { usePathname } from 'next/navigation';

/// Routes that render bare: no TopNav, no Footer, no ProfileNudge, no
/// GuideWelcome, no Terms modal, no padded main wrapper. The page is the
/// whole experience. Used by invite-only links so a first-time recipient
/// isn't dumped into the rest of the product before they've decided to
/// engage with it.
const NO_CHROME_PREFIXES = ['/invite/'];

interface ChromeFrameProps {
  topNav: React.ReactNode;
  profileNudge: React.ReactNode;
  footer: React.ReactNode;
  notifications: React.ReactNode;
  guide: React.ReactNode;
  terms: React.ReactNode;
  children: React.ReactNode;
}

export function ChromeFrame({
  topNav,
  profileNudge,
  footer,
  notifications,
  guide,
  terms,
  children,
}: ChromeFrameProps) {
  const pathname = usePathname();
  const bare = NO_CHROME_PREFIXES.some((p) => pathname?.startsWith(p));

  if (bare) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {topNav}
      {profileNudge}
      <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-10">{children}</main>
      {footer}
      {notifications}
      {guide}
      {terms}
    </div>
  );
}
