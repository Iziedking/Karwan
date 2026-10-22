'use client';
import { type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { START_ROUTE } from '@/shared/utils/routes';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import {
  FullBleed,
  Band,
  SectionTag,
  HeroHeadline,
  Punc,
} from '@/shared/components/Bands';
import styles from './SignInGate.module.css';
import { Icon } from '@/shared/components/Icon';

/// The account entry has its own composition. Other private routes keep a
/// compact gate so a link to a specific task does not become a second landing.
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
  const router = useRouter();
  const t = useTranslations();
  const isHero = variant === 'hero';
  const copy = t.auth.signInGate;
  const resolvedTag = tag ?? (isHero ? copy.heroTag : copy.defaultTag);
  const resolvedButton = buttonLabel ?? (isHero ? copy.heroButton : copy.button);

  if (isHero) {
    return (
      <FullBleed>
        <section data-auth-gate="hero" className={styles.hero}>
          <div className={styles.inner}>
            <p className={styles.eyebrow}>{resolvedTag}</p>
            <h1 className={styles.headline}>{title ?? copy.heroTitle}</h1>
            <p className={styles.lede}>{body ?? copy.heroBody}</p>
            <button type="button" className={styles.entryAction} onClick={() => router.push(START_ROUTE)}>
              {resolvedButton}
              <Icon name="arrow-right" size={16} directional />
            </button>
            <p className={styles.notice}>{copy.heroNote}</p>
            {DEALS_AVAILABLE && (
              <div className={styles.browse}>
                <span>{copy.browseIntro}</span>
                <Link href="/market">{copy.browseLink}</Link>
              </div>
            )}
          </div>
        </section>
      </FullBleed>
    );
  }

  const titleNode: ReactNode = title ?? <>{copy.pageTitle}<Punc>.</Punc></>;
  const bodyText: ReactNode = body ?? copy.pageBody;

  return (
    <FullBleed>
      <Band
        tone="dark"
      >
        <div className="max-w-[52ch]">
          <div className="fade-up">
            <SectionTag tone="dark">
              {resolvedTag}
            </SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline size="md">{titleNode}</HeroHeadline>
          </div>
          <p
            className="fade-up fade-up-2 mt-5 max-w-[44ch] text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)]"
          >
            {bodyText}
          </p>
          <div className="fade-up fade-up-3 mt-7">
            <button
              type="button"
              onClick={() => router.push(START_ROUTE)}
              className="group inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--lp-accent)] px-[18px] py-[11px] text-[14px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)]"
            >
              {resolvedButton}
              <Icon name="arrow-right" size={16} directional />
            </button>
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}
