'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LiveDot } from './LiveDot';
import { BalanceRail } from '@/features/balances/components/BalanceRail';
import { ConnectWalletButton } from './ConnectWallet';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { ProfileAvatar } from './ProfileAvatar';

export function TopNav() {
  const pathname = usePathname();
  const isApp = pathname !== '/' && pathname !== '/how-it-works';

  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]/90 backdrop-blur-md sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-[var(--color-ink)]">Karwan</span>
          </Link>
          {isApp && (
            <nav className="hidden md:flex items-center gap-1 text-[13px]">
              <NavLink href="/app" active={pathname === '/app'}>Home</NavLink>
              <NavLink href="/buyer" active={pathname.startsWith('/buyer') || pathname.startsWith('/jobs') || pathname.startsWith('/deals')}>Buyer</NavLink>
              <NavLink href="/seller" active={pathname.startsWith('/seller')}>Seller</NavLink>
              <NavLink href="/activity" active={pathname.startsWith('/activity')}>Activity</NavLink>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-md text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors inline-flex items-center gap-1"
              >
                Explorer
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </a>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isApp ? (
            <>
              <div className="hidden lg:block">
                <BalanceRail />
              </div>
              <LiveDot />
              <NotificationBell />
              <ThemeToggle />
              <ConnectWalletButton />
              <ProfileAvatar />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/app"
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
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

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1 rounded-md transition-colors ${
        active ? 'text-[var(--color-ink)] bg-[var(--color-surface-2)]' : 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      {children}
    </Link>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeOpacity="0.18" />
      <path d="M7 17 L10 7 L12 13 L14 7 L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
