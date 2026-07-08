'use client';
import { usePathname } from 'next/navigation';
import { isLandingRoute } from '@/shared/utils/routes';
import { BackButton } from './BackButton';

// Path prefixes that render bare: no TopNav, ProfileNudge, Footer, Guide,
// Terms modal, or padded main wrapper. Used by invite links so a first-time
// recipient is not dropped into the full product before they accept.
const NO_CHROME_PREFIXES = ['/invite/'];

// These pages render their own contextual back link inside the hero (role-aware:
// back to /buyer vs /seller), so they opt out of the global back lane to avoid
// two stacked back controls.
const OWN_BACK_PREFIXES = ['/jobs/', '/deals/'];

// Pages whose first band is LIGHT (cream), where a dark lane would seam. The
// lane and its button switch to the light treatment for these. Everything else
// leads with a dark hero.
const LIGHT_LANE_PREFIXES = ['/docs', '/x402', '/financier'];

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
  // The back control lives in a lane between the nav and the page content, on
  // every page except the landing routes, the app home (the root), and the pages
  // that carry their own in-hero back link. Same gate as BackButton so the lane
  // never renders empty.
  const ownsBack = OWN_BACK_PREFIXES.some((p) => pathname?.startsWith(p));
  const showBack = !isLandingRoute(pathname) && pathname !== '/app' && !ownsBack;
  const lightLane = LIGHT_LANE_PREFIXES.some((p) => pathname?.startsWith(p));

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
      {/* Back-control lane. A dark strip between the nav and the page content, so
          the button sits at the top-left of the page (not the nav) and reads as
          part of the dark hero below it. Same max-width + padding as Band so it
          lines up with the hero eyebrow. No bottom padding: it butts flush onto
          the hero, which the FullBleed pull already aligns to the top of main. */}
      {showBack && (
        <div className={`w-full ${lightLane ? 'bg-[var(--lp-light)]' : 'bg-[var(--lp-band-dark)]'}`}>
          <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] pt-[clamp(16px,3vw,26px)]">
            <BackButton tone={lightLane ? 'light' : 'dark'} />
          </div>
        </div>
      )}
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
