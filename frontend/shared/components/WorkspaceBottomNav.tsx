'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useShellSignedIn } from '@/shared/auth/shellSignedIn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { ActionBeacon } from './ActionBeacon';
import { PersonAvatar } from './PersonAvatar';
import { isMarketRoute } from './marketNav';
import { DEALS_HREF, navHref, workspaceNavItems, type NavItemId } from './workspaceNav';
import { cn } from '@/shared/utils/cn';
import { getShellSurface, WALLET_HOME } from '@/shared/utils/routes';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { SME_TRADES_ENABLED } from '@/features/profile/config';

type IconName = 'home' | 'market' | 'deals' | 'finance' | 'profile';

interface BottomNavItem {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  signal?: boolean;
}

/// The icon each tab uses (view 51, fourth round).
const ICON: Record<NavItemId, IconName> = {
  home: 'home',
  market: 'market',
  deals: 'deals',
  money: 'home',
  messages: 'home',
  finance: 'finance',
  activity: 'home',
  profile: 'profile',
};

/**
 * Persistent mobile task navigation for the signed-in workspace: Home, Market,
 * Deals, Finance when it is on, and Profile (view 44), one thumb away from every desk. Deals carries
 * the mark when something needs you.
 */
export function WorkspaceBottomNav() {
  const pathname = usePathname();
  const auth = useAuth();
  const { unreadCount } = useNotifications();
  const openDeals = useOpenDeals();
  const t = useTranslations().nav;
  // The tabs are drawn before the sign-in check answers (shellSignedIn).
  const signedIn = useShellSignedIn(pathname, auth);
  const shell = getShellSurface(pathname, signedIn);

  if (!signedIn || shell !== 'workspace') return null;

  const homeHref = DEALS_AVAILABLE ? '/app' : WALLET_HOME;
  const isActive = (id: NavItemId, href: string): boolean => {
    if (id === 'market') return isMarketRoute(pathname);
    if (id === 'deals') return pathname === DEALS_HREF || pathname.startsWith(`${DEALS_HREF}/`);
    if (id === 'profile') return pathname.startsWith('/profile') || pathname.startsWith('/settings');
    if (id === 'home') return pathname === href;
    return pathname.startsWith(href);
  };
  const items: BottomNavItem[] = workspaceNavItems({ surface: 'phone', dealsAvailable: DEALS_AVAILABLE, financeEnabled: SME_TRADES_ENABLED }).map((id) => {
    const href = navHref(id, homeHref);
    return {
      href,
      label: t[id],
      icon: ICON[id],
      active: isActive(id, href),
      signal: id === 'deals' ? openDeals.actionCount > 0 : id === 'activity' && unreadCount > 0,
    };
  });

  return (
    <nav
      data-workspace-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)] px-2 pt-2 lg:hidden"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'relative flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1',
              'transition-colors duration-[var(--dur-fade)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]',
              item.active ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]',
            )}
          >
            {/* The tab you are on fills its own icon in Karwan green, so the green
                fits the shape (owner, 5 Nov 2026, option A); Profile is your photo. */}
            <span aria-hidden data-nav-on={item.active ? 'on' : undefined} className="relative grid h-7 w-11 place-items-center">
              {item.icon === 'profile' ? (
                <span className={cn('grid size-7 place-items-center rounded-full', item.active ? 'ring-2 ring-[var(--karwan-green)]' : '')}>
                  <PersonAvatar address={auth.address ?? undefined} name={t.profile} size={item.active ? 22 : 24} />
                </span>
              ) : (
                <NavIcon name={item.icon} on={item.active} />
              )}
              {item.signal ? <ActionBeacon className="absolute -top-0.5 end-1" /> : null}
            </span>
            <span className={cn('max-w-full truncate text-[13px] leading-[1.3]', item.active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/// One 24px family, 1.75 stroke, rounded ends: a house, a shop front, a shield
/// with a tick for protected deals, three bars for Finance. A shape marked
/// `fill` is filled when the tab is on; a `cut` line stays dark on top of it.
const NAV_PATHS: Record<Exclude<IconName, 'profile'>, { d: string; kind: 'fill' | 'line' | 'cut' }[]> = {
  home: [{ d: 'M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z', kind: 'fill' }],
  market: [
    { d: 'M4 9.5 5.5 4.5h13L20 9.5c0 1.5-1.2 2.5-2.67 2.5s-2.66-1-2.66-2.5c0 1.5-1.2 2.5-2.67 2.5s-2.67-1-2.67-2.5c0 1.5-1.2 2.5-2.66 2.5S4 11 4 9.5z', kind: 'fill' },
    { d: 'M5.5 13.5V20h13v-6.5', kind: 'line' },
    { d: 'M10 20v-4h4v4', kind: 'line' },
  ],
  deals: [
    { d: 'M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z', kind: 'fill' },
    { d: 'm9 12 2.2 2.2L15.5 10', kind: 'cut' },
  ],
  finance: [
    { d: 'M4 20h16', kind: 'line' },
    { d: 'M5.5 12.5h3V17h-3z', kind: 'fill' },
    { d: 'M10.5 8.5h3V17h-3z', kind: 'fill' },
    { d: 'M15.5 4.5h3V17h-3z', kind: 'fill' },
  ],
};

function NavIcon({ name, on }: { name: Exclude<IconName, 'profile'>; on: boolean }) {
  const green = 'var(--karwan-green)';
  return (
    <svg data-nav-icon={name} width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {NAV_PATHS[name].map(({ d, kind }) => (
        <path
          key={d}
          d={d}
          stroke={on ? (kind === 'cut' ? 'var(--surface)' : green) : 'currentColor'}
          strokeWidth={on && kind === 'cut' ? 2.2 : undefined}
          fill={on && kind === 'fill' ? green : 'none'}
        />
      ))}
    </svg>
  );
}
