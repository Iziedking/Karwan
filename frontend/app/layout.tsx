import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { TopNav } from '@/shared/components/TopNav';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Karwan · cross-border SME settlement',
  description:
    'Agent-mediated, USDC-settled, milestone-escrowed deals on Arc. Built on Circle. For the MEASA corridor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <div className="min-h-screen flex flex-col">
          <TopNav />
          <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-10">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] mt-20 bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1 space-y-3">
          <p className="text-[15px] font-semibold tracking-tight">Karwan</p>
          <p className="text-[12px] text-[var(--color-ink-dim)] leading-relaxed">
            Settlement and reputation rails for cross-border SME trade on Arc.
          </p>
        </div>
        <FooterCol title="Product">
          <FooterLink href="/buyer">Buyer dashboard</FooterLink>
          <FooterLink href="/seller">Seller dashboard</FooterLink>
          <FooterLink href="/activity">Activity feed</FooterLink>
        </FooterCol>
        <FooterCol title="Resources">
          <FooterLink href="/how-it-works">How it works</FooterLink>
          <FooterLink href="/how-it-works#faq">FAQ</FooterLink>
          <FooterLink href="https://testnet.arcscan.app" external>
            Arc Testnet Explorer
          </FooterLink>
        </FooterCol>
        <FooterCol title="Network">
          <FooterLink href="https://docs.arc.network" external>
            Arc Docs
          </FooterLink>
          <FooterLink href="https://developers.circle.com" external>
            Circle Docs
          </FooterLink>
          <FooterLink href="https://faucet.circle.com" external>
            USDC Faucet
          </FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-[var(--color-line)]">
        <div className="mx-auto max-w-6xl px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--color-ink-faint)]">
          <span>© 2026 Karwan · Arc Testnet (chain 5042002)</span>
          <span className="mono">cross-border settlement on USDC</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors inline-flex items-center gap-1"
      >
        {children}
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </a>
    );
  }
  return (
    <Link
      href={href}
      className="text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
    >
      {children}
    </Link>
  );
}
