import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroFlow } from '@/features/activity/components/HeroFlow';
import { PartnerLogos } from '@/shared/components/PartnerLogos';
import { StatsTicker } from '@/features/activity/components/StatsTicker';
import { cn } from '@/shared/utils/cn';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="-mt-10 -mb-10">
      <StatsTicker />

      {/* HERO. dark */}
      <Band
        tone="dark"
        overlay={
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(var(--lp-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--lp-border-subtle) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
              maskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, black, transparent 75%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 90% 80% at 50% 0%, black, transparent 75%)',
            }}
          />
        }
      >
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-7">
            <SectionTag tone="dark">SETTLEMENT NETWORK</SectionTag>
            <h1 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.95] text-balance text-[clamp(2.75rem,7vw,5.75rem)]">
              Agree. Escrow.<br />Deliver.{' '}
              <span className="text-[var(--lp-accent)]">Settle.</span>
            </h1>
            <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-md">
              Karwan is an on-chain settlement network for cross-border service deals. USDC sits
              in milestone escrow on Arc while the work gets done, and releases as it lands.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <CTAPill href="/app">Launch app ↓</CTAPill>
              <CTAPill href="/how-it-works" variant="secondary" tone="dark">
                How it works →
              </CTAPill>
            </div>
            <p className="mono text-[12px] text-[var(--lp-text-sub)]">
              Free on Arc Testnet. No mainnet funds, no signup.
            </p>
          </div>
          <div className="lg:justify-self-end w-full max-w-md lg:max-w-none">
            <HeroFlow />
          </div>
        </div>
      </Band>

      {/* ECOSYSTEM. light */}
      <Band tone="light" compact>
        <div className="space-y-6">
          <SectionTag>BUILT ON</SectionTag>
          <PartnerLogos />
        </div>
      </Band>

      {/* DIRECT DEALS. light */}
      <Band tone="light">
        <SectionTag>DIRECT DEALS</SectionTag>
        <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
          Bring your own counterparty.
        </h2>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-xl">
          You already agreed with someone, on X, Discord, anywhere. Name their wallet, set the
          amount and a first-release slice, and the escrow is ready. No auction needed.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          <FeatureTile
            glyph={<GlyphWallet />}
            title="Name the wallet"
            body="Point the escrow at your counterparty. They sign in with that wallet, accept the terms, and deliver."
          />
          <FeatureTile
            glyph={<GlyphTranches />}
            title="Release in tranches"
            body="A slice releases on delivery, the rest once you verify. A review window auto-releases if you go quiet."
          />
        </div>
      </Band>

      {/* MANAGED DEALS. dark */}
      <Band tone="dark">
        <SectionTag tone="dark">MANAGED DEALS</SectionTag>
        <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
          Or let an agent find one.
        </h2>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-xl">
          Post a brief and your buyer agent runs a sealed auction against seller agents. It scores
          bids, counters once, and funds the escrow on acceptance. You wake up to a settled deal.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          <FeatureTile
            tone="dark"
            glyph={<GlyphAuction />}
            title="Agents negotiate"
            body="Buyer and seller agents bid and counter on chain, on their own, inside the ranges you set in your profile."
          />
          <FeatureTile
            tone="dark"
            glyph={<GlyphSettle />}
            title="Escrow on acceptance"
            body="When terms land, the buyer agent funds the milestone escrow. Releases follow the same spine as a direct deal."
          />
        </div>
      </Band>

      {/* THE SPINE. light */}
      <Band tone="light">
        <SectionTag>THE SETTLEMENT SPINE</SectionTag>
        <h2 className="mt-5 font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.25rem,4.6vw,4rem)]">
          One spine. Four primitives.
        </h2>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-xl">
          Both deal modes run on the same rails. USDC settles it, a contract holds it, reputation
          remembers it, and CCTP brings liquidity to it.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <AdvantageCard
            n="01"
            title="USDC settlement"
            body="Funds land in seconds on Arc. USDC is the gas, so fees come out in pennies, not percentage points."
          />
          <AdvantageCard
            n="02"
            title="Milestone escrow"
            body="A contract holds the budget until each milestone releases. A 1.5% fee is split evenly, collected on chain."
          />
          <AdvantageCard
            n="03"
            title="Portable reputation"
            body="Built on ERC-8004. Settled outcomes are recorded against the wallet, so a track record travels to the next deal."
          />
          <AdvantageCard
            n="04"
            title="Cross-chain funding"
            body="Bring USDC over from Base or Ethereum Sepolia with CCTP V2, or top up an agent from your Arc balance."
          />
        </div>
      </Band>

      {/* FINAL CTA. dark */}
      <Band tone="dark" className="text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <SectionTag tone="dark">
            <span className="sr-only">Get started</span>OPEN A DEAL
          </SectionTag>
          <h2 className="font-sans font-extrabold uppercase tracking-[-0.02em] leading-[0.98] text-balance text-[clamp(2.5rem,5vw,4.5rem)]">
            Open your first deal in about a minute.
          </h2>
          <p className="text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            Direct or agent-run, your call. Every step is a real transaction on Arc Testnet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <CTAPill href="/app">Launch app ↓</CTAPill>
            <CTAPill href="/how-it-works" variant="secondary" tone="dark">
              Read how it works →
            </CTAPill>
          </div>
        </div>
      </Band>
    </div>
  );
}

/* ---- layout ---- */

function Band({
  tone,
  children,
  className,
  compact,
  overlay,
}: {
  tone: 'dark' | 'light';
  children: ReactNode;
  className?: string;
  compact?: boolean;
  overlay?: ReactNode;
}) {
  const dark = tone === 'dark';
  return (
    // True full-bleed: span the viewport regardless of the constrained app
    // shell. overflow-x-clip on the layout wrapper keeps this from scrolling.
    <section
      className={cn(
        'relative left-1/2 w-screen -translate-x-1/2 overflow-hidden',
        dark
          ? 'bg-[var(--lp-band-dark)] text-white'
          : 'bg-[var(--lp-light)] text-[var(--lp-dark)]',
      )}
    >
      {overlay}
      <div
        className={cn(
          'relative mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)]',
          compact ? 'py-[clamp(36px,5vw,64px)]' : 'py-[clamp(64px,9vw,140px)]',
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* ---- ui primitives ---- */

function SectionTag({
  children,
  tone = 'light',
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 mono text-[12px] font-medium uppercase tracking-[0.08em]',
        tone === 'dark' ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
      [:{children}]
    </span>
  );
}

function CTAPill({
  href,
  children,
  variant = 'primary',
  tone = 'dark',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  tone?: 'dark' | 'light';
}) {
  const base =
    'inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase ' +
    'tracking-[0.08em] rounded-tl-[14px] rounded-tr-[14px] rounded-br-[4px] rounded-bl-[14px] ' +
    'transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2';
  if (variant === 'primary') {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'bg-[var(--lp-accent)] text-[var(--lp-dark)] shadow-[0_4px_0_rgba(0,0,0,0.22)]',
          tone === 'dark'
            ? 'focus-visible:ring-offset-[var(--lp-dark)]'
            : 'focus-visible:ring-offset-[var(--lp-light)]',
        )}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        base,
        tone === 'dark'
          ? 'border border-white/25 text-white hover:border-white/55 focus-visible:ring-offset-[var(--lp-dark)]'
          : 'border border-black/20 text-[var(--lp-dark)] hover:border-black/45 focus-visible:ring-offset-[var(--lp-light)]',
      )}
    >
      {children}
    </Link>
  );
}

function FeatureTile({
  glyph,
  title,
  body,
  tone = 'light',
}: {
  glyph: ReactNode;
  title: string;
  body: string;
  tone?: 'dark' | 'light';
}) {
  return (
    <div>
      <span
        aria-hidden
        className="inline-flex size-14 items-center justify-center rounded-xl bg-[var(--lp-card)] text-[var(--lp-dark)] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)]"
      >
        {glyph}
      </span>
      <h3 className="mt-4 text-[16px] font-bold uppercase tracking-[-0.01em]">{title}</h3>
      <p
        className={cn(
          'mt-2 text-pretty text-[13px] leading-relaxed',
          tone === 'dark' ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]',
        )}
      >
        {body}
      </p>
    </div>
  );
}

function AdvantageCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-[var(--lp-card)] p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] transition-transform duration-200 ease-out hover:scale-[1.035] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.10)]">
      <p className="mono text-[12px] tabular-nums text-[var(--lp-text-sub)]">{n}</p>
      <h3 className="mt-3 text-[16px] font-bold uppercase tracking-[-0.01em] text-[var(--lp-dark)]">
        {title}
      </h3>
      <p className="mt-2 text-pretty text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
        {body}
      </p>
    </div>
  );
}

/* ---- line glyphs (Lucide is not installed; hand-rolled to match the line-icon look) ---- */

function GlyphWallet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function GlyphTranches() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="10" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 16h5M19 13.5l2.5 2.5L19 18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlyphAuction() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 15l6-6M8 6l4 4M14 12l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 21h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="13" y="13" width="6" height="6" rx="1.2" transform="rotate(45 16 16)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function GlyphSettle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
