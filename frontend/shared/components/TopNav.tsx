'use client';
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

// The landing routes are always dark, so the nav forces the dark palette there
// by overriding the themeable --color-* tokens for the subtree. App routes get
// no override, so the nav follows the light/dark theme toggle — white in white
// mode, dark in dark mode — and every embedded control comes along for free.
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

  return (
    <header
      style={isApp ? undefined : DARK_NAV_VARS}
      className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--color-surface)]/85 border-b border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1240px] px-6 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5">
            {/* Fixed-dark logo tile so the lime mark reads on a white or dark bar. */}
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#0e0e0e] border border-white/10 text-[var(--lp-accent)]">
              <Logo />
            </span>
            <span className="font-sans text-[18px] font-bold tracking-[-0.02em] text-[var(--color-ink)]">
              Karwan
            </span>
          </Link>
          {isApp && (
            <nav className="hidden md:flex items-center gap-1 text-[13px]">
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
              <NavLink href="/activity" active={pathname.startsWith('/activity')}>
                Activity
              </NavLink>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-full text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors inline-flex items-center gap-1"
              >
                Explorer
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M5.5 4.5h6v6M11 5l-6.5 6.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </a>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {isApp ? (
            <>
              <div className="hidden lg:block">
                <BalanceRail />
              </div>
              <LiveDot />
              <NotificationBell />
              <SoundToggle />
              <ThemeToggle />
              <ConnectWalletButton />
              <ProfileAvatar />
            </>
          ) : (
            <>
              <SoundToggle />
              <ThemeToggle />
              <Link
                href="/app"
                className="px-4 py-2 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] text-[13px] font-semibold hover:bg-[var(--lp-accent-hover)] transition-colors inline-flex items-center gap-1.5"
              >
                Launch app
                <span aria-hidden>→</span>
              </Link>
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
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'px-3.5 py-1.5 rounded-full font-medium transition-colors',
        active
          ? 'bg-[var(--color-ink)] text-[var(--color-surface)]'
          : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {children}
    </Link>
  );
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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
