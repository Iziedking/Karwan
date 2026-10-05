'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { ActionBeacon } from './ActionBeacon';
import { PersonAvatar } from './PersonAvatar';
import { cn } from '@/shared/utils/cn';
import { getShellSurface, WALLET_HOME } from '@/shared/utils/routes';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';

type IconName = 'home' | 'trade' | 'discover' | 'activity' | 'account';

interface BottomNavItem {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  signal?: boolean;
}

/**
 * Persistent mobile task navigation for the signed-in workspace. Five stable
 * destinations replace the old expanding hamburger menu, so the user's next
 * action remains reachable with one thumb from every top-level desk.
 */
export function WorkspaceBottomNav() {
  const pathname = usePathname();
  const auth = useAuth();
  const { unreadCount } = useNotifications();
  const openDeals = useOpenDeals();
  const t = useTranslations().nav;
  const { isBusinessWorkspace: business } = useWorkspaceContext();
  const shell = getShellSurface(pathname, auth.isAuthenticated);

  if (!auth.isAuthenticated || shell !== 'workspace') return null;

  const tradeHref = business ? '/b2b' : '/p2p';
  const discoverHref = business ? '/partners' : '/market';
  const tradeActive = [
    '/p2p',
    '/b2b',
    '/supply',
    '/buyer',
    '/seller',
    '/jobs',
    '/deals',
    '/cashout',
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const discoverActive = ['/market', '/listings', '/partners'].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const homeHref = DEALS_AVAILABLE ? '/app' : WALLET_HOME;
  const dealItems: BottomNavItem[] = DEALS_AVAILABLE
    ? [
        {
          href: tradeHref,
          label: business ? t.smeTrades : t.trades,
          icon: 'trade',
          active: tradeActive,
        },
        {
          href: discoverHref,
          label: t.market,
          icon: 'discover',
          active: discoverActive,
        },
      ]
    : [];
  const items: BottomNavItem[] = [
    { href: homeHref, label: t.home, icon: 'home', active: pathname === homeHref },
    ...dealItems,
    {
      href: '/activity',
      label: t.activity,
      icon: 'activity',
      active: pathname.startsWith('/activity'),
      signal: unreadCount > 0,
    },
    {
      href: '/profile',
      label: t.profile,
      icon: 'account',
      active: pathname.startsWith('/profile') || pathname.startsWith('/settings'),
      signal: openDeals.actionCount > 0,
    },
  ];

  const activeIndex = items.findIndex((item) => item.active);

  return (
    <nav
      data-workspace-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--lp-workspace-band)] px-2 pt-1.5 text-[var(--color-ink)] lg:hidden"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
    >
      <div
        className="relative mx-auto grid max-w-lg"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {/* One pill glides to the open tab, so the move itself shows where you went. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 start-0 flex justify-center transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{
            width: `${100 / items.length}%`,
            transform: `translateX(calc(${Math.max(activeIndex, 0)} * 100% * var(--nav-dir, 1)))`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        >
          <span className="h-9 w-[min(64px,80%)] rounded-full bg-[var(--lp-accent)]/25" />
        </span>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lp-accent)]',
              item.active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]',
            )}
          >
            <span
              className={cn(
                'grid h-9 place-items-center transition-transform duration-[320ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
                item.active && '-translate-y-px scale-[1.08]',
              )}
            >
              {item.icon === 'account' && auth.address ? (
                // Your own photo marks Profile; the accent ring marks it open.
                <span className={cn('block rounded-full', item.active && 'ring-2 ring-[var(--lp-accent-on-light)] ring-offset-1 ring-offset-[var(--lp-workspace-band)]')}>
                  <PersonAvatar address={auth.address} name={t.profile} size={22} />
                </span>
              ) : (
                <NavIcon name={item.icon} active={item.active} />
              )}
            </span>
            <span className={cn('inline-flex max-w-full items-center gap-1 truncate text-[14px] transition-[font-weight] duration-200', item.active ? 'font-bold' : 'font-medium')}>
              <span className="truncate">{item.label}</span>
              {item.signal ? <ActionBeacon /> : null}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/// Rounded 24px icons. The open tab's icon fills in; the rest stay outlined.
function NavIcon({ name, active }: { name: IconName; active: boolean }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const solid = active ? 'currentColor' : 'none';

  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" {...line} fill={solid} />
        {active ? <path d="M9.5 20v-5.5h5V20" fill="none" stroke="var(--lp-workspace-band)" strokeWidth={1.6} strokeLinejoin="round" /> : null}
      </svg>
    );
  }
  if (name === 'trade') {
    return (
      <svg {...common}>
        <path d="M16 4l4 4-4 4M20 8H9M8 20l-4-4 4-4M4 16h11" {...line} strokeWidth={active ? 2 : 1.6} />
      </svg>
    );
  }
  if (name === 'discover') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" {...line} />
        <path d="m15.5 8.5-2 5-5 2 2-5z" {...line} fill={solid} />
      </svg>
    );
  }
  if (name === 'activity') {
    return (
      <svg {...common}>
        <rect x="4" y="13" width="3.5" height="7" rx="1.2" {...line} fill={solid} />
        <rect x="10.25" y="8" width="3.5" height="12" rx="1.2" {...line} fill={solid} />
        <rect x="16.5" y="4" width="3.5" height="16" rx="1.2" {...line} fill={solid} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.75" {...line} fill={solid} />
      <path d="M4.5 20c.9-3.6 3.5-5.5 7.5-5.5s6.6 1.9 7.5 5.5" {...line} />
    </svg>
  );
}
