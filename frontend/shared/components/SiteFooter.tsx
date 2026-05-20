'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// Phantom-grade footer: cream backdrop, big white inner card with asymmetric
/// rounded corners, logo+tagline block left of a three-column link grid,
/// operational status pill bottom-left, and a heroic editorial wordmark
/// below the card so the page closes on a brand moment. Always rendered on
/// the landing-page palette so the bottom of every route resolves to the
/// same visual chord.
export function SiteFooter() {
  return (
    <footer className="bg-[var(--lp-light)] text-[var(--lp-dark)]">
      <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] pt-[clamp(40px,6vw,80px)] pb-[clamp(28px,4vw,52px)]">
        {/* Inner card. asymmetric corners like the landing CTA pills, chunky shadow. */}
        <div
          className="bg-[var(--lp-card)] p-7 md:p-10 lg:p-14"
          style={{
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 6,
            boxShadow:
              '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
          }}
        >
          <div className="grid lg:grid-cols-[1.1fr_2fr] gap-10 lg:gap-16">
            {/* LEFT. logo block, editorial */}
            <div className="space-y-6">
              <Link href="/" className="inline-flex items-center gap-3 group">
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center w-12 h-12 border border-white/10 text-[var(--lp-accent)] transition-transform duration-200 group-hover:-translate-y-0.5"
                  style={{
                    background: 'var(--lp-band-dark)',
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                    borderBottomLeftRadius: 12,
                    borderBottomRightRadius: 3,
                  }}
                >
                  <KarwanMark />
                </span>
                <span className="font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em]">
                  Karwan
                </span>
              </Link>
              <p className="text-pretty text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[34ch]">
                On-chain settlement and reputation rails for cross-border SME
                trade. USDC sits in milestone escrow on Arc while the work
                gets done.
              </p>
              <SectionTag>BUILT FOR THE TRADE LANE</SectionTag>
            </div>

            {/* RIGHT. three columns of links */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-10">
              <FooterCol title="PRODUCT">
                <FooterLink href="/buyer">Buyer desk</FooterLink>
                <FooterLink href="/seller">Seller desk</FooterLink>
                <FooterLink href="/activity">Activity feed</FooterLink>
                <FooterLink href="/how-it-works">How it works</FooterLink>
                <FooterLink href="/docs">Documentation</FooterLink>
              </FooterCol>
              <FooterCol title="NETWORK">
                <FooterLink href="https://docs.arc.network" external>
                  Arc Docs
                </FooterLink>
                <FooterLink href="https://developers.circle.com" external>
                  Circle Docs
                </FooterLink>
                <FooterLink href="https://testnet.arcscan.app" external>
                  Arc Testnet Explorer
                </FooterLink>
                <FooterLink href="https://faucet.circle.com" external>
                  USDC Faucet
                </FooterLink>
              </FooterCol>
              <FooterCol title="SOCIALS">
                <FooterSocialLink href="https://x.com" label="X" glyph={<XGlyph />} />
                <FooterSocialLink
                  href="https://www.linkedin.com"
                  label="LinkedIn"
                  glyph={<LIGlyph />}
                />
                <FooterSocialLink
                  href="https://discord.com"
                  label="Discord"
                  glyph={<DCGlyph />}
                />
              </FooterCol>
            </div>
          </div>

          {/* Hairline + bottom strip with operational pill */}
          <div className="mt-12 lg:mt-16 pt-5 border-t border-[var(--lp-border-light)] flex flex-wrap items-center justify-between gap-4">
            <OperationalPill />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mono text-[11px] uppercase tracking-[0.06em] text-[var(--lp-text-muted)]">
              <span>© 2026 KARWAN</span>
              <span aria-hidden className="hidden sm:inline-block w-px h-3 bg-[var(--lp-border-light)]" />
              <span>cross-border settlement on USDC</span>
            </div>
          </div>
        </div>

        {/* Heroic wordmark. closes the page like a Phantom move */}
        <div className="mt-12 lg:mt-16">
          <p className="text-center mono text-[10px] uppercase tracking-[0.22em] text-[var(--lp-text-muted)]">
            [:settle in real time:]
          </p>
          <p
            aria-hidden
            className="mt-4 select-none text-center font-sans font-extrabold uppercase tracking-[-0.035em] leading-[0.86] text-[clamp(3.25rem,11vw,9.5rem)]"
            style={{ color: 'var(--lp-dark)' }}
          >
            KARWAN<span style={{ color: 'var(--lp-accent)' }}>.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ---- pieces ---- */

function SectionTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.16em] text-[var(--lp-text-sub)]">
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
      [:{children}:]
    </span>
  );
}

function OperationalPill() {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-sub)] bg-[var(--lp-light)] border border-[var(--lp-border-light)]"
      style={{ borderRadius: 999 }}
    >
      <span aria-hidden className="relative flex w-[7px] h-[7px]">
        <span
          className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping"
          style={{ background: 'var(--lp-accent)' }}
        />
        <span
          className="relative inline-flex w-[7px] h-[7px] rounded-full"
          style={{ background: 'var(--lp-accent)' }}
        />
      </span>
      Operational
    </span>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] mb-4">
        {title}
      </p>
      <div className="flex flex-col gap-2.5">{children}</div>
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
  const className = cn(
    'group inline-flex items-center gap-1.5 w-fit text-[13.5px] font-medium tracking-[-0.005em]',
    'text-[var(--lp-dark)]/85 hover:text-[var(--lp-dark)] transition-colors',
  );
  const inner = (
    <>
      <span
        aria-hidden
        className="inline-block w-0 h-px bg-[var(--lp-accent)] opacity-0 group-hover:opacity-100 group-hover:w-3 transition-[width,opacity] duration-200"
      />
      <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
        {children}
      </span>
      {external && (
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
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

function FooterSocialLink({
  href,
  label,
  glyph,
}: {
  href: string;
  label: string;
  glyph: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="group inline-flex items-center gap-2.5 w-fit text-[13.5px] font-medium tracking-[-0.005em] text-[var(--lp-dark)]/85 hover:text-[var(--lp-dark)] transition-colors"
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[var(--lp-light)] border border-[var(--lp-border-light)] text-[var(--lp-dark)] transition-[transform,background-color,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:bg-[var(--lp-band-dark)] group-hover:text-[var(--lp-accent)] group-hover:border-[var(--lp-dark)]"
      >
        {glyph}
      </span>
      <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
        {label}
      </span>
    </a>
  );
}

/* ---- glyphs ---- */

function KarwanMark() {
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

function XGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.4 2H8l4.7 6.2L18.9 2zm-1.1 18.1h1.7L7.3 3.8H5.5l12.3 16.3z" />
    </svg>
  );
}

function LIGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3-.02-2.95-1.8-2.95-1.8 0-2.07 1.4-2.07 2.85V21h-4z" />
    </svg>
  );
}

function DCGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.3 5.3A17 17 0 0 0 15.1 4l-.25.45a15.7 15.7 0 0 1 3.6 1.16 13 13 0 0 0-11 0A15.7 15.7 0 0 1 11.1 4.45L10.85 4a17 17 0 0 0-4.2 1.3C4 9.3 3.3 13.2 3.65 17a17.3 17.3 0 0 0 5.2 2.6l.62-1.04a11 11 0 0 1-1.74-.83l.43-.32a12 12 0 0 0 10.1 0l.43.32c-.55.33-1.13.6-1.74.83l.62 1.04a17.3 17.3 0 0 0 5.2-2.6c.43-4.5-.66-8.37-3-11.7zM9.7 14.6c-1.02 0-1.86-.93-1.86-2.07 0-1.14.82-2.07 1.86-2.07s1.88.94 1.86 2.07c0 1.14-.83 2.07-1.86 2.07zm4.6 0c-1.02 0-1.86-.93-1.86-2.07 0-1.14.82-2.07 1.86-2.07s1.88.94 1.86 2.07c0 1.14-.82 2.07-1.86 2.07z" />
    </svg>
  );
}
