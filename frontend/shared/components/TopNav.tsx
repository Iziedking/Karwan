'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { ConnectWalletButton } from './ConnectWallet';
import { ThemeToggle } from './ThemeToggle';
import { SoundToggle } from './SoundToggle';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { ProfileAvatar } from './ProfileAvatar';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { isBusinessAccount } from '@/features/account/accountKind';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { getShellSurface } from '@/shared/utils/routes';

// Landing routes are forced dark via these var overrides, so every embedded
// child (bell, toggles, ConnectWalletButton) picks up dark mode without each
// one knowing about route context.
const DARK_NAV_VARS = {
  '--color-surface': '#0e0e0e',
  '--color-surface-2': 'rgba(255,255,255,0.07)',
  '--color-line': 'rgba(255,255,255,0.10)',
  '--color-line-strong': 'rgba(255,255,255,0.22)',
  '--color-ink': '#f4f0ff',
  '--color-ink-dim': '#9a9a9a',
  '--color-ink-faint': '#6b6b6b',
} as React.CSSProperties;

export function TopNav() {
  const a11y = useTranslations().a11y;
  const pathname = usePathname();
  const t = useTranslations();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { profile } = useUserProfile();
  // Business and individual are two separate rails. A business sees B2B Trades
  // and the SME-rail home; an individual sees P2P Trades. The Financier desk is
  // shown to both (anyone can provide capital). Until the profile loads we treat
  // the account as a person so the nav never flashes business items to an
  // individual.
  const biz = isBusinessAccount(profile);
  const shell = getShellSurface(pathname, isAuthenticated);
  const publicSurface = shell === 'public';
  const workspaceSurface = shell === 'workspace' || shell === 'admin';
  const focusedSurface = shell === 'focused';
  const showAppChrome = (workspaceSurface || focusedSurface) && isAuthenticated;
  // Onboarding is a focused setup flow: strip the nav rail down to identity and
  // the compact theme control. The full chrome returns once setup is complete.
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

  return (
    <header
      style={publicSurface ? DARK_NAV_VARS : undefined}
      className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--color-surface)]/85 border-b border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-[68px] flex items-center gap-3 sm:gap-5 lg:gap-8">
        {/* LEFT. The mark alone, and it always goes to the landing page.
            It used to sit beside a KARWAN wordmark and route to /app inside the
            product, which made the one element every page shares mean two
            different things depending on where you were. */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0 shrink-0">
          <Link href="/" aria-label="Karwan" className="group inline-flex items-center shrink-0">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-14 h-14 border border-white/10 text-[var(--lp-accent)] shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-transform duration-200 group-hover:-translate-y-0.5"
              style={{
                background: '#0e0e0e',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
              }}
            >
              <Logo />
            </span>
          </Link>
        </div>

        {publicSurface && (
          <nav className="mx-auto hidden h-full items-center gap-7 md:flex">
            <PublicNavLink href="/how-it-works" active={pathname.startsWith('/how-it-works')}>
              {t.footer.productLinks.howItWorks}
            </PublicNavLink>
            <PublicNavLink href="/market" active={discoverActive}>
              {t.nav.market}
            </PublicNavLink>
            <PublicNavLink href="/docs" active={pathname.startsWith('/docs')}>
              {t.footer.productLinks.docs}
            </PublicNavLink>
          </nav>
        )}

        {/* Desktop workspace navigation is task-based and flat. The active
            indicator slides between destinations without turning the header
            into a row of nested pills. Mobile uses WorkspaceBottomNav. */}
        {showFullChrome && (
          <nav className="mx-auto hidden h-full items-center gap-1 lg:flex">
            <NavLink
              href="/app"
              active={pathname === '/app'}
              title={t.nav.hints.home}
            >
              {t.nav.home}
            </NavLink>
            <NavLink href={biz ? '/b2b' : '/p2p'} active={tradesActive}>
              {t.nav.trades}
            </NavLink>
            <NavLink
              href={discoverHref}
              active={discoverActive}
              title={t.nav.hints.market}
            >
              {t.nav.market}
            </NavLink>
            {SME_TRADES_ENABLED ? (
              <NavLink
                href="/financier"
                active={pathname.startsWith('/financier')}
                title={a11y.fundFactoringAndPos}
              >
                {t.nav.finance}
              </NavLink>
            ) : (
              <NavLinkSoon
                href="/financier"
                active={pathname.startsWith('/financier')}
                title={a11y.fundFactoringAndPos}
                soonLabel={t.nav.soonBadge}
              >
                {t.nav.finance}
              </NavLinkSoon>
            )}
            <NavLink
              href="/activity"
              active={pathname.startsWith('/activity')}
              title={t.nav.hints.activity}
            >
              {t.nav.activity}
            </NavLink>
          </nav>
        )}

        {/* INLINE-END. control cluster */}
        <div className="ms-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
          {focusedSurface ? (
            <>
              <ThemeToggle />
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
                <div className="hidden md:inline-flex items-center gap-0.5 px-1 py-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">
                  <NotificationBell />
                  <QuickControls
                    isAuthenticated={isAuthenticated}
                    settingsActive={pathname.startsWith('/settings')}
                  />
                </div>
                {/* Mobile keeps the high-signal bell and a compact preferences
                    menu. Theme, sound, reputation, profile, help, and settings
                    remain one thumb away instead of disappearing at small widths. */}
                <div className="md:hidden inline-flex items-center gap-0.5">
                  <NotificationBell />
                  <QuickControls
                    isAuthenticated={isAuthenticated}
                    settingsActive={pathname.startsWith('/settings')}
                  />
                </div>
                <ConnectWalletButton />
                <span className="hidden md:inline-flex"><ProfileAvatar /></span>
              </>
          ) : !publicSurface ? (
            // Signed-out app chrome: just the Sign in button. Don't tease the
            // app surface (nav rail, balance, bell, settings) before the user
            // has signed in. While auth is still resolving, reserve the same
            // approximate width so the bar doesn't shift content once the
            // button paints. This was one of the dominant CLS contributors
            // across every app route (RES dashboard, last 7 days).
            authLoading ? (
              <span
                aria-hidden
                className="inline-block rounded-full bg-[var(--color-surface-2)] motion-safe:animate-pulse motion-reduce:animate-none"
                style={{ width: 132, height: 36 }}
              />
            ) : (
              <ConnectWalletButton />
            )
          ) : (
            <>
              <div className="hidden sm:inline-flex">
                <ThemeToggle />
              </div>
              <div className="md:hidden inline-flex">
                <ThemeToggle />
              </div>
              <LaunchAppCTA />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
  title,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  /// Plain-language accessible name for labels that benefit from more context.
  /// Browser-default tooltips are intentionally avoided.
  title?: string;
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
      <span>{children}</span>
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

function PublicNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-full items-center mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
        active ? 'text-white' : 'text-white/56 hover:text-white',
      )}
    >
      {children}
      {active ? (
        <motion.span
          layoutId="public-nav-active"
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--lp-accent)]"
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : null}
    </Link>
  );
}

/// Collapses the low-frequency controls (theme, sound, settings) behind a single
/// overflow button so the top bar shows fewer icons. Theme and sound also live
/// on the Settings page; keeping them here means logged-out visitors can still
/// reach them. Notifications stay outside this menu since unread count is
/// high-signal and should be visible at a glance.
function QuickControls({
  isAuthenticated,
  settingsActive,
}: {
  isAuthenticated: boolean;
  settingsActive: boolean;
}) {
  const t = useTranslations().nav;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.preferencesAria}
        aria-expanded={open}
        aria-controls={menuId}
        className={cn(
          'inline-flex items-center justify-center w-11 h-11 rounded-full transition-colors',
          open || settingsActive
            ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
            : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.35" />
          <circle cx="8" cy="8" r="1.35" />
          <circle cx="13" cy="8" r="1.35" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute end-0 top-full z-50 pt-2 max-md:fixed max-md:inset-x-4 max-md:top-[76px] max-md:w-auto"
        >
          <div
            role="menu"
            className="w-[min(302px,calc(100vw-32px))] p-2 border bg-[var(--color-surface)] fade-up"
            style={{
              borderColor: 'var(--color-line)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 4,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 50px -18px rgba(0,0,0,0.28)',
            }}
          >
            <ControlRow label={t.controlLabels.theme}>
              <ThemeToggle />
            </ControlRow>
            <ControlRow label={t.controlLabels.sound}>
              <SoundToggle />
            </ControlRow>
            <div className="my-1 h-px" style={{ background: 'var(--color-line)' }} />
            <Link
              href="/how-it-works"
              className="flex min-h-11 items-center justify-between gap-3 px-2.5 py-2.5 rounded-lg text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <span>{t.help}</span>
              <span aria-hidden className="text-[var(--color-ink-faint)]">
                →
              </span>
            </Link>
            {isAuthenticated && (
              <>
                <div className="my-1 h-px" style={{ background: 'var(--color-line)' }} />
                <MenuLink href="/profile">{t.profile}</MenuLink>
                <MenuLink href="/stake">{t.reputation}</MenuLink>
                <Link
                  href="/settings"
                  className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span>{t.allSettings}</span>
                  <span aria-hidden className="text-[var(--color-ink-faint)]">
                    →
                  </span>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center justify-between gap-3 px-2.5 py-2.5 text-[13px] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)]"
      style={{ borderRadius: 8 }}
    >
      <span>{children}</span>
      <span aria-hidden className="text-[var(--color-ink-faint)]">→</span>
    </Link>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="menuitem" className="flex min-h-12 items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg">
      <span className="text-[13px] text-[var(--color-ink-dim)]">{label}</span>
      {children}
    </div>
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
        ↓
      </span>
    </Link>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 17 L10 7 L12 13 L14 7 L17 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
