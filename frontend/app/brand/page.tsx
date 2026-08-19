'use client';
import { useState, type ReactNode } from 'react';
import {
  FullBleed,
  PageCard,
} from '@/shared/components/Bands';
import {
  BracketTag,
  DisplayHeadline,
  LimePunc,
  PrimaryCTA,
  SecondaryCTA,
  Section,
  SectionGrid,
} from '@/shared/components/skill';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Public brand page. Press, partners, and anyone embedding Karwan in their
/// own materials can download the logo set, copy the brand colors, and read
/// the short voice rules. Internal living document is `docs/assets/brand-kit.md`
/// (gitignored). This page is the public-facing slice of that doc.
export default function BrandPage() {
  const t = useTranslations().brandPage;
  return (
    <FullBleed>
      {/* HERO */}
      <Section tone="dark">
        <SectionGrid />
        <div className="fade-up">
          <BracketTag>{t.hero.tag}</BracketTag>
        </div>
        <DisplayHeadline size="lg" className="fade-up fade-up-1 mt-6">
          {t.hero.headlineLead}{' '}
          <span className="text-[var(--accent)]">{t.hero.headlineAccent}</span>
          <LimePunc />
        </DisplayHeadline>
        <p className="fade-up fade-up-2 mt-7 max-w-[52ch] text-[15px] leading-relaxed text-white/65">
          {t.hero.body}
        </p>
      </Section>

      {/* LOGO DOWNLOADS */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.logo.tag}</BracketTag>
        <DisplayHeadline as="h2" size="md" onDark={false} className="mt-4">
          {t.logo.headline}.
        </DisplayHeadline>
        <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.logo.body}
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          <LogoCard
            label={t.logo.wordmarkOnDark}
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
            label={t.logo.wordmarkOnLight}
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
            label={t.logo.markOnDark}
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
      </Section>

      {/* COLOR PALETTE */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.palette.tag}</BracketTag>
        <DisplayHeadline as="h2" size="md" onDark={false} className="mt-4">
          {t.palette.headline}.
        </DisplayHeadline>
        <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.palette.body}
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          <ColorChip name={t.palette.brandLime} hex="#AFC95B" labelTone="dark" brandLabel={t.palette.brandLabel} copyLabel={t.palette.copy} copiedLabel={t.palette.copied} />
          <ColorChip name={t.palette.brandInk} hex="#0E0E0E" labelTone="light" brandLabel={t.palette.brandLabel} copyLabel={t.palette.copy} copiedLabel={t.palette.copied} />
          <ColorChip name={t.palette.creamSurface} hex="#FAF8F2" labelTone="dark" border brandLabel={t.palette.brandLabel} copyLabel={t.palette.copy} copiedLabel={t.palette.copied} />
        </div>
      </Section>

      {/* VOICE RULES */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.voice.tag}</BracketTag>
        <DisplayHeadline as="h2" size="md" onDark={false} className="mt-4">
          {t.voice.headline}.
        </DisplayHeadline>
        <p className="mt-6 max-w-[60ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.voice.body}
        </p>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <PageCard>
            <div className="p-6 md:p-7 space-y-3">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
                [:{t.voice.wordsWeUseLabel}:]
              </p>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {t.voice.wordsWeUseBody}
              </p>
            </div>
          </PageCard>
          <PageCard>
            <div className="p-6 md:p-7 space-y-3">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#b03d3a]">
                [:{t.voice.wordsWeAvoidLabel}:]
              </p>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {t.voice.wordsWeAvoidBody}
              </p>
            </div>
          </PageCard>
        </div>
      </Section>

      {/* PARTNER CO-MARK */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.partner.tag}</BracketTag>
        <DisplayHeadline as="h2" size="md" onDark={false} className="mt-4">
          {t.partner.headline}.
        </DisplayHeadline>
        <p className="mt-6 max-w-[60ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.partner.body}
        </p>

        <div className="mt-10">
          <PageCard>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 p-5 sm:gap-6 sm:p-7 md:gap-10">
              <span
                className="min-w-0 truncate text-end font-sans font-extrabold tracking-[-0.025em]"
                style={{ fontSize: 'clamp(18px, 5vw, 36px)', color: 'var(--lp-dark)' }}
              >
                KARWAN<span style={{ color: 'var(--lp-accent)' }}>.</span>
              </span>
              <span
                aria-hidden
                className="inline-block w-px h-8"
                style={{ background: 'var(--lp-border-light)' }}
              />
              <span
                className="min-w-0 truncate text-start font-sans font-bold tracking-tight"
                style={{ fontSize: 'clamp(18px, 4.5vw, 30px)', color: 'var(--lp-text-sub)' }}
              >
                {t.partner.partnerLabel}
              </span>
            </div>
          </PageCard>
        </div>
      </Section>

      {/* CONTACT */}
      <Section tone="dark" compact>
        <SectionGrid />
        <BracketTag>{t.contact.tag}</BracketTag>
        <DisplayHeadline as="h2" size="md" className="mt-4">
          {t.contact.headlineLead}{' '}
          <span className="text-[var(--accent)]">{t.contact.headlineAccent}</span>
          .
        </DisplayHeadline>
        <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-white/65">
          {t.contact.body}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {/* Two routed inboxes per 2026-06-08: bd@ for partnerships and
              press / co-mark / quote inquiries (the headline ask on this
              page), support@ for product-side questions. Both addresses
              are enrolled. The bd@ pill leads (primary lime) because it
              matches the page's "Press and partners" framing. */}
          <PrimaryCTA href="mailto:bd@karwan.site" icon="↗">bd@karwan.site</PrimaryCTA>
          <SecondaryCTA href="mailto:support@karwan.site" onDark icon="↗">
            support@karwan.site
          </SecondaryCTA>
          <SecondaryCTA href="/" onDark>
            {t.contact.backHome}
          </SecondaryCTA>
        </div>
      </Section>
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
          <div className="flex flex-wrap items-center gap-1">
            <a
              href={href}
              download
              className="mono inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[12px] uppercase tracking-[0.1em] text-[var(--lp-dark)] underline underline-offset-2 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              SVG
            </a>
            <a
              href={pngHref}
              download
              className="mono inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[12px] uppercase tracking-[0.1em] text-[var(--lp-dark)] underline underline-offset-2 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
  brandLabel,
  copyLabel,
  copiedLabel,
}: {
  name: string;
  hex: string;
  labelTone: 'dark' | 'light';
  border?: boolean;
  brandLabel: string;
  copyLabel: string;
  copiedLabel: string;
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
            {brandLabel}
          </span>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
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
            className="mono inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] underline underline-offset-2 transition-colors hover:text-[var(--lp-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {copied ? copiedLabel : copyLabel}
          </button>
        </div>
      </div>
    </PageCard>
  );
}
