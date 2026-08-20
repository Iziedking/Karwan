'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { getShellSurface } from '@/shared/utils/routes';

interface ChromeFrameProps {
  topNav: React.ReactNode;
  profileNudge: React.ReactNode;
  footer: React.ReactNode;
  bottomNav: React.ReactNode;
  notifications: React.ReactNode;
  guide: React.ReactNode;
  terms: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Route-aware platform shell. Public pages retain the editorial footer,
 * authenticated workspaces keep persistent task navigation, and focused flows
 * remove every exit that is not needed to finish the current task.
 */
export function ChromeFrame({
  topNav,
  profileNudge,
  footer,
  bottomNav,
  notifications,
  guide,
  terms,
  children,
}: ChromeFrameProps) {
  const pathname = usePathname();
  const auth = useAuth();
  const shell = getShellSurface(pathname, auth.isAuthenticated);

  if (shell === 'bare') {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  const workspace = shell === 'workspace' || shell === 'admin';
  const focused = shell === 'focused';
  // 9rem, not 6rem. The bottom nav is only the first thing in the way: the
  // guide and assistant buttons float above it, so 6rem cleared the nav and
  // left the last row of a page sitting underneath them. Measured against the
  // tallest stack, nav plus a floating button plus the gaps either side.
  // md:py-10 drops it again on desktop, where the nav is hidden anyway.
  const mainClass = workspace
    ? 'flex-1 mx-auto min-h-[calc(100vh-68px)] w-full max-w-6xl px-6 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-8 md:py-10'
    : 'flex-1 mx-auto min-h-[calc(100vh-68px)] w-full max-w-6xl px-6 py-10';

  return (
    <div className="flex min-h-screen flex-col">
      {topNav}
      {workspace ? profileNudge : null}
      <main className={mainClass}>{children}</main>
      {shell === 'public' ? footer : null}
      {workspace ? bottomNav : null}
      {workspace || focused ? notifications : null}
      {workspace ? guide : null}
      {workspace || focused ? terms : null}
    </div>
  );
}
