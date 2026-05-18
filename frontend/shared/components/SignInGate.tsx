'use client';
import { useState, type ReactNode } from 'react';
import { LoginModal } from '@/shared/components/LoginModal';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
} from '@/shared/components/Bands';

/// Shared sign-in prompt rendered by every gated page. The home page uses
/// `variant="hero"` for the full landing-grade headline; every other page
/// passes `variant="page"` which dials the typography down a notch but keeps
/// the same dark band, lime accent dot, and login modal trigger. Page variant
/// accepts a custom eyebrow tag and body copy so each surface can frame the
/// gate in its own words.
export function SignInGate({
  variant = 'page',
  tag = 'SIGN IN',
  title,
  body,
  buttonLabel = 'Log in',
}: {
  variant?: 'hero' | 'page';
  tag?: string;
  title?: ReactNode;
  body?: ReactNode;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const isHero = variant === 'hero';

  const titleNode: ReactNode =
    title ??
    (isHero ? (
      <>
        Log in to enter
        <Punc>.</Punc>
      </>
    ) : (
      <>
        Sign in to continue
        <Punc>.</Punc>
      </>
    ));

  const bodyText: ReactNode =
    body ??
    (isHero
      ? 'Karwan identifies you by a wallet. Pick one via an EVM connector or have Circle provision one for you. The rest of the app unlocks.'
      : 'This page is keyed to your wallet. Sign in once and every surface picks you up.');

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className={isHero ? '' : 'max-w-[52ch]'}>
          <div className="fade-up">
            <SectionTag tone="dark" dot="live">
              {tag}
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
          <div className="fade-up fade-up-3 mt-7">
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
              {buttonLabel}
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </Band>
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </FullBleed>
  );
}
