'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { SocialTradeSection } from '@/features/home/components/SocialTradeSection';
import { ProtectionSection } from '@/features/home/components/ProtectionSection';
import styles from './landing.module.css';

function Arrow() {
  return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" className="rtl-flip" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

export default function HomePage() {
  const messages = useTranslations();
  const t = messages.landingEditorial;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
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

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroContent}>
          <p className={styles.kicker}>{t.kicker}</p>
          <h1 id="landing-title"><span>{t.titleFirst}</span>{' '}<span>{t.titleLast}</span></h1>
          <p className={styles.lead}>{t.lead}</p>
          <Link className={styles.button} href="/start">{t.open}<Arrow /></Link>
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
          <div><p className={styles.eyebrow}>{t.introLabel}</p><h2 id="intro-title">{t.introTitle}</h2><p className={styles.introCopy}>{t.introBody}</p><Link className={styles.textLink} href="/market">{t.marketLink}<Arrow /></Link></div>
          <div className={styles.flow}>
            <article><p className={styles.flowLabel}>{t.bringLabel}</p><h3>{t.bringTitle}</h3><p>{t.bringBody}</p></article>
            <article><p className={styles.flowLabel}>{t.findLabel}</p><h3>{t.findTitle}</h3><p>{t.findBody}</p></article>
          </div>
        </div>
      </section>
      <section className={styles.record} id="record" aria-labelledby="record-title">
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>{t.recordLabel}</p>
          <div className={styles.recordHead}><h2 id="record-title">{t.recordTitle}</h2><p>{t.recordBody}</p></div>
          <ol className={styles.recordLines}>
            {[[t.terms,t.both],[t.funded,t.buyer],[t.delivery,t.seller],[t.reviewed,t.buyer],[t.released,t.receipt]].map(([label,role]) => <li key={label}>{label}<span>{role}</span></li>)}
          </ol>
          <p className={styles.recordFoot}>{t.exampleNote}</p>
          <div className={styles.limit}><h3>{t.limitTitle}</h3><p>{t.limitBody}</p><Link className={styles.textLink} href="/how-it-works">{t.rulesLink}<Arrow /></Link></div>
        </div>
      </section>
      <ProtectionSection />
      <section className={styles.closing} aria-labelledby="closing-title"><div className={styles.wrap}><h2 id="closing-title">{t.closeTitle}</h2><p>{t.closeBody}</p><Link className={styles.button} href="/start">{t.open}<Arrow /></Link></div></section>
    </div>
  );
}
