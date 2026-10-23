'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { ConnectWalletButton } from './ConnectWallet';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { useEntryHref } from '@/shared/auth/useEntryHref';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { getShellSurface, isAssistantRoute, START_ROUTE, WALLET_HOME } from '@/shared/utils/routes';
import { AssistantModeSwitch } from './AssistantModeSwitch';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import type { UserProfile } from '@/core/api';
import { getProfileInitials } from './profileInitials';
import { LanguagePicker } from './LanguagePicker';
import { ThemeControl, ThemeIcon, useThemeCycle } from './ThemeControl';
import { Tooltip } from './Tooltip';
import { useSignOutRequest } from '@/features/profile/useSignOutRequest';
import { isAlwaysDarkRoute } from '@/shared/hooks/useTheme';
import { PublicMenu } from './PublicMenu';
import { Brand } from './Brand';
import { Icon } from './Icon';
import { MARKET_HREF, isMarketRoute } from './marketNav';

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
  const shell = getShellSurface(pathname, isAuthenticated);
  const publicSurface = shell === 'public';
  const workspaceSurface = shell === 'workspace' || shell === 'admin';
  const focusedSurface = shell === 'focused';
  const showAppChrome = (workspaceSurface || focusedSurface) && isAuthenticated;
  // Onboarding is a focused setup flow: strip the nav rail down to identity.
  // The full chrome returns once setup is complete.
  const showFullChrome = workspaceSurface && isAuthenticated;

  const discoverActive = isMarketRoute(pathname);

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
      data-chrome="nav"
      className={cn(
        'sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--lp-workspace-band)]',
        'product-surface',
      )}
    >
      <div className={cn(
        'mx-auto flex h-[64px] w-full items-center gap-2.5 px-4 sm:h-[72px] sm:gap-5 sm:px-6 lg:gap-8',
        publicSurface ? 'max-w-none' : 'max-w-[1600px]',
      )}>
        <div className={cn('flex min-w-0 shrink-0 items-center', publicSurface && 'max-[379px]:[&_span]:hidden max-[379px]:[&_a]:min-w-11')}>
          <Brand />
        </div>

        {publicSurface && <nav aria-label={t.footer.columns.product} className="hidden items-center gap-8 text-[14px] font-medium text-[var(--lp-dark)] lg:flex">
          <Link className="inline-flex min-h-11 items-center" href="/how-it-works">{t.footer.productLinks.howItWorks}</Link>
          {DEALS_AVAILABLE && <Link className="inline-flex min-h-11 items-center" href="/market">{t.nav.market}</Link>}
          <Link className="inline-flex min-h-11 items-center" href="/docs">{t.footer.productLinks.docs}</Link>
        </nav>}

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
                {/* On a phone the switch lives at the top of Profile; it stays here
                    while assistant mode is on, as the way back out. */}
                {showFullChrome ? (
                  <span className={shell === 'workspace' && !isAssistantRoute(pathname) ? 'hidden lg:contents' : 'contents'}>
                    <AssistantModeSwitch />
                  </span>
                ) : null}
                <NotificationBell />
                {/* Where the bottom bar shows, its Profile tab is the one
                    profile entry; the header pill returns on desktop. */}
                <ProfileLink
                  hideBelowLg={shell === 'workspace' && !isAssistantRoute(pathname)}
                  profileActionCount={openDeals.actionCount}
                  profile={profile}
                  identityName={profile?.displayName ?? authEmail?.split('@')[0] ?? ''}
                  identityAddress={profileAddress ?? authAddress}
                />
              </>
          ) : !publicSurface ? (
            // The account entry at /app owns its sole sign-in action. Its
            // header keeps reading preferences available without repeating it.
            // Other private-route gates retain the header entry action.
            <>
              {authLoading ? (
                <span
                  aria-hidden
                  className="inline-block rounded-full bg-[var(--color-surface-2)] motion-safe:animate-pulse motion-reduce:animate-none"
                  style={{ width: 132, height: 36 }}
                />
              ) : pathname === '/app' ? (
                <>
                  <LanguagePicker />
                </>
              ) : (
                <ConnectWalletButton />
              )}
            </>
          ) : (
            <>
              <LanguagePicker />
              {pathname === START_ROUTE ? null : <LaunchAppCTA />}
            </>
          )}
          {isAlwaysDarkRoute(pathname) ? null : <ThemeControl className={showFullChrome ? 'lg:hidden' : ''} />}
          {publicSurface ? <PublicMenu /> : null}
        </div>
      </div>
    </header>
    {showFullChrome && !isAssistantRoute(pathname) ? (
      <WorkspaceRail
        pathname={pathname}
        discoverHref={MARKET_HREF}
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
  discoverHref,
  discoverActive,
  financeEnabled,
  unread,
  financeLabel,
  soonLabel,
}: {
  pathname: string;
  discoverHref: string;
  discoverActive: boolean;
  financeEnabled: boolean;
  unread: boolean;
  financeLabel: string;
  soonLabel: string;
}) {
  const messages = useTranslations();
  const t = messages.nav;
  const signOut = useSignOutRequest();
  const financeActive = pathname.startsWith('/financier');
  const homeHref = DEALS_AVAILABLE ? '/app' : WALLET_HOME;
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

  const toggleRail = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem('karwan-workspace-rail-collapsed', next ? '1' : '0');
      } catch {
        // The rail remains usable even when the preference cannot persist.
      }
      return next;
    });
  }, []);

  // The same key as most desktop apps with a sidebar: Ctrl B, or Command B on
  // a Mac. Left alone while someone is typing.
  const [shortcut, setShortcut] = useState('Ctrl B');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘B');
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      toggleRail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleRail]);

  return (
    <aside
      data-chrome="workspace-rail"
      className="pointer-events-none fixed inset-y-0 start-0 z-20 hidden w-full lg:block"
      style={{ top: 'calc(var(--lp-nav-h, 72px) + 16px)' }}
    >
      <nav
        id="workspace-navigation"
        aria-label={t.railLabel}
        className={cn(
          'pointer-events-auto absolute top-0 bottom-6 flex flex-col gap-1 transition-[width] duration-300 ease-out',
          collapsed ? 'w-[72px]' : 'w-[220px]',
        )}
        style={{ insetInlineStart: 'max(20px, calc(50% - 800px))' }}
      >
        {/* The toggle sits on the icon column: centred when collapsed, and under
            the icons (16px padding plus half a 22px icon) when open. */}
        <Tooltip label={collapsed ? t.railExpandAria : t.railCollapseAria} shortcut={shortcut} side="end" className={cn('mb-1', collapsed ? 'self-center' : 'ms-[5px] self-start')}>
          <button
            type="button"
            data-chrome="workspace-rail-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t.railExpandAria : t.railCollapseAria}
            onClick={toggleRail}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] text-[var(--color-ink-dim)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            aria-controls="workspace-navigation"
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" className="rtl:-scale-x-100">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </Tooltip>
        <RailLink href={homeHref} active={pathname === homeHref} icon="home" collapsed={collapsed} ariaLabel={t.home}>
          {t.home}
        </RailLink>
        {DEALS_AVAILABLE && (
        <>
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
        </>
        )}
        <RailLink href="/activity" active={pathname.startsWith('/activity')} icon="activity" collapsed={collapsed} signal={unread} ariaLabel={t.activity}>
          {t.activity}
        </RailLink>
        {/* Account housekeeping sits at the foot, apart from the places you work. */}
        <div data-rail-footer className="mt-auto flex flex-col gap-1">
          <RailTheme collapsed={collapsed} />
          <RailLink href="/settings" active={pathname.startsWith('/settings')} icon="settings" collapsed={collapsed} ariaLabel={t.settingsAriaTitle}>
            {t.settingsAriaTitle}
          </RailLink>
          <RailAction onClick={() => void signOut.request()} busy={signOut.busy} icon="signOut" collapsed={collapsed}>
            {signOut.busy ? messages.profileSignOut.pending : messages.common.signOut}
          </RailAction>
          {signOut.error && !collapsed ? (
            <p role="alert" className="px-4 text-[14px] leading-snug text-[var(--color-ink-dim)] font-medium">{messages.profileSignOut.error}</p>
          ) : null}
        </div>
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
  icon: RailIconName;
  children: React.ReactNode;
  ariaLabel?: string;
  collapsed?: boolean;
  badge?: string;
  signal?: boolean;
}) {
  const link = (
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
          className="mono rounded-full px-2 py-1 text-[13px] font-semibold uppercase tracking-[0.12em]"
          style={{ background: 'color-mix(in oklab, var(--lp-accent) 20%, transparent)', color: 'var(--color-ink)' }}
        >
          {badge}
        </span>
      ) : signal ? (
        <span aria-hidden className={cn('size-2 rounded-full bg-[var(--lp-accent)]', collapsed ? 'absolute end-2 top-2' : '')} />
      ) : null}
    </Link>
  );
  // Collapsed, the icon stands alone, so it names itself on hover.
  return collapsed ? <Tooltip label={children as string} side="end" className="w-full">{link}</Tooltip> : link;
}

/// Theme in the rail: the same cycle as the top bar's button, named, with
/// the icon showing the current choice. The name of the choice is read out,
/// not printed, so the row stays one plain word.
function RailTheme({ collapsed }: { collapsed: boolean }) {
  const theme = useThemeCycle();
  const button = (
    <button
      type="button"
      onClick={theme.cycle}
      aria-label={theme.label}
      data-theme-preference={theme.current}
      className={cn(
        'flex min-h-12 w-full items-center rounded-full text-[15px] font-medium text-[var(--color-ink-dim)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
      )}
    >
      <span aria-hidden className="grid size-[22px] shrink-0 place-items-center">
        <ThemeIcon preference={theme.current} />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-start', collapsed && 'sr-only')}>{theme.title}</span>
    </button>
  );
  return collapsed ? <Tooltip label={theme.label} side="end" className="w-full">{button}</Tooltip> : button;
}

type RailIconName = 'home' | 'trade' | 'discover' | 'finance' | 'activity' | 'settings' | 'signOut';

/// A rail row that does something instead of going somewhere.
function RailAction({
  onClick,
  busy,
  icon,
  collapsed,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  icon: RailIconName;
  collapsed: boolean;
  children: string;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      aria-haspopup="dialog"
      aria-label={collapsed ? children : undefined}
      className={cn(
        'group relative flex min-h-12 w-full items-center rounded-full text-[15px] font-medium text-[var(--color-ink-dim)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:cursor-wait disabled:opacity-60',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
      )}
    >
      <RailIcon name={icon} active={false} />
      <span className={cn('min-w-0 flex-1 truncate text-start', collapsed && 'sr-only')}>{children}</span>
    </button>
  );
  return collapsed ? <Tooltip label={children} side="end" className="w-full">{button}</Tooltip> : button;
}

function RailIcon({ name, active }: { name: RailIconName; active: boolean }) {
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
      ) : name === 'settings' ? (
        <>
          <path d="M10.3 3.6a1.7 1.7 0 0 1 3.4 0l.2 1.3a7 7 0 0 1 1.9 1.1l1.2-.5a1.7 1.7 0 0 1 2.1.8l.4.7a1.7 1.7 0 0 1-.4 2.2l-1 .8a7 7 0 0 1 0 2.1l1 .8a1.7 1.7 0 0 1 .4 2.2l-.4.7a1.7 1.7 0 0 1-2.1.8l-1.2-.5a7 7 0 0 1-1.9 1.1l-.2 1.3a1.7 1.7 0 0 1-3.4 0l-.2-1.3a7 7 0 0 1-1.9-1.1l-1.2.5a1.7 1.7 0 0 1-2.1-.8l-.4-.7a1.7 1.7 0 0 1 .4-2.2l1-.8a7 7 0 0 1 0-2.1l-1-.8a1.7 1.7 0 0 1-.4-2.2l.4-.7a1.7 1.7 0 0 1 2.1-.8l1.2.5a7 7 0 0 1 1.9-1.1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        </>
      ) : name === 'signOut' ? (
        <path d="M10 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3m7-12 4 4-4 4m-8-4h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100 origin-center" />
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
        'relative flex h-full items-center px-3 text-[14px] font-semibold tracking-[0.01em] transition-colors',
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
        'relative inline-flex h-full items-center gap-1.5 whitespace-nowrap px-3 text-[14px] font-semibold tracking-[0.01em] transition-colors',
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
        className="mono whitespace-nowrap px-1.5 py-[2px] text-[13px] font-bold uppercase tracking-[0.12em]"
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
  hideBelowLg = false,
  profileActionCount,
  profile,
  identityName,
  identityAddress,
}: {
  hideBelowLg?: boolean;
  profileActionCount: number;
  profile?: UserProfile | null;
  identityName?: string;
  identityAddress?: string | null;
}) {
  const messages = useTranslations();
  const t = messages.nav;
  const [imageFailed, setImageFailed] = useState(false);
  const photo = !imageFailed ? (profile?.profileImageDataUrl || profile?.xProfileImageUrl)?.trim() : undefined;
  const initials = getProfileInitials(identityName ?? '', identityAddress ?? null);

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.profileImageDataUrl, profile?.xProfileImageUrl]);

  const label = identityName ? t.profileOf.replace('{name}', identityName) : t.profile;

  return (
    <Link
      href="/profile"
      aria-label={label}
      className={`relative ${hideBelowLg ? 'hidden lg:grid' : 'grid'} size-10 shrink-0 place-items-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[14px] font-semibold tracking-[0.04em] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]`}
    >
      <span className="grid size-full place-items-center overflow-hidden rounded-full">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={40} height={40} className="size-full object-cover" onError={() => setImageFailed(true)} />
        ) : (
          initials
        )}
      </span>
      {/* The dot rests on the whole photo: no backing disc cutting into it. */}
      {profileActionCount > 0 ? (
        <span aria-hidden className="pointer-events-none absolute -end-0.5 -top-0.5 z-10 size-2.5 rounded-full bg-[var(--lp-accent)] shadow-[0_0_0_1.5px_var(--color-surface)]" />
      ) : null}
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
  const label = useTranslations().nav.openApp;
  const href = useEntryHref();
  return (
    <Link
      href={href}
      className="hidden min-h-12 items-center gap-2 rounded-full bg-[var(--tint)] px-5 text-[14px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] hover:bg-[color-mix(in_srgb,var(--tint)_92%,var(--ink))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] md:inline-flex"
    >
      {label}
      <Icon name="arrow-right" size={16} directional />
    </Link>
  );
}
