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
              Home
            </NavLink>
            <NavLink
              href="/buyer"
              active={
                pathname.startsWith('/buyer') ||
                pathname.startsWith('/jobs') ||
                pathname.startsWith('/deals')
              }
            >
              Buyer
            </NavLink>
            <NavLink href="/seller" active={pathname.startsWith('/seller')}>
              Seller
            </NavLink>
            <NavLink href="/listings" active={pathname.startsWith('/listings')}>
              Market
            </NavLink>
            <NavLinkSoon title="Karwan for institutional SME trades. Bring-your-own-agent settlement on Arc. Shipping after the first pilot.">
              SME Trades
            </NavLinkSoon>
            <NavLink href="/activity" active={pathname.startsWith('/activity')}>
              Activity
            </NavLink>
            <NavLink href="/stake" active={pathname.startsWith('/stake')}>
              Stake
            </NavLink>
            <NavLink href="/profile" active={pathname.startsWith('/profile')}>
              Profile
            </NavLink>
            <ExternalNavLink href="https://testnet.arcscan.app">Explorer</ExternalNavLink>
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
              </div>
              <div className="md:hidden inline-flex">
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
              Home
            </MobileNavLink>
            <MobileNavLink
              href="/buyer"
              active={
                pathname.startsWith('/buyer') ||
                pathname.startsWith('/jobs') ||
                pathname.startsWith('/deals')
              }
            >
              Buyer
            </MobileNavLink>
            <MobileNavLink href="/seller" active={pathname.startsWith('/seller')}>
              Seller
            </MobileNavLink>
            <MobileNavLink href="/listings" active={pathname.startsWith('/listings')}>
              Market
            </MobileNavLink>
            <MobileNavLinkSoon>SME Trades</MobileNavLinkSoon>
            <MobileNavLink href="/activity" active={pathname.startsWith('/activity')}>
              Activity
            </MobileNavLink>
            <MobileNavLink href="/stake" active={pathname.startsWith('/stake')}>
              Stake
            </MobileNavLink>
            <MobileNavLink href="/profile" active={pathname.startsWith('/profile')}>
              Profile
            </MobileNavLink>
            <a
              href="https://testnet.arcscan.app"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2.5 rounded-md text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors inline-flex items-center justify-between"
            >
              <span>Explorer</span>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M5.5 4.5h6v6M11 5l-6.5 6.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </a>
            <div className="mt-2 pt-2 border-t border-[var(--color-line)] flex items-center justify-around text-[12px] text-[var(--color-ink-dim)]">
              <SoundToggle />
              <ThemeToggle />
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

function ExternalNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group px-3 pr-3.5 py-1.5 rounded-full text-[13px] font-semibold tracking-[-0.005em] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors inline-flex items-center gap-1"
    >
      {children}
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      >
        <path
          d="M5.5 4.5h6v6M11 5l-6.5 6.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </a>
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
