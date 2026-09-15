'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { ConnectWalletButton } from './ConnectWallet';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { getShellSurface } from '@/shared/utils/routes';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { ActionBeacon } from './ActionBeacon';
import type { UserProfile } from '@/core/api';
import { WalletAvatar } from './WalletAvatar';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { ArcLaunchCountdown } from './ArcLaunchCountdown';

const LANDING_NAV_VARS = {
  '--color-surface': '#0e0e0e',
  '--color-surface-2': 'rgba(255,255,255,0.07)',
  '--color-line': 'rgba(255,255,255,0.10)',
  '--color-line-strong': 'rgba(255,255,255,0.22)',
  '--color-ink': '#f4f0ff',
  '--color-ink-dim': '#9a9a9a',
  '--color-ink-faint': '#6b6b6b',
  '--lp-workspace-band': '#0e0e0e',
  '--lp-dark': '#f4f0ff',
} as CSSProperties;

export function TopNav() {
  const a11y = useTranslations().a11y;
  const pathname = usePathname();
  const t = useTranslations();
  const {
    address: authAddress,
    email: authEmail,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();
  const { unreadCount } = useNotifications();
  const openDeals = useOpenDeals();
  const { profile, address: profileAddress } = useUserProfile();
  // The selected workspace controls the home/trade context. Personal and
  // business workspaces share this identity and wallet; the switcher makes the
  // context visible before a consequential action. The Financier desk remains
  // available to both workspaces.
  const { isBusinessWorkspace } = useWorkspaceContext();
  const biz = isBusinessWorkspace;
  const shell = getShellSurface(pathname, isAuthenticated);
  const publicSurface = shell === 'public';
  const workspaceSurface = shell === 'workspace' || shell === 'admin';
  const focusedSurface = shell === 'focused';
  const showAppChrome = (workspaceSurface || focusedSurface) && isAuthenticated;
  // Onboarding is a focused setup flow: strip the nav rail down to identity.
  // The full chrome returns once setup is complete.
  const showFullChrome = workspaceSurface && isAuthenticated;

  const tradesActive =
    pathname.startsWith('/p2p') ||
    pathname.startsWith('/b2b') ||
    pathname.startsWith('/supply') ||
    pathname.startsWith('/buyer') ||
    pathname.startsWith('/seller') ||
    pathname.startsWith('/jobs') ||
    pathname.startsWith('/deals');
  const discoverHref = biz ? '/partners' : '/market';
  const discoverActive =
    pathname.startsWith('/market') ||
    pathname.startsWith('/listings') ||
    pathname.startsWith('/partners');

  // The landing sizes its rows against the real chrome (see globals.css
  // "Landing panels"), so the bar publishes its own height instead of the page
  // hardcoding 68px. It changes with type scale, and a wrong number there is a
  // visible sliver of the next row under the current one.
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        '--lp-nav-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
    <header
      ref={barRef}
      style={pathname === '/' ? LANDING_NAV_VARS : undefined}
      data-chrome="nav"
      className={cn(
        'sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--lp-workspace-band)]',
        pathname !== '/' && 'product-surface',
      )}
    >
      <div className="mx-auto flex h-[64px] max-w-[1600px] items-center gap-2.5 px-4 sm:h-[72px] sm:gap-5 sm:px-6 lg:gap-8">
        <div className="flex min-w-0 shrink-0 items-center">
          <Link href="/" aria-label="Karwan" className="group inline-flex min-h-11 min-w-11 items-center justify-center gap-2.5 sm:justify-start sm:gap-3">
            <span
              aria-hidden
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5 sm:h-11 sm:w-11"
            >
              {/* Use the canonical Karwan mark; do not wrap it in the old
                  white placeholder tile. The asset owns its dark tile and
                  lime mark treatment. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/karwan-app-icon.svg" alt="" width="44" height="44" className="size-full" />
            </span>
            <span className="hidden font-sans text-[18px] font-extrabold tracking-[-0.04em] text-[var(--lp-dark)] sm:inline">
              karwan
            </span>
          </Link>
        </div>

        <ArcLaunchCountdown />

        {/* INLINE-END. control cluster */}
        <div className="ms-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          {focusedSurface ? (
            <>
              {/* Sign-in and onboarding have no preferences menu yet, and they
                  are the screens with the most reading and form-filling on
                  them. The control rides in the nav there instead. */}
              {authLoading ? (
                <span
                  aria-hidden
                  className="inline-block rounded-full bg-[var(--color-surface-2)] motion-safe:animate-pulse motion-reduce:animate-none"
                  style={{ width: 132, height: 36 }}
                />
              ) : (
                <ConnectWalletButton />
              )}
            </>
          ) : showAppChrome ? (
              <>
                <NotificationBell />
                <ProfileLink
                  profileActionCount={openDeals.actionCount}
                  profile={profile}
                  identityName={profile?.displayName ?? authEmail?.split('@')[0] ?? ''}
                  identityAddress={profileAddress ?? authAddress}
                />
              </>
          ) : !publicSurface ? (
            // Signed-out app chrome: the sign-in button, nothing else. Don't
            // tease the app surface (nav rail, balance,
            // bell, settings) before the user has signed in. While auth is
            // still resolving, reserve the same approximate width so the bar
            // doesn't shift content once the button paints. This was one of the
            // dominant CLS contributors across every app route (RES dashboard,
            // last 7 days).
            <>
              {authLoading ? (
                <span
                  aria-hidden
                  className="inline-block rounded-full bg-[var(--color-surface-2)] motion-safe:animate-pulse motion-reduce:animate-none"
                  style={{ width: 132, height: 36 }}
                />
              ) : (
                <ConnectWalletButton />
              )}
            </>
          ) : (
            <LaunchAppCTA />
          )}
        </div>
      </div>
    </header>
    {showFullChrome ? (
      <WorkspaceRail
        pathname={pathname}
        tradeHref={biz ? '/b2b' : '/p2p'}
        discoverHref={discoverHref}
        tradesActive={tradesActive}
        discoverActive={discoverActive}
        financeEnabled={SME_TRADES_ENABLED}
        unread={unreadCount > 0}
        financeLabel={a11y.fundFactoringAndPos}
        soonLabel={t.nav.soonBadge}
      />
    ) : null}
    </>
  );
}

function WorkspaceRail({
  pathname,
  tradeHref,
  discoverHref,
  tradesActive,
  discoverActive,
  financeEnabled,
  unread,
  financeLabel,
  soonLabel,
}: {
  pathname: string;
  tradeHref: string;
  discoverHref: string;
  tradesActive: boolean;
  discoverActive: boolean;
  financeEnabled: boolean;
  unread: boolean;
  financeLabel: string;
  soonLabel: string;
}) {
  const t = useTranslations().nav;
  const financeActive = pathname.startsWith('/financier');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('karwan-workspace-rail-collapsed') === '1');
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.workspaceRail = collapsed ? 'collapsed' : 'expanded';
    return () => {
      delete document.documentElement.dataset.workspaceRail;
    };
  }, [collapsed]);

  const toggleRail = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem('karwan-workspace-rail-collapsed', next ? '1' : '0');
      } catch {
        // The rail remains usable even when the preference cannot persist.
      }
      return next;
    });
  };

  return (
    <aside
      data-chrome="workspace-rail"
      className="pointer-events-none fixed inset-y-0 start-0 z-20 hidden w-full lg:block"
      style={{ top: 'calc(var(--lp-nav-h, 72px) + 16px)' }}
    >
      <nav
        id="workspace-navigation"
        aria-label="workspace navigation"
        className={cn(
          'pointer-events-auto absolute flex flex-col gap-1 transition-[width] duration-300 ease-out',
          collapsed ? 'w-[72px]' : 'w-[220px]',
        )}
        style={{ left: 'max(20px, calc(50% - 800px))' }}
      >
        <button
          type="button"
          data-chrome="workspace-rail-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={toggleRail}
          className={cn(
            'group mb-1 inline-flex size-11 shrink-0 items-center justify-center self-start rounded-full border border-[var(--color-line)] text-[var(--color-ink-dim)] transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] hover:-translate-y-0.5',
          )}
          aria-controls="workspace-navigation"
        >
          <span
            aria-hidden
            className={cn(
              'inline-flex transition-transform duration-300 ease-out',
              collapsed ? 'rotate-180' : 'rotate-0',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7M8 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        <RailLink href="/app" active={pathname === '/app'} icon="home" collapsed={collapsed} ariaLabel={t.home}>
          {t.home}
        </RailLink>
        <RailLink href={tradeHref} active={tradesActive} icon="trade" collapsed={collapsed} ariaLabel={t.trades}>
          {t.trades}
        </RailLink>
        <RailLink href={discoverHref} active={discoverActive} icon="discover" collapsed={collapsed} ariaLabel={t.market}>
          {t.market}
        </RailLink>
        <RailLink
          href="/financier"
          active={financeActive}
          icon="finance"
          ariaLabel={financeLabel}
          collapsed={collapsed}
          badge={!financeEnabled ? soonLabel : undefined}
        >
          {t.finance}
        </RailLink>
        <RailLink href="/activity" active={pathname.startsWith('/activity')} icon="activity" collapsed={collapsed} signal={unread} ariaLabel={t.activity}>
          {t.activity}
        </RailLink>
      </nav>
    </aside>
  );
}

function RailLink({
  href,
  active,
  icon,
  children,
  ariaLabel,
  collapsed,
  badge,
  signal = false,
}: {
  href: string;
  active: boolean;
  icon: 'home' | 'trade' | 'discover' | 'finance' | 'activity';
  children: React.ReactNode;
  ariaLabel?: string;
  collapsed?: boolean;
  badge?: string;
  signal?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-12 w-full items-center rounded-full text-[15px] font-medium transition-colors duration-200',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
      )}
      style={active ? { background: 'var(--color-surface-2)' } : undefined}
    >
      <RailIcon name={icon} active={active} />
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{children}</span>
      {badge && !collapsed ? (
        <span
          className="mono rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]"
          style={{ background: 'color-mix(in oklab, var(--lp-accent) 20%, transparent)', color: 'var(--color-ink)' }}
        >
          {badge}
        </span>
      ) : signal ? (
        <span aria-hidden className={cn('size-2 rounded-full bg-[var(--lp-accent)]', collapsed ? 'absolute end-2 top-2' : '')} />
      ) : null}
    </Link>
  );
}

function RailIcon({ name, active }: { name: 'home' | 'trade' | 'discover' | 'finance' | 'activity'; active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn('shrink-0 transition-colors', active ? 'text-[var(--lp-accent)]' : 'text-[var(--color-ink-dim)]')}
    >
      {name === 'home' ? (
        <path d="m4 10 8-6 8 6v9H4v-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      ) : name === 'trade' ? (
        <path d="M7 5v12m0 0-3-3m3 3 3-3M17 19V7m0 0-3 3m3-3 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : name === 'discover' ? (
        <path d="m14.5 4.5-2.1 5.9-5.9 2.1 5.9 2.1 2.1 5.9 2.1-5.9 5.9-2.1-5.9-2.1-2.1-5.9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      ) : name === 'finance' ? (
        <path d="M4 19h16M6 17V9m4 8V5m4 12v-6m4 6V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ) : (
        <path d="M5 5v14m0-10h13l-3-3m3 3-3 3M19 19V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function NavLink({
  href,
  active,
  children,
  title,
  signal,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  /// Plain-language accessible name for labels that benefit from more context.
  /// Browser-default tooltips are intentionally avoided.
  title?: string;
  signal?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-full items-center px-3 text-[12px] font-semibold tracking-[0.01em] transition-colors',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]',
      )}
    >
      {active && (
        <motion.span
          layoutId="topnav-active"
          aria-hidden
          className="absolute inset-x-3 bottom-0 h-0.5 bg-[var(--lp-accent)]"
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <span className="inline-flex items-center gap-1.5">
        {children}
        {signal ? (
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)]"
          />
        ) : null}
      </span>
    </Link>
  );
}

/// Disabled-looking nav slot with a "soon" pill. No href, no click target, just
/// a hover-tooltip via `title`. Used for upcoming product surfaces (SME Trades)
/// so the position is reserved on the rail before the route exists.
// The SME Trades slot carries a SOON chip but links through to the holding
// page so the rail item resolves to a real surface that explains the rail.
function NavLinkSoon({
  href,
  active,
  children,
  title,
  soonLabel,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  title?: string;
  soonLabel: string;
}) {
  return (
    <Link
      href={href}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex h-full items-center gap-1.5 whitespace-nowrap px-3 text-[12px] font-semibold tracking-[0.01em] transition-colors',
        active
          ? 'text-[var(--color-ink)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]',
      )}
    >
      {active && (
        <motion.span
          layoutId="topnav-active"
          aria-hidden
          className="absolute inset-x-3 bottom-0 h-0.5 bg-[var(--lp-accent)]"
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <span className="whitespace-nowrap">{children}</span>
      <span
        className="mono whitespace-nowrap px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.12em]"
        style={{
          background: 'color-mix(in oklab, var(--lp-accent) 14%, transparent)',
          color: 'var(--lp-accent)',
          borderRadius: 3,
        }}
      >
        {soonLabel}
      </span>
    </Link>
  );
}


/// The account control is a direct route into the profile hub. Workspace
/// switching lives there with the account tools, while notifications remain in
/// the header because they are time-sensitive global signals.
function ProfileLink({
  profileActionCount,
  profile,
  identityName,
  identityAddress,
}: {
  profileActionCount: number;
  profile?: UserProfile | null;
  identityName?: string;
  identityAddress?: string | null;
}) {
  const messages = useTranslations();
  const t = messages.nav;
  const [imageFailed, setImageFailed] = useState(false);
  const xImage = !imageFailed ? profile?.xProfileImageUrl?.trim() : undefined;
  const initials = getProfileInitials(identityName ?? '', identityAddress ?? null);

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.xProfileImageUrl]);

  return (
    <Link
      href="/profile"
      aria-label={t.profile}
      className="group relative inline-flex min-h-11 max-w-[min(240px,calc(100vw-112px))] shrink-0 items-center gap-2 rounded-full border border-[var(--color-line-strong)] py-1 ps-1 pe-2.5 text-[var(--color-ink-dim)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:max-w-[min(240px,45vw)]"
    >
        <span className="relative grid size-9 shrink-0 place-items-center overflow-visible rounded-full bg-[var(--color-surface)] text-[11px] font-semibold tracking-[0.04em] text-[var(--color-ink)] sm:size-10">
          <span className="grid size-full place-items-center overflow-hidden rounded-full">
            {xImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={xImage}
                alt=""
                width={40}
                height={40}
                className="size-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : identityAddress ? (
              <WalletAvatar address={identityAddress} size={40} />
            ) : (
              initials
            )}
          </span>
          {profileActionCount > 0 ? <ActionBeacon className="absolute -bottom-0.5 -end-0.5" /> : null}
        </span>
        <span className="hidden min-w-0 max-w-[180px] truncate text-[14px] font-medium tracking-[-0.01em] text-[var(--color-ink)] sm:inline">
          {identityName}
        </span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden
          className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
        >
          <path d="M3 9h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </Link>
  );
}

function SettingsIconLink({ active }: { active: boolean }) {
  const t = useTranslations().nav;
  return (
    <Link
      href="/settings"
      aria-label={t.settingsAriaTitle}
      title={t.settingsAriaTitle}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors',
        active
          ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
          : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

function LaunchAppCTA() {
  return (
    <Link
      href="/app"
      className="group inline-flex min-h-11 items-center gap-1.5 px-4 sm:px-5 py-2.5 mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 shadow-[0_3px_0_rgba(0,0,0,0.22)] whitespace-nowrap"
      style={{
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      Open Karwan
      <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

function getProfileInitials(name: string, address: string | null): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const compact = name.replace(/[^\p{L}\p{N}]/gu, '');
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  if (address) return address.replace(/^0x/i, '').slice(0, 2).toUpperCase();
  return 'KW';
}
