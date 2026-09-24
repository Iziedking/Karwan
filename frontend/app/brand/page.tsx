'use client';
import { useState, type ReactNode } from 'react';
import {
  FullBleed,
} from '@/shared/components/Bands';
import {
  BracketTag,
  PrimaryCTA,
  SecondaryCTA,
  Section,
  SectionGrid,
} from '@/shared/components/skill';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { brandPalette } from '@/shared/brand/palette';

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
        <h1 className="fade-up fade-up-1 mt-6 max-w-[18ch] text-[clamp(48px,6vw,78px)] font-medium leading-[1.05] tracking-[-0.055em] text-[#F4F4F1]">
          {t.hero.headlineLead}{' '}
          <span className="text-[var(--accent)]">{t.hero.headlineAccent}</span>.
        </h1>
        <p className="fade-up fade-up-2 mt-7 max-w-[52ch] text-[17px] leading-[1.55] text-[var(--lp-text-on-dark-muted)]">
          {t.hero.body}
        </p>
      </Section>

      {/* LOGO DOWNLOADS */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.logo.tag}</BracketTag>
        <h2 className="mt-4 text-[clamp(34px,4vw,56px)] font-medium leading-[1.08] tracking-[-0.045em] text-[var(--lp-dark)]">{t.logo.headline}.</h2>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-[1.55] text-[var(--lp-text-sub)]">
          {t.logo.body}
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          <LogoCard
            label={t.logo.wordmarkOnDark}
            href="/brand/karwan-wordmark-light.svg"
            preview={<img src="/brand/karwan-wordmark-light.svg" alt="" className="h-32 w-full bg-[var(--lp-band-dark)] object-contain" />}
          />
          <LogoCard
            label={t.logo.wordmarkOnLight}
            href="/brand/karwan-wordmark-dark.svg"
            preview={<img src="/brand/karwan-wordmark-dark.svg" alt="" className="h-32 w-full bg-[var(--karwan-card)] object-contain" />}
          />
          <LogoCard
            label={t.logo.markOnDark}
            href="/brand/karwan-mark-lime.svg"
            pngHref="/brand/karwan-mark-lime.png"
            preview={<img src="/brand/karwan-mark-lime.svg" alt="" className="h-32 w-full bg-[var(--lp-band-dark)] p-4 object-contain" />}
          />
        </div>
      </Section>

      {/* COLOR PALETTE */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.palette.tag}</BracketTag>
        <h2 className="mt-4 text-[clamp(34px,4vw,56px)] font-medium leading-[1.08] tracking-[-0.045em] text-[var(--lp-dark)]">{t.palette.headline}.</h2>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-[1.55] text-[var(--lp-text-sub)]">
          {t.palette.body}
        </p>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {brandPalette.slice(0, 4).map(color => (
            <ColorChip key={color.key} name={t.palette[color.key]} hex={color.hex} labelTone={color.tone} border={color.key === 'creamSurface' || color.key === 'cardWhite'} brandLabel={t.palette.brandLabel} copyLabel={t.palette.copy} copiedLabel={t.palette.copied} />
          ))}
        </div>
        <h3 className="mt-14 text-[24px] font-semibold tracking-tight text-[var(--lp-dark)]">{t.palette.interfaceHeadline}</h3>
        <p className="mt-2 max-w-[60ch] text-[16px] leading-[1.55] text-[var(--lp-text-sub)]">{t.palette.interfaceBody}</p>
        <div className="mt-7 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {brandPalette.slice(4).map(color => (
            <ColorChip key={color.key} name={t.palette[color.key]} hex={color.hex} labelTone={color.tone} brandLabel={t.palette.interfaceLabel} copyLabel={t.palette.copy} copiedLabel={t.palette.copied} />
          ))}
        </div>
      </Section>

      {/* VOICE RULES */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.voice.tag}</BracketTag>
        <h2 className="mt-4 text-[clamp(34px,4vw,56px)] font-medium leading-[1.08] tracking-[-0.045em] text-[var(--lp-dark)]">{t.voice.headline}.</h2>
        <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-[var(--lp-text-sub)]">
          {t.voice.body}
        </p>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <div className="rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--karwan-card)]">
            <div className="p-6 md:p-7 space-y-3">
              <p className="mono text-[12px] font-semibold text-[var(--lp-accent-on-light)]">
                {t.voice.wordsWeUseLabel}
              </p>
              <p className="text-[16px] leading-[1.55] text-[var(--lp-text-sub)]">
                {t.voice.wordsWeUseBody}
              </p>
            </div>
          </div>
          <div className="rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--karwan-card)]">
            <div className="p-6 md:p-7 space-y-3">
              <p className="mono text-[12px] font-semibold text-[var(--color-critical)]">
                {t.voice.wordsWeAvoidLabel}
              </p>
              <p className="text-[16px] leading-[1.55] text-[var(--lp-text-sub)]">
                {t.voice.wordsWeAvoidBody}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* PARTNER CO-MARK */}
      <Section tone="light" compact>
        <BracketTag onDark={false}>{t.partner.tag}</BracketTag>
        <h2 className="mt-4 text-[clamp(34px,4vw,56px)] font-medium leading-[1.08] tracking-[-0.045em] text-[var(--lp-dark)]">{t.partner.headline}.</h2>
        <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-[var(--lp-text-sub)]">
          {t.partner.body}
        </p>

        <div className="mt-10">
          <div className="rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--karwan-card)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 p-5 sm:gap-6 sm:p-7 md:gap-10">
              <span className="flex min-w-0 items-center justify-end gap-2.5 text-[clamp(18px,5vw,36px)] font-semibold tracking-[-0.045em] text-[var(--lp-dark)]">
                <img src="/karwan-app-icon.svg" alt="" width="36" height="36" className="size-8 shrink-0 sm:size-9" />
                <span className="truncate">Karwan</span>
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
          </div>
        </div>
      </Section>

      {/* CONTACT */}
      <Section tone="dark" compact>
        <SectionGrid />
        <BracketTag>{t.contact.tag}</BracketTag>
        <h2 className="mt-4 text-[clamp(34px,4vw,56px)] font-medium leading-[1.08] tracking-[-0.045em] text-[#F4F4F1]">
          {t.contact.headlineLead}{' '}
          <span className="text-[var(--accent)]">{t.contact.headlineAccent}</span>.
        </h2>
        <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.55] text-[var(--lp-text-on-dark-muted)]">
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
  pngHref?: string;
  preview: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--karwan-card)]">
      <div
        className="overflow-hidden"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
        }}
      >
        {preview}
        <div className="px-5 py-4 space-y-2 border-t border-[var(--lp-border-light)]">
          <p className="mono text-[12px] font-medium text-[var(--lp-text-sub)]">
            {label.toUpperCase()}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <a
              href={href}
              download
              className="mono inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[12px] uppercase tracking-[0.1em] text-[var(--lp-dark)] underline underline-offset-2 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              SVG
            </a>
            {pngHref && <a
              href={pngHref}
              download
              className="mono inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[12px] uppercase tracking-[0.1em] text-[var(--lp-dark)] underline underline-offset-2 transition-colors hover:text-[var(--lp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              PNG
            </a>}
          </div>
        </div>
      </div>
    </div>
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
    <div className="overflow-hidden rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--karwan-card)]">
      <div
        className="overflow-hidden"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
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
            className="mono text-[12px] font-semibold"
            style={{ color: labelTone === 'dark' ? '#0E0E0E' : '#FFFFFF' }}
          >
            {brandLabel}
          </span>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="mono text-[12px] font-medium text-[var(--lp-text-sub)]">
              {name.toUpperCase()}
            </p>
            <p className="mt-1 mono text-[15px] tabular-nums text-[var(--lp-dark)]">
              {hex}
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="mono inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[13px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-2 transition-colors hover:text-[var(--lp-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {copied ? copiedLabel : copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
