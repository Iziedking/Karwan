'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Landing routes are always dark, so the footer forces the dark palette there.
// App routes get no override, so the footer follows the light/dark theme toggle
// — white in white mode, dark in dark mode — exactly like the top nav.
const DARK_SHELL_VARS = {
  '--color-surface': '#0e0e0e',
  '--color-surface-2': 'rgba(255,255,255,0.07)',
  '--color-line': 'rgba(255,255,255,0.10)',
  '--color-line-strong': 'rgba(255,255,255,0.22)',
  '--color-ink': '#f4f0ff',
  '--color-ink-dim': '#9a9a9a',
  '--color-ink-faint': '#6b6b6b',
} as React.CSSProperties;

export function SiteFooter() {
  const pathname = usePathname();
  const isApp = pathname !== '/' && pathname !== '/how-it-works';

  return (
    <footer
      style={isApp ? undefined : DARK_SHELL_VARS}
      className="bg-[var(--color-surface)] text-[var(--color-ink)] border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1 space-y-3">
          <p className="font-sans text-[18px] font-bold tracking-[-0.02em]">Karwan</p>
          <p className="text-[12px] text-[var(--color-ink-dim)] leading-relaxed max-w-[30ch]">
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
          <FooterLink href="/how-it-works#faq">FAQs</FooterLink>
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
        <div className="mx-auto max-w-[1240px] px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SocialTile href="https://www.linkedin.com" label="LinkedIn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3-.02-2.95-1.8-2.95-1.8 0-2.07 1.4-2.07 2.85V21h-4z" />
              </svg>
            </SocialTile>
            <SocialTile href="https://discord.com" label="Discord">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19.3 5.3A17 17 0 0 0 15.1 4l-.25.45a15.7 15.7 0 0 1 3.6 1.16 13 13 0 0 0-11 0A15.7 15.7 0 0 1 11.1 4.45L10.85 4a17 17 0 0 0-4.2 1.3C4 9.3 3.3 13.2 3.65 17a17.3 17.3 0 0 0 5.2 2.6l.62-1.04a11 11 0 0 1-1.74-.83l.43-.32a12 12 0 0 0 10.1 0l.43.32c-.55.33-1.13.6-1.74.83l.62 1.04a17.3 17.3 0 0 0 5.2-2.6c.43-4.5-.66-8.37-3-11.7zM9.7 14.6c-1.02 0-1.86-.93-1.86-2.07 0-1.14.82-2.07 1.86-2.07s1.88.94 1.86 2.07c0 1.14-.83 2.07-1.86 2.07zm4.6 0c-1.02 0-1.86-.93-1.86-2.07 0-1.14.82-2.07 1.86-2.07s1.88.94 1.86 2.07c0 1.14-.82 2.07-1.86 2.07z" />
              </svg>
            </SocialTile>
            <SocialTile href="https://x.com" label="X">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.4 2H8l4.7 6.2L18.9 2zm-1.1 18.1h1.7L7.3 3.8H5.5l12.3 16.3z" />
              </svg>
            </SocialTile>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-dim)]">
            <span>© 2026 Karwan</span>
            <span className="mono">cross-border settlement on USDC</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// TODO: swap the platform roots for Karwan's real social handles.
function SocialTile({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-ink)] transition-colors duration-200 hover:border-[var(--color-line-strong)]"
    >
      {children}
    </a>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)]">
        {title}
      </p>
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
  children: ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors inline-flex items-center gap-1 w-fit"
      >
        <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
          {children}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        >
          <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </a>
    );
  }
  return (
    <Link
      href={href}
      className="group text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors inline-flex items-center gap-1.5 w-fit"
    >
      <span
        aria-hidden
        className="inline-block w-0 h-px bg-current opacity-0 group-hover:opacity-100 group-hover:w-3 transition-[width,opacity] duration-200"
      />
      <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
        {children}
      </span>
    </Link>
  );
}
