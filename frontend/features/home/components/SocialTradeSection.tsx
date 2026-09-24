'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { canRotateStory } from '../capabilityStory';
import { nextTradeIntentIndex } from '../tradeIntentRotation';
import { SOCIAL_TRADE_EXAMPLES, SOCIAL_EXAMPLE_INTERVAL_MS } from '../socialTradeExamples';
import { tradeEntryRoutes } from '../tradeEntry';
import { PlatformMark } from './PlatformMark';
import styles from './SocialTradeSection.module.css';

export function SocialTradeSection() {
  const { t: messages, locale } = useLocale();
  const t = messages.socialTrade;
  const sectionRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const running = canRotateStory({ paused, reduced, hovered, visible, inView });
  const example = SOCIAL_TRADE_EXAMPLES[index];
  const copy = t.examples[example.id];
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReduced(preference.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    preference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      preference.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setIndex(current => nextTradeIntentIndex(current, SOCIAL_TRADE_EXAMPLES.length)), SOCIAL_EXAMPLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <section ref={sectionRef} id="social-trades" aria-labelledby="social-trade-title" className={styles.section} data-running={running} onFocusCapture={event => {
      if (event.target.closest('button')) setPaused(true);
    }}>
      <div className={styles.wrap}>
        <div className={styles.copy}>
          <p className={styles.label}><img src="/brand/karwan-mark-lime.svg" alt="" width={24} height={28} />{t.label}</p>
          <h2 id="social-trade-title" className={styles.headline}>{t.title}</h2>
          <p className={styles.body}>{t.body}</p>
          <Link href={tradeEntryRoutes(false).agreement} className={styles.cta}>{t.action}<span aria-hidden className="rtl-flip">→</span></Link>

          <div className={styles.exampleControls}>
            <p className={styles.controlsLabel}>{t.controls}</p>
            <div className={styles.platforms} role="group" aria-label={t.controls}>
              {SOCIAL_TRADE_EXAMPLES.map((item, itemIndex) => (
                <button key={item.id} type="button" className={styles.platformButton} aria-label={t.select.replace('{platform}', item.name)} aria-pressed={index === itemIndex} aria-controls="social-trade-example" onClick={() => { setIndex(itemIndex); setPaused(true); }}>
                  <PlatformMark id={item.id} />
                </button>
              ))}
            </div>
            <div className={styles.playback}>
              <span><bdi>{example.name}</bdi><span className={styles.counter} aria-hidden>{String(index + 1).padStart(2, '0')} / {String(SOCIAL_TRADE_EXAMPLES.length).padStart(2, '0')}</span></span>
            </div>
          </div>
        </div>

        <figure className={styles.figure} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <div className={styles.stage}>
            <div className={styles.orbit} aria-hidden="true">
              {SOCIAL_TRADE_EXAMPLES.map(item => <div key={item.id} className={styles.satellite} data-platform={item.id} data-active={item.id === example.id}><PlatformMark id={item.id} /></div>)}
            </div>
            <div className={styles.phone}>
              <div className={styles.screen}>
                <div className={styles.hardware} aria-hidden="true"><span>9:41</span><span className={styles.camera} /><svg width="36" height="12" viewBox="0 0 36 12" fill="currentColor"><path d="M0 8h2v4H0zm4-3h2v7H4zm4-3h2v10H8zm4-2h2v12h-2z" /><rect x="20" y="2" width="13" height="8" rx="2" fill="none" stroke="currentColor" /><path d="M22 4h9v4h-9zm12 1h2v2h-2z" /></svg></div>
                <div className={styles.phoneBrand}><span><img src="/brand/karwan-mark-lime.svg" alt="" width={20} height={24} />Karwan</span><span>{t.illustration}</span></div>
                <div id="social-trade-example" aria-live={paused ? 'polite' : 'off'} aria-atomic="true">
                  <div key={example.id} className={styles.scene}>
                    <div className={styles.conversation}>
                      <div className={styles.source}><PlatformMark id={example.id} /><span><bdi>{example.name}</bdi><small>{t.conversation}</small></span></div>
                      <p>{copy.message}</p>
                    </div>
                    <div className={styles.handoff}><span aria-hidden>↓</span>{t.handoff}</div>
                    <div className={styles.agreement}>
                      <p className={styles.draft}>{t.draft}</p>
                      <h3>{copy.title}</h3>
                      <dl className={styles.terms}>
                        <div className={styles.amount}><dt>{t.value}</dt><dd><bdi>{number.format(example.amount)} <small>USDC</small></bdi></dd></div>
                        <div className={styles.delivery}><dt>{t.delivery}</dt><dd>{t.days.replace('{days}', number.format(example.days))}</dd></div>
                      </dl>
                      <p className={styles.milestoneLabel}>{t.milestones}</p>
                      <ol className={styles.milestones}>
                        <li><span className={styles.ordinal} aria-hidden="true">1</span><span>{copy.first}</span><bdi>30%</bdi></li>
                        <li><span className={styles.ordinal} aria-hidden="true">2</span><span>{copy.final}</span><bdi>70%</bdi></li>
                      </ol>
                      <p className={styles.review}><span aria-hidden>↗</span>{t.review}</p>
                    </div>
                  </div>
                </div>
                <span className={styles.homeIndicator} aria-hidden="true" />
              </div>
            </div>
          </div>
          <figcaption className="sr-only">{t.illustration}</figcaption>
        </figure>
        <p className={styles.disclaimer}>{t.disclaimer}</p>
      </div>
    </section>
  );
}
