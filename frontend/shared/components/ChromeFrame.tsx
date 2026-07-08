'use client';
import { usePathname } from 'next/navigation';

// Path prefixes that render bare: no TopNav, ProfileNudge, Footer, Guide,
// Terms modal, or padded main wrapper. Used by invite links so a first-time
// recipient is not dropped into the full product before they accept.
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
      {/* min-height reserves a full viewport (minus the 68px nav) so the tall
          footer can never ride up into view while a page is still fetching. Its
          content is short mid-load, and the footer's big wordmark is taller than
          the leftover space, so without this floor the footer painted first and
          the page looked like it rendered from the bottom up. */}
      <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-10 min-h-[calc(100vh-68px)]">
        {children}
      </main>
      {footer}
      {notifications}
      {guide}
      {terms}
    </div>
  );
}
