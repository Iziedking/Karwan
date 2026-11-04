'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { ActionBeacon } from './ActionBeacon';
import { isMarketRoute } from './marketNav';
import { DEALS_HREF, navHref, workspaceNavItems, type NavItemId } from './workspaceNav';
import { cn } from '@/shared/utils/cn';
import { getShellSurface, WALLET_HOME } from '@/shared/utils/routes';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';

type IconName = 'home' | 'market' | 'deals' | 'profile';

interface BottomNavItem {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  signal?: boolean;
}

/// The Figma tab icons (public/icons/nav), drawn as masks so they take the
/// tab's text colour in either theme.
const ICON: Record<NavItemId, IconName> = {
  home: 'home',
  market: 'market',
  deals: 'deals',
  money: 'home',
  messages: 'home',
  finance: 'home',
  activity: 'home',
  profile: 'profile',
};

/**
 * Persistent mobile task navigation for the signed-in workspace: Home, Market,
 * Deals and Profile (view 44), one thumb away from every desk. Deals carries
 * the mark when something needs you.
 */
export function WorkspaceBottomNav() {
  const pathname = usePathname();
  const auth = useAuth();
  const { unreadCount } = useNotifications();
  const openDeals = useOpenDeals();
  const t = useTranslations().nav;
  const shell = getShellSurface(pathname, auth.isAuthenticated);

  if (!auth.isAuthenticated || shell !== 'workspace') return null;

  const homeHref = DEALS_AVAILABLE ? '/app' : WALLET_HOME;
  const isActive = (id: NavItemId, href: string): boolean => {
    if (id === 'market') return isMarketRoute(pathname);
    if (id === 'deals') return pathname === DEALS_HREF || pathname.startsWith(`${DEALS_HREF}/`);
    if (id === 'profile') return pathname.startsWith('/profile') || pathname.startsWith('/settings');
    if (id === 'home') return pathname === href;
    return pathname.startsWith(href);
  };
  const items: BottomNavItem[] = workspaceNavItems({ surface: 'phone', dealsAvailable: DEALS_AVAILABLE, financeEnabled: false }).map((id) => {
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
            {/* The tab you are on sits on a Karwan green pill, so the place reads at a glance (owner notes, 4 Nov 2026). */}
            <span
              aria-hidden
              data-nav-pill={item.active ? 'on' : undefined}
              className={cn('relative rounded-full px-3.5 py-0.5 transition-colors duration-[var(--dur-fade)]', item.active && 'bg-[var(--action)] text-[var(--on-action)]')}
            >
              <NavIcon name={item.icon} />
              {item.signal ? <ActionBeacon className="absolute -top-1 -end-1.5" /> : null}
            </span>
            <span className={cn('max-w-full truncate text-[13px] leading-[1.3]', item.active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const url = `url(/icons/nav/${name}.svg)`;
  return (
    <span
      data-nav-icon={name}
      className="block size-6 bg-current"
      style={{ maskImage: url, WebkitMaskImage: url, maskSize: '24px 24px', WebkitMaskSize: '24px 24px', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}
    />
  );
}
