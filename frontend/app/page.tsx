'use client';

import Link from 'next/link';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useEffect, useRef } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { SocialTradeSection } from '@/features/home/components/SocialTradeSection';
import { ProtectionSection } from '@/features/home/components/ProtectionSection';
import { TradeRoutesMap } from '@/features/home/components/TradeRoutesMap';
import { SettlementRecord } from '@/features/home/components/SettlementRecord';
import { useEntryHref } from '@/shared/auth/useEntryHref';
import { dealHref, START_ROUTE } from '@/shared/utils/routes';
import styles from './landing.module.css';

/// The hero film plays at half speed: at full speed its motion was tiring to
/// watch (owner, 31 Oct 2026). A calmer film replaces it later.
const HERO_FILM_RATE = 0.5;

function Arrow() {
  return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" className="rtl-flip" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

export default function HomePage() {
  const messages = useTranslations();
  const t = messages.landingEditorial;
  const videoRef = useRef<HTMLVideoElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const openHref = useEntryHref();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    video.defaultPlaybackRate = HERO_FILM_RATE;
    video.playbackRate = HERO_FILM_RATE;
    let inView = false;
    const sync = () => {
      if (preference.matches || document.hidden || !inView) video.pause();
      else void video.play().catch(() => {});
    };
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: 0.05 });
    observer.observe(video);
    document.addEventListener('visibilitychange', sync);
    preference.addEventListener('change', sync);
    sync();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); preference.removeEventListener('change', sync); video.pause(); };
  }, []);

  // Each section after the hero eases up once as it comes into view. Turned on
  // only here, so the page reads complete without script or with less motion.
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sections = Array.from(page.querySelectorAll<HTMLElement>(':scope > section')).slice(1);
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.shown = '';
        seen.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    for (const section of sections) {
      // Already on screen (a reload part-way down) shows at once.
      if (section.getBoundingClientRect().top < window.innerHeight * 0.9) section.dataset.shown = '';
      section.dataset.reveal = '';
      seen.observe(section);
    }
    page.dataset.motion = '';
    return () => {
      seen.disconnect();
      delete page.dataset.motion;
      for (const section of sections) {
        delete section.dataset.reveal;
        delete section.dataset.shown;
      }
    };
  }, []);

  return (
    <div ref={pageRef} className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroContent}>
          <p className={styles.kicker}>{t.kicker}</p>
          <h1 id="landing-title"><span>{t.titleFirst}</span>{' '}<span>{t.titleLast}</span></h1>
          <p className={styles.lead}>{t.lead}</p>
          <Link className={styles.button} href={openHref}>{t.open}<Arrow /></Link>
          <p className={styles.note}>{messages.networkUi.builtOnArc}</p>
        </div>
        <div className={styles.media}>
          <video ref={videoRef} muted loop playsInline preload="metadata" poster="/media/landing/karwan-hero-poster.jpg" aria-hidden="true">
            <source src="/media/landing/karwan-hero-olive.mp4" type="video/mp4" />
          </video>
        </div>
      </section>
      <SocialTradeSection />
      <section className={styles.intro} id="how-it-works" aria-labelledby="intro-title">
        <div className={`${styles.wrap} ${styles.introGrid}`}>
          <div><p className={styles.eyebrow}>{t.introLabel}</p><h2 id="intro-title">{t.introTitle}</h2><p className={styles.introCopy}>{t.introBody}</p>{DEALS_AVAILABLE && <Link className={styles.textLink} href="/market">{t.marketLink}<Arrow /></Link>}</div>
          <div className={styles.flow}>
            <article><p className={styles.flowLabel}>{t.bringLabel}</p><h3>{t.bringTitle}</h3><p>{t.bringBody}</p></article>
            <article><p className={styles.flowLabel}>{t.findLabel}</p><h3>{t.findTitle}</h3><p>{t.findBody}</p></article>
          </div>
        </div>
      </section>
      <SettlementRecord />
      <ProtectionSection />
      <TradeRoutesMap />
      <section className={styles.closing} aria-labelledby="closing-title">
        <div className={styles.wrap}>
          <h2 id="closing-title">{t.closeTitle}</h2>
          <p>{t.closeBody}</p>
          {/* The words ask for the waitlist, so the button does; trying it with
              test funds is the second way in. */}
          <div className={styles.closingActions}>
            <Link className={styles.button} href="/waitlist">{t.waitlistCta}<Arrow /></Link>
            <Link className={styles.textLink} href={DEALS_AVAILABLE ? openHref : dealHref(START_ROUTE, false)}>{t.tryTestnet}<Arrow /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
