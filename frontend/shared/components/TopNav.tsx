'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { LiveDot } from './LiveDot';
import { BalanceRail } from '@/features/balances/components/BalanceRail';
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

// Landing routes are forced dark via these var overrides, so every embedded
// child (BalanceRail, bell, toggles, ConnectWalletButton) picks up dark mode
// without each one knowing about route context.
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
  const pathname = usePathname();
  const isApp = pathname !== '/' && pathname !== '/how-it-works';
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { profile } = useUserProfile();
  // Business and individual are two separate rails. A business sees B2B Trades
  // and the SME-rail home; an individual sees P2P Trades. The Financier desk is
  // shown to both (anyone can provide capital). Until the profile loads we treat
  // the account as a person so the nav never flashes business items to an
  // individual.
  const biz = isBusinessAccount(profile);
  const showAppChrome = isApp && isAuthenticated;

  const tradesActive =
    pathname.startsWith('/p2p') ||
    pathname.startsWith('/buyer') ||
    pathname.startsWith('/seller') ||
    pathname.startsWith('/jobs') ||
    pathname.startsWith('/deals');

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header
      style={isApp ? undefined : DARK_NAV_VARS}
      className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--color-surface)]/85 border-b border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-[68px] flex items-center gap-3 sm:gap-5 lg:gap-8">
        {/* LEFT. mobile toggle + logo */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0 shrink-0">
          {showAppChrome && (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? t.nav.menuCloseAria : t.nav.menuOpenAria}
              aria-expanded={menuOpen}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-[var(--color-line)] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                {menuOpen ? (
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M2 4h12M2 8h12M2 12h12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          )}
          <Link href="/" className="group inline-flex items-center gap-2.5 shrink-0">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-10 h-10 border border-white/10 text-[var(--lp-accent)] shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-transform duration-200 group-hover:-translate-y-0.5"
              style={{
                background: '#0e0e0e',
                borderTopLeftRadius: 11,
                borderTopRightRadius: 11,
                borderBottomLeftRadius: 11,
                borderBottomRightRadius: 3,
              }}
            >
              <Logo />
            </span>
            <span className="font-sans text-[18px] font-extrabold uppercase tracking-[-0.02em] text-[var(--color-ink)]">
              Karwan
            </span>
          </Link>
        </div>

        {/* CENTER. floating pill nav (app only, signed-in only). Hides the
            full app surface until the user has actually signed in so the
            shell stays minimal while the SignInGate is the only thing on
            the page. */}
        {showAppChrome && (
          <nav
            className="hidden md:inline-flex items-center gap-0.5 mx-auto px-1.5 py-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-14px_rgba(0,0,0,0.18)]"
          >
            <NavLink
              href="/app"
              active={pathname === '/app'}
              title={t.nav.hints.home}
            >
              {t.nav.home}
            </NavLink>
            <NavLink href={biz ? '/buyer' : '/p2p'} active={tradesActive}>
              {biz ? 'B2B Trades' : t.nav.trades}
            </NavLink>
            <NavLink
              href="/market"
              active={pathname.startsWith('/market') || pathname.startsWith('/listings')}
              title={t.nav.hints.market}
            >
              {t.nav.market}
            </NavLink>
            {SME_TRADES_ENABLED ? (
              <NavLink
                href="/financier"
                active={pathname.startsWith('/financier')}
                title="Fund factoring and purchase orders"
              >
                Financier
              </NavLink>
            ) : (
              <NavLinkSoon
                href="/financier"
                active={pathname.startsWith('/financier')}
                title="Fund factoring and purchase orders"
                soonLabel={t.nav.soonBadge}
              >
                Financier
              </NavLinkSoon>
            )}
            <NavLink
              href="/activity"
              active={pathname.startsWith('/activity')}
              title={t.nav.hints.activity}
            >
              {t.nav.activity}
            </NavLink>
            <NavLink
              href="/stake"
              active={pathname.startsWith('/stake')}
              title={t.nav.hints.stake}
            >
              {t.nav.stake}
            </NavLink>
            <NavLink
              href="/profile"
              active={pathname.startsWith('/profile')}
              title={t.nav.hints.profile}
            >
              {t.nav.profile}
            </NavLink>
          </nav>
        )}

        {/* INLINE-END. control cluster */}
        <div className="ms-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
          {showAppChrome ? (
            <>
              <div className="hidden lg:inline-flex items-center px-3 py-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] mono shrink-0 whitespace-nowrap">
                <BalanceRail />
              </div>
              <div className="hidden md:inline-flex">
                <LiveDot />
              </div>
              <div className="hidden md:inline-flex items-center gap-0.5 px-1 py-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">
                <NotificationBell />
                <QuickControls
                  isAuthenticated={isAuthenticated}
                  settingsActive={pathname.startsWith('/settings')}
                />
              </div>
              {/* Mobile keeps only the bell up top. Settings moves into the menu
                  footer (below) so the wallet pill isn't squeezed off-screen. */}
              <div className="md:hidden inline-flex items-center gap-0.5">
                <NotificationBell />
              </div>
              <ConnectWalletButton />
              <ProfileAvatar />
            </>
          ) : isApp ? (
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
                <SoundToggle />
              </div>
              <div className="hidden sm:inline-flex">
                <ThemeToggle />
              </div>
              <LaunchAppCTA />
            </>
          )}
        </div>
      </div>

      {showAppChrome && menuOpen && (
        <div
          className="md:hidden absolute start-0 end-0 top-full bg-[var(--color-surface)] border-b border-[var(--color-line)] shadow-sm fade-up"
          onClick={() => setMenuOpen(false)}
        >
          <nav className="px-4 py-3 flex flex-col text-[14px]">
            <MobileNavLink href="/app" active={pathname === '/app'}>
              {t.nav.home}
            </MobileNavLink>
            {/* The trades hub adapts to the rail: a business opens its B2B
                trade flow, an individual opens the P2P desk picker. */}
            <MobileNavLink
              href={biz ? '/buyer' : '/p2p'}
              active={
                pathname.startsWith('/p2p') ||
                pathname.startsWith('/buyer') ||
                pathname.startsWith('/seller') ||
                pathname.startsWith('/jobs') ||
                pathname.startsWith('/deals')
              }
            >
              {biz ? 'B2B Trades' : t.nav.trades}
            </MobileNavLink>
            <div className="my-1.5 border-t border-[var(--color-line)]" />
            <MobileNavLink
              href="/market"
              active={pathname.startsWith('/market') || pathname.startsWith('/listings')}
            >
              {t.nav.market}
            </MobileNavLink>
            {SME_TRADES_ENABLED ? (
              <MobileNavLink href="/financier" active={pathname.startsWith('/financier')}>
                Financier
              </MobileNavLink>
            ) : (
              <MobileNavLinkSoon
                href="/financier"
                active={pathname.startsWith('/financier')}
                soonLabel={t.nav.soonBadge}
              >
                Financier
              </MobileNavLinkSoon>
            )}
            <MobileNavLink href="/activity" active={pathname.startsWith('/activity')}>
              {t.nav.activity}
            </MobileNavLink>
            <MobileNavLink href="/stake" active={pathname.startsWith('/stake')}>
              {t.nav.stake}
            </MobileNavLink>
            <MobileNavLink href="/profile" active={pathname.startsWith('/profile')}>
              {t.nav.profile}
            </MobileNavLink>
            <div className="my-1.5 border-t border-[var(--color-line)]" />
            <MobileNavLink href="/how-it-works" active={pathname.startsWith('/how-it-works')}>
              {t.nav.help}
            </MobileNavLink>
            <div className="mt-2 pt-2 border-t border-[var(--color-line)] flex items-center justify-around text-[12px] text-[var(--color-ink-dim)]">
              <SoundToggle />
              <ThemeToggle />
              {isAuthenticated && (
                <SettingsIconLink active={pathname.startsWith('/settings')} />
              )}
              <LiveDot />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function MobileNavLink({
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
      className={cn(
        'px-3 py-2.5 rounded-md font-medium transition-colors',
        active
          ? 'bg-[var(--color-ink)] text-[var(--color-surface)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {children}
    </Link>
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
  /// Plain-language hover hint. Crypto and trade terms (Bridge, Stake, Market)
  /// are opaque to first-time users; the tooltip says what each one does in
  /// normal words without changing the rail's look.
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        'px-4 py-1.5 rounded-full text-[13px] font-semibold tracking-[-0.005em] transition-colors',
        active
          ? 'bg-[var(--color-ink)] text-[var(--color-surface)] shadow-[0_2px_0_rgba(0,0,0,0.15)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {children}
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
      title={title}
      className={cn(
        'px-4 py-1.5 rounded-full text-[13px] font-semibold tracking-[-0.005em] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap',
        active
          ? 'bg-[var(--color-ink)] text-[var(--color-surface)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      <span className="whitespace-nowrap">{children}</span>
      <span
        className="mono text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-[2px] whitespace-nowrap"
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

function MobileNavLinkSoon({
  href,
  active,
  children,
  soonLabel,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  soonLabel: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'px-3 py-2.5 rounded-md font-medium transition-colors inline-flex items-center justify-between',
        active
          ? 'bg-[var(--color-ink)] text-[var(--color-surface)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      <span>{children}</span>
      <span
        className="mono text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-[2px]"
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
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.preferencesAria}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors',
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
        <div className="absolute end-0 top-full pt-2 z-40">
          <div
            className="w-[224px] p-2 border bg-[var(--color-surface)] fade-up"
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
              className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <span>{t.help}</span>
              <span aria-hidden className="text-[var(--color-ink-faint)]">
                →
              </span>
            </Link>
            {isAuthenticated && (
              <>
                <div className="my-1 h-px" style={{ background: 'var(--color-line)' }} />
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

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg">
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
      className="group inline-flex items-center gap-1.5 px-4 sm:px-5 py-2.5 mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 shadow-[0_3px_0_rgba(0,0,0,0.22)] whitespace-nowrap"
      style={{
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      Launch app
      <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
        ↓
      </span>
    </Link>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
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
