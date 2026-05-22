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
  const { isAuthenticated } = useAuth();

  const tradesActive =
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
          {isApp && (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
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

        {/* CENTER. floating pill nav (app only) */}
        {isApp && (
          <nav
            className="hidden md:inline-flex items-center gap-0.5 mx-auto px-1.5 py-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-14px_rgba(0,0,0,0.18)]"
          >
            <NavLink href="/app" active={pathname === '/app'}>
              {t.nav.home}
            </NavLink>
            <TradesDropdown active={tradesActive} />
            <NavLink
              href="/market"
              active={pathname.startsWith('/market') || pathname.startsWith('/listings')}
            >
              Market
            </NavLink>
            <NavLink href="/bridge" active={pathname.startsWith('/bridge')}>
              Bridge
            </NavLink>
            <NavLinkSoon title="Karwan for institutional SME trades. Bring-your-own-agent settlement on Arc. Shipping after the first pilot.">
              SME Trades
            </NavLinkSoon>
            <NavLink href="/activity" active={pathname.startsWith('/activity')}>
              {t.nav.activity}
            </NavLink>
            <NavLink href="/stake" active={pathname.startsWith('/stake')}>
              {t.nav.stake}
            </NavLink>
            <NavLink href="/profile" active={pathname.startsWith('/profile')}>
              {t.nav.profile}
            </NavLink>
          </nav>
        )}

        {/* RIGHT. control cluster */}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
          {isApp ? (
            <>
              <div className="hidden lg:inline-flex items-center pl-3 pr-3 py-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] mono shrink-0 whitespace-nowrap">
                <BalanceRail />
              </div>
              <div className="hidden md:inline-flex">
                <LiveDot />
              </div>
              <div className="hidden md:inline-flex items-center gap-0.5 px-1 py-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">
                <NotificationBell />
                <SoundToggle />
                <ThemeToggle />
                {isAuthenticated && (
                  <SettingsIconLink active={pathname.startsWith('/settings')} />
                )}
              </div>
              {/* Mobile keeps only the bell up top. Settings moves into the menu
                  footer (below) so the wallet pill isn't squeezed off-screen. */}
              <div className="md:hidden inline-flex items-center gap-0.5">
                <NotificationBell />
              </div>
              <ConnectWalletButton />
              <ProfileAvatar />
            </>
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

      {isApp && menuOpen && (
        <div
          className="md:hidden absolute left-0 right-0 top-full bg-[var(--color-surface)] border-b border-[var(--color-line)] shadow-sm fade-up"
          onClick={() => setMenuOpen(false)}
        >
          <nav className="px-4 py-3 flex flex-col text-[14px]">
            <MobileNavLink href="/app" active={pathname === '/app'}>
              {t.nav.home}
            </MobileNavLink>
            {/* Trades group: buyer + seller, labelled so the two desks read as
                distinct surfaces, not a flat list. */}
            <p className="px-3 pt-3 pb-1 mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
              Trades
            </p>
            <MobileNavLink
              href="/buyer"
              active={
                pathname.startsWith('/buyer') ||
                pathname.startsWith('/jobs') ||
                pathname.startsWith('/deals')
              }
            >
              {t.nav.buyer}
            </MobileNavLink>
            <MobileNavLink href="/seller" active={pathname.startsWith('/seller')}>
              {t.nav.seller}
            </MobileNavLink>
            <div className="my-1.5 border-t border-[var(--color-line)]" />
            <MobileNavLink
              href="/market"
              active={pathname.startsWith('/market') || pathname.startsWith('/listings')}
            >
              Market
            </MobileNavLink>
            <MobileNavLink href="/bridge" active={pathname.startsWith('/bridge')}>
              Bridge
            </MobileNavLink>
            <MobileNavLinkSoon>SME Trades</MobileNavLinkSoon>
            <MobileNavLink href="/activity" active={pathname.startsWith('/activity')}>
              {t.nav.activity}
            </MobileNavLink>
            <MobileNavLink href="/stake" active={pathname.startsWith('/stake')}>
              {t.nav.stake}
            </MobileNavLink>
            <MobileNavLink href="/profile" active={pathname.startsWith('/profile')}>
              {t.nav.profile}
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
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
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
function NavLinkSoon({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-disabled="true"
      className="px-4 py-1.5 rounded-full text-[13px] font-semibold tracking-[-0.005em] text-[var(--color-ink-faint)] cursor-not-allowed inline-flex items-center gap-1.5 whitespace-nowrap select-none"
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
        soon
      </span>
    </span>
  );
}

function MobileNavLinkSoon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-disabled="true"
      className="px-3 py-2.5 rounded-md font-medium text-[var(--color-ink-faint)] cursor-not-allowed inline-flex items-center justify-between select-none"
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
        soon
      </span>
    </span>
  );
}

/// Buyer + Seller collapse into one "Trades" rail slot. The dropdown gives each
/// desk its own labelled row with a distinct accent dot, so the two surfaces
/// read as separate, not a flat list. Hover-opens on desktop; chevron rotates.
function TradesDropdown({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'px-4 py-1.5 rounded-full text-[13px] font-semibold tracking-[-0.005em] transition-colors inline-flex items-center gap-1.5',
          active
            ? 'bg-[var(--color-ink)] text-[var(--color-surface)] shadow-[0_2px_0_rgba(0,0,0,0.15)]'
            : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
        )}
      >
        Trades
        <svg
          width="9"
          height="9"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={cn('transition-transform duration-200', open && 'rotate-180')}
        >
          <path
            d="M3 6l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-40">
          <div
            className="w-[300px] p-2 border bg-[var(--color-surface)] fade-up"
            style={{
              borderColor: 'var(--color-line)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 4,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 50px -18px rgba(0,0,0,0.28)',
            }}
          >
            <TradesItem
              href="/buyer"
              title="Buyer desk"
              sub="Post a brief. Agents run the auction."
              accent="var(--lp-accent)"
            />
            <div className="my-1 h-px" style={{ background: 'var(--color-line)' }} />
            <TradesItem
              href="/seller"
              title="Seller desk"
              sub="Post a listing. Take incoming deals."
              accent="#7CC2FF"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TradesItem({
  href,
  title,
  sub,
  accent,
}: {
  href: string;
  title: string;
  sub: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--color-surface-2)] transition-colors"
    >
      <span
        aria-hidden
        className="mt-1.5 w-1.5 h-1.5 shrink-0"
        style={{ background: accent, borderRadius: 1 }}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-[14px] font-bold tracking-[-0.01em] text-[var(--color-ink)]">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[var(--color-ink-dim)]">
          {sub}
        </span>
      </span>
      <span
        aria-hidden
        className="self-center text-[var(--color-ink-faint)] transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}

function SettingsIconLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      title="Settings"
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
