'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { cn } from '@/shared/utils/cn';
import { getShellSurface } from '@/shared/utils/routes';
import { isBusinessAccount } from '@/features/account/accountKind';

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
  const { profile } = useUserProfile();
  const t = useTranslations().nav;
  const business = isBusinessAccount(profile);
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

  const items: BottomNavItem[] = [
    { href: '/app', label: t.home, icon: 'home', active: pathname === '/app' },
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
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a0b] px-2 pt-1.5 text-white md:hidden"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lp-accent)]',
              item.active ? 'text-white' : 'text-white/52 hover:text-white/82',
            )}
          >
            {item.active ? (
              <motion.span
                layoutId="workspace-mobile-active"
                aria-hidden
                className="absolute inset-x-3 -top-1.5 h-0.5 bg-[var(--lp-accent)]"
                transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null}
            <NavIcon name={item.icon} active={item.active} />
            <span className="inline-flex max-w-full items-center gap-1 truncate mono text-[9px] font-semibold uppercase tracking-[0.05em]">
              <span className="truncate">{item.label}</span>
              {item.signal ? (
                <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--lp-accent)]" />
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function NavIcon({ name, active }: { name: IconName; active: boolean }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 18 18',
    fill: 'none',
    'aria-hidden': true,
  } as const;
  const stroke = active ? 'var(--lp-accent)' : 'currentColor';
  const props = {
    stroke,
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M2.75 8.1 9 2.9l6.25 5.2v6.8H11v-4H7v4H2.75z" {...props} />
      </svg>
    );
  }
  if (name === 'trade') {
    return (
      <svg {...common}>
        <path d="M3 5.25h10.5M11 2.75l2.5 2.5-2.5 2.5M15 12.75H4.5M7 10.25l-2.5 2.5L7 15.25" {...props} />
      </svg>
    );
  }
  if (name === 'discover') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="4.5" {...props} />
        <path d="m11.4 11.4 3.6 3.6M6.25 9.75l1.2-3.1 3.1-1.2-1.2 3.1z" {...props} />
      </svg>
    );
  }
  if (name === 'activity') {
    return (
      <svg {...common}>
        <path d="M2.5 9h2.75l1.5-4 3 8 1.5-4H15.5" {...props} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="6" r="2.75" {...props} />
      <path d="M3.75 15c.65-2.55 2.4-3.85 5.25-3.85s4.6 1.3 5.25 3.85" {...props} />
    </svg>
  );
}
