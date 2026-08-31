'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { getShellSurface } from '@/shared/utils/routes';
import { useScrollQuiet } from '@/shared/hooks/useScrollQuiet';
import { useFloatGuard } from '@/shared/hooks/useFloatGuard';
import { RouteStage } from '@/shared/components/RouteStage';

interface ChromeFrameProps {
  topNav: React.ReactNode;
  profileNudge: React.ReactNode;
  footer: React.ReactNode;
  feedback: React.ReactNode;
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
  feedback,
  bottomNav,
  notifications,
  guide,
  terms,
  children,
}: ChromeFrameProps) {
  const pathname = usePathname();
  const routeOnlyShell = getShellSurface(pathname, false);

  if (routeOnlyShell === 'bare') {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1">
          <RouteStage pathname={pathname}>{children}</RouteStage>
        </main>
      </div>
    );
  }

  // Admin routes own their complete shell and intentionally do not mount the
  // customer auth hook, navigation, notifications, guide, or terms runtime.
  // This keeps the operator console independent from any account logged into
  // the same browser profile.
  if (routeOnlyShell === 'admin') {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <RouteStage pathname={pathname}>{children}</RouteStage>
        </div>
      </div>
    );
  }

  return (
    <CustomerChromeFrame
      pathname={pathname}
      topNav={topNav}
      profileNudge={profileNudge}
      footer={footer}
      feedback={feedback}
      bottomNav={bottomNav}
      notifications={notifications}
      guide={guide}
      terms={terms}
    >
      {children}
    </CustomerChromeFrame>
  );
}

function CustomerChromeFrame({
  pathname,
  topNav,
  profileNudge,
  footer,
  feedback,
  bottomNav,
  notifications,
  guide,
  terms,
  children,
}: ChromeFrameProps & { pathname: string }) {
  const auth = useAuth();
  const shell = getShellSurface(pathname, auth.isAuthenticated);

  // Lets the floating launchers step aside while someone is reading, and take
  // themselves away entirely while a guarded surface is under them.
  useScrollQuiet();
  useFloatGuard();

  const workspace = shell === 'workspace' || shell === 'admin';
  const focused = shell === 'focused';
  const mainClass = workspace
    ? 'flex-1 mx-auto min-h-[calc(100svh-var(--lp-nav-h,68px))] w-full max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8 md:py-10'
    : 'flex-1 mx-auto min-h-[calc(100svh-var(--lp-nav-h,68px))] w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10';
  const platformCopy = workspace || focused;

  return (
    <div className="flex min-h-screen flex-col">
      {topNav}
      {workspace ? profileNudge : null}
      <main className={`${mainClass}${platformCopy ? ' platform-copy' : ''}`}>
        <RouteStage pathname={pathname}>{children}</RouteStage>
      </main>
      {shell === 'public' ? footer : null}
      {workspace && auth.isAuthenticated ? feedback : null}
      {workspace ? bottomNav : null}
      {workspace || focused ? notifications : null}
      {workspace ? guide : null}
      {workspace || focused ? terms : null}
    </div>
  );
}
