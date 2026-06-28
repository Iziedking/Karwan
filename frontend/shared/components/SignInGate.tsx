'use client';
import { useState, type ReactNode } from 'react';
import { LoginModal } from '@/shared/components/LoginModal';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
} from '@/shared/components/Bands';

/// What Karwan does, in three lines, for the signed-out /app hero. Hoisted so
/// it is never re-allocated per render. English literals (i18n-debt precedent
/// for in-app marketing copy); translate alongside the rest of the hero later.
const HERO_PILLARS = [
  { index: '[:001]', title: 'Escrow in USDC', body: 'Funds lock on Arc the moment both sides agree the terms.' },
  { index: '[:002]', title: 'Milestone release', body: 'Tranches pay out as the work lands, never before.' },
  { index: '[:003]', title: 'On-chain proof', body: 'Every settlement is verifiable by anyone on Arc.' },
] as const;

/// Shared sign-in prompt rendered by every gated page. The home page uses
/// `variant="hero"` for the full landing-grade headline; every other page
/// passes `variant="page"` which dials the typography down a notch but keeps
/// the same dark band, lime accent dot, and login modal trigger. Page variant
/// accepts a custom eyebrow tag and body copy so each surface can frame the
/// gate in its own words.
export function SignInGate({
  variant = 'page',
  tag,
  title,
  body,
  buttonLabel,
}: {
  variant?: 'hero' | 'page';
  tag?: string;
  title?: ReactNode;
  body?: ReactNode;
  buttonLabel?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const isHero = variant === 'hero';
  // The hero gate is the signed-out /app landing. Lead with what Karwan does,
  // not "sign in", so a first-time visitor understands the product before the
  // wallet step (the sign-in button sits below the story).
  const resolvedTag = tag ?? (isHero ? 'SETTLEMENT NETWORK' : t.auth.signInGate.defaultTag);
  const resolvedButton = buttonLabel ?? t.auth.signInGate.button;

  const titleNode: ReactNode =
    title ??
    (isHero ? (
      <>
        {t.auth.signInGate.heroTitle}
        <Punc>.</Punc>
      </>
    ) : (
      <>
        {t.auth.signInGate.pageTitle}
        <Punc>.</Punc>
      </>
    ));

  const bodyText: ReactNode =
    body ?? (isHero ? t.auth.signInGate.heroBody : t.auth.signInGate.pageBody);

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className={isHero ? '' : 'max-w-[52ch]'}>
          <div className="fade-up">
            <SectionTag tone="dark" dot="live">
              {resolvedTag}
            </SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline size={isHero ? 'lg' : 'md'}>{titleNode}</HeroHeadline>
          </div>
          <p
            className={
              isHero
                ? 'fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[48ch]'
                : 'fade-up fade-up-2 mt-5 text-pretty text-[14px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]'
            }
          >
            {bodyText}
          </p>
          {isHero && (
            <div className="fade-up fade-up-3 mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl">
              {HERO_PILLARS.map((p) => (
                <div key={p.index} className="border-t border-white/15 pt-3.5">
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
                    {p.index}
                  </span>
                  <p className="mt-2 font-sans text-[15px] font-bold uppercase tracking-[-0.01em] text-white">
                    {p.title}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/60">{p.body}</p>
                </div>
              ))}
            </div>
          )}
          <div className={isHero ? 'fade-up fade-up-4 mt-10' : 'fade-up fade-up-3 mt-7'}>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={
                isHero
                  ? 'inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.45)] hover:shadow-[0_5px_0_rgba(0,0,0,0.45)] active:shadow-[0_1px_0_rgba(0,0,0,0.45)]'
                  : 'inline-flex items-center gap-2 px-[18px] py-[11px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.45)] hover:shadow-[0_4px_0_rgba(0,0,0,0.45)] active:shadow-[0_1px_0_rgba(0,0,0,0.45)]'
              }
              style={{
                borderTopLeftRadius: isHero ? 14 : 12,
                borderTopRightRadius: isHero ? 14 : 12,
                borderBottomLeftRadius: isHero ? 14 : 12,
                borderBottomRightRadius: isHero ? 4 : 3,
              }}
            >
              {resolvedButton}
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </Band>
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </FullBleed>
  );
}
