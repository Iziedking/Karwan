'use client';
import { useState, type ReactNode } from 'react';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';

/// Public brand page. Press, partners, and anyone embedding Karwan in their
/// own materials can download the logo set, copy the brand colors, and read
/// the short voice rules. Internal living document is `docs/assets/brand-kit.md`
/// (gitignored). This page is the public-facing slice of that doc.
export default function BrandPage() {
  return (
    <FullBleed>
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="fade-up">
          <SectionTag tone="dark">BRAND</SectionTag>
        </div>
        <HeroHeadline className="fade-up fade-up-1 mt-6">
          The Karwan <Accent>mark</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="fade-up fade-up-2 mt-7 max-w-[52ch] text-[15px] leading-relaxed text-white/65">
          The logo, the palette, the voice. Pull what you need to write about
          Karwan, embed it in a partner deck, or paint a co-mark. For deeper
          guidance, reach out at the contact below.
        </p>
      </Band>

      {/* LOGO DOWNLOADS */}
      <Band tone="light" compact>
        <SectionTag>LOGO</SectionTag>
        <HeroHeadline size="md" className="mt-4">
          Three forms<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          Pick by surface. Mark for small spaces. Wordmark when there is room.
          Reserve clearspace equal to the stroke width on every side.
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          <LogoCard
            label="Wordmark on dark"
            href="/brand/karwan-wordmark-light.svg"
            pngHref="/brand/karwan-wordmark-light.png"
            preview={
              <div
                className="w-full h-32 flex items-center justify-center"
                style={{ background: '#0E0E0E' }}
              >
                <span
                  className="font-sans font-extrabold tracking-[-0.025em] text-white"
                  style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}
                >
                  KARWAN<span style={{ color: '#AFC95B' }}>.</span>
                </span>
              </div>
            }
          />
          <LogoCard
            label="Wordmark on light"
            href="/brand/karwan-wordmark-dark.svg"
            pngHref="/brand/karwan-wordmark-dark.png"
            preview={
              <div
                className="w-full h-32 flex items-center justify-center"
                style={{ background: '#FAF8F2' }}
              >
                <span
                  className="font-sans font-extrabold tracking-[-0.025em]"
                  style={{ fontSize: 'clamp(28px, 4vw, 44px)', color: '#0E0E0E' }}
                >
                  KARWAN<span style={{ color: '#AFC95B' }}>.</span>
                </span>
              </div>
            }
          />
          <LogoCard
            label="Mark on dark"
            href="/brand/karwan-mark-lime.svg"
            pngHref="/brand/karwan-mark-lime.png"
            preview={
              <div
                className="w-full h-32 flex items-center justify-center"
                style={{ background: '#0E0E0E' }}
              >
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M7 17 L10 7 L12 13 L14 7 L17 17"
                    stroke="#AFC95B"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            }
          />
        </div>
      </Band>

      {/* COLOR PALETTE */}
      <Band tone="light" compact>
        <SectionTag>PALETTE</SectionTag>
        <HeroHeadline size="md" className="mt-4">
          Three brand constants<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          Lime is the only accent. Pair brand lime with one neutral. Never
          stack a second accent color on top.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          <ColorChip name="Brand lime" hex="#AFC95B" labelTone="dark" />
          <ColorChip name="Brand ink" hex="#0E0E0E" labelTone="light" />
          <ColorChip name="Cream surface" hex="#FAF8F2" labelTone="dark" border />
        </div>
      </Band>

      {/* VOICE RULES */}
      <Band tone="light" compact>
        <SectionTag>VOICE</SectionTag>
        <HeroHeadline size="md" className="mt-4">
          Engineer&apos;s product memo<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 max-w-[60ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          Karwan&apos;s tone reads as infrastructural, not consumer. Bloomberg
          terminal energy. Have an opinion. Acknowledge limits. Vary rhythm.
          Never theatrical.
        </p>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <PageCard>
            <div className="p-6 md:p-7 space-y-3">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
                [:WORDS WE USE:]
              </p>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                settlement, escrow, rail, deal, request, offer, milestone,
                release, slash, stake, reputation, passport, anchor, attest,
                financier, importer, exporter, working capital, cross-border,
                on-chain.
              </p>
            </div>
          </PageCard>
          <PageCard>
            <div className="p-6 md:p-7 space-y-3">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#b03d3a]">
                [:WORDS WE AVOID:]
              </p>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                revolutionary, transformative, empowering, seamless, robust,
                world-class, cutting-edge, gig, freelance, platform, users, AI
                (we say &quot;agents&quot; with the specific job they do).
              </p>
            </div>
          </PageCard>
        </div>
      </Band>

      {/* PARTNER CO-MARK */}
      <Band tone="light" compact>
        <SectionTag>PARTNER CO-MARK</SectionTag>
        <HeroHeadline size="md" className="mt-4">
          Pair, do not enclose<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 max-w-[60ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          When co-marking with Arc, Circle, USYC, or another partner: same
          baseline as Karwan&apos;s wordmark, vertical hairline divider, equal
          optical weight. Never enclose two logos in the same container.
        </p>

        <div className="mt-10">
          <PageCard>
            <div className="p-7 flex items-center justify-center gap-10">
              <span
                className="font-sans font-extrabold tracking-[-0.025em]"
                style={{ fontSize: 36, color: 'var(--lp-dark)' }}
              >
                KARWAN<span style={{ color: 'var(--lp-accent)' }}>.</span>
              </span>
              <span
                aria-hidden
                className="inline-block w-px h-8"
                style={{ background: 'var(--lp-border-light)' }}
              />
              <span
                className="font-sans font-bold tracking-tight"
                style={{ fontSize: 30, color: 'var(--lp-text-sub)' }}
              >
                Partner
              </span>
            </div>
          </PageCard>
        </div>
      </Band>

      {/* CONTACT */}
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <SectionTag tone="dark">PRESS AND PARTNERS</SectionTag>
        <HeroHeadline size="md" className="mt-4">
          Reach <Accent>out</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-white/65">
          Want a higher-resolution asset, a co-mark configuration we have not
          published, or a quote? Send a note.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <CTAPill href="mailto:hello@karwan.site">hello@karwan.site</CTAPill>
          <CTAPill href="/" variant="secondary" tone="dark">
            Back home
          </CTAPill>
        </div>
      </Band>
    </FullBleed>
  );
}

function LogoCard({
  label,
  href,
  pngHref,
  preview,
}: {
  label: string;
  href: string;
  pngHref: string;
  preview: ReactNode;
}) {
  return (
    <PageCard>
      <div
        className="overflow-hidden"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 4,
        }}
      >
        {preview}
        <div className="px-5 py-4 space-y-2 border-t border-[var(--lp-border-light)]">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{label.toUpperCase()}:]
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href={href}
              download
              className="mono text-[12px] uppercase tracking-[0.1em] text-[var(--lp-dark)] hover:text-[var(--lp-accent)] transition-colors underline underline-offset-2"
            >
              SVG
            </a>
            <a
              href={pngHref}
              download
              className="mono text-[12px] uppercase tracking-[0.1em] text-[var(--lp-dark)] hover:text-[var(--lp-accent)] transition-colors underline underline-offset-2"
            >
              PNG
            </a>
          </div>
        </div>
      </div>
    </PageCard>
  );
}

function ColorChip({
  name,
  hex,
  labelTone,
  border,
}: {
  name: string;
  hex: string;
  labelTone: 'dark' | 'light';
  border?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // browsers without clipboard permission fall through silently
    }
  }
  return (
    <PageCard>
      <div
        className="overflow-hidden"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 4,
        }}
      >
        <div
          className="w-full h-32 flex items-end justify-end p-4"
          style={{
            background: hex,
            border: border ? '1px solid var(--lp-border-light)' : 'none',
          }}
        >
          <span
            className="mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: labelTone === 'dark' ? '#0E0E0E' : '#FFFFFF' }}
          >
            BRAND
          </span>
        </div>
        <div className="px-5 py-4 flex items-baseline justify-between gap-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{name.toUpperCase()}:]
            </p>
            <p className="mt-1 mono text-[14px] tabular-nums text-[var(--lp-dark)]">
              {hex}
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </PageCard>
  );
}
