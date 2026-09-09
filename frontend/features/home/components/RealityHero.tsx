'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur, ease } from '@/shared/motion/tokens';
import { nextTradeIntentIndex, TRADE_INTENT_INTERVAL_MS } from '../tradeIntentRotation';
import { PlatformMark } from './PlatformMark';

const tradeIntents = [
  {
    id: 'tiktok',
    platform: 'TikTok Shop',
    label: 'Social commerce',
    title: 'Source 200 custom tote bags',
    detail: 'A creator shares a supplier request. Karwan turns it into a clear deal.',
    amount: '1,240 USDC',
    status: 'New intent',
  },
  {
    id: 'instagram',
    platform: 'Instagram',
    label: 'Product enquiry',
    title: 'Order 80 leather sandals',
    detail: 'A buyer brings a social-shop enquiry into a deal with quantity and delivery terms.',
    amount: '2,100 USDC',
    status: 'Review terms',
  },
  {
    id: 'facebook',
    platform: 'Facebook Marketplace',
    label: 'Cross-border purchase',
    title: 'Source 40 solar lamps',
    detail: 'Buyer and supplier keep price, delivery, and evidence together.',
    amount: '3,600 USDC',
    status: 'Delivery due',
  },
  {
    id: 'x',
    platform: 'X',
    label: 'Logistics request',
    title: 'Book a Lagos to Accra freight run',
    detail: 'A public logistics request becomes a private agreement with delivery evidence.',
    amount: '1,850 USDC',
    status: 'Counterparty found',
  },
  {
    id: 'linkedin',
    platform: 'LinkedIn',
    label: 'Supplier contract',
    title: 'Settle a wholesale invoice',
    detail: 'Pay in USDC, review the delivery, and keep the record.',
    amount: '5,200 USDC',
    status: 'Ready to agree',
  },
] as const;

/** The landing front door: real trade footage on the left, a legible deal
 * object on the right. The object is a visual explanation of the product,
 * not a claim about a particular live trade. */
export function RealityHero() {
  const lp = useTranslations().landingPage;
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [intentIndex, setIntentIndex] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(true);
  const heroInView = useInView(frameRef, { amount: 0.3 });
  const intent = tradeIntents[intentIndex];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduce) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => {
      // The poster and product explanation remain useful when autoplay is blocked.
    });
  }, [reduce]);

  useEffect(() => {
    const sync = () => setDocumentVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (reduce || !heroInView || !documentVisible) return;
    const timer = window.setTimeout(
      () => setIntentIndex((current) => nextTradeIntentIndex(current, tradeIntents.length)),
      TRADE_INTENT_INTERVAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [documentVisible, heroInView, intentIndex, reduce]);

  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start start', 'end start'] });
  const filmY = useTransform(scrollYProgress, [0, 1], [0, 44]);
  const filmScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
  const filmDim = useTransform(scrollYProgress, [0, 0.85], [1, 0.45]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -28]);
  const contentFade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <div
      ref={frameRef}
      className="landing-hero relative isolate overflow-hidden bg-[var(--lp-workspace-band)] text-[var(--lp-workspace-ink)]"
      style={{ minHeight: 'var(--lp-panel-h)' }}
    >
      <motion.div
        className="absolute inset-0"
        style={reduce ? undefined : { y: filmY, scale: filmScale, opacity: filmDim }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover object-center"
          autoPlay={!reduce}
          muted
          loop
          playsInline
          preload={reduce ? 'none' : 'metadata'}
          poster="/media/karwan-reality-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/media/karwan-reality.mp4" type="video/mp4" />
        </video>
      </motion.div>

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,10,9,0.92) 0%, rgba(8,10,9,0.7) 42%, rgba(8,10,9,0.48) 100%), linear-gradient(180deg, rgba(8,10,9,0.4) 0%, rgba(8,10,9,0.72) 100%)',
        }}
      />

      <motion.div
        className="relative z-10 mx-auto grid min-h-[var(--lp-panel-h)] w-full max-w-[1440px] items-center gap-12 px-[clamp(20px,5vw,72px)] py-[clamp(92px,12vh,144px)] lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] lg:gap-16"
        style={reduce ? undefined : { y: contentY, opacity: contentFade }}
      >
        <motion.div
          className="max-w-[690px]"
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.18 : dur.hero, ease: ease.out }}
        >
          <p className="text-[13px] font-semibold text-[var(--lp-workspace-ink)]/72">{lp.hero.tag}</p>
          <h1
            id="landing-heading"
            className="mt-5 max-w-[12ch] text-balance text-[clamp(3rem,6.6vw,6.4rem)] font-semibold leading-[0.9] tracking-[-0.065em]"
          >
            {lp.hero.titleLine1} {lp.hero.titleLine2}{' '}
            <span className="text-[var(--lp-accent)]">{lp.hero.titleAccent}</span>
          </h1>
          <p className="mt-7 max-w-[54ch] text-pretty text-[clamp(0.98rem,1.45vw,1.15rem)] leading-[1.6] text-[var(--lp-workspace-ink)]/72">
            {lp.hero.body}
          </p>
          <Link href="/app" className="landing-action landing-action-primary mt-8">
            {lp.hero.ctaPrimary}<span aria-hidden className="landing-action-arrow">→</span>
          </Link>
          <p className="mt-7 text-[12px] text-[var(--lp-workspace-ink)]/55">{lp.hero.footnote}</p>
        </motion.div>

        <motion.div
          className="landing-deal-card w-full max-w-[470px] justify-self-start lg:justify-self-end"
          initial={{ opacity: 0, y: reduce ? 0 : 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.18 : dur.slow, delay: reduce ? 0 : 0.22, ease: ease.out }}
        >
          <div aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={intent.id}
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -10 }}
              transition={{ duration: reduce ? 0.12 : 0.38, ease: ease.out }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <PlatformMark id={intent.id} />
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--lp-workspace-ink)]/55">{intent.platform}</p>
                    <p className="mt-1 text-[13px] text-[var(--lp-workspace-ink)]/72">{intent.label}</p>
                  </div>
                </div>
                <span className="landing-status-pill">{intent.status}</span>
              </div>

              <p className="mt-8 max-w-[17ch] text-[clamp(1.5rem,3vw,2.25rem)] font-semibold leading-[1.02] tracking-[-0.04em]">{intent.title}</p>
              <p className="mt-3 max-w-[38ch] text-[13px] leading-relaxed text-[var(--lp-workspace-ink)]/62">{intent.detail}</p>

              <div className="mt-7 flex items-end justify-between gap-4 border-y border-white/15 py-5">
                <div>
                  <p className="text-[12px] text-[var(--lp-workspace-ink)]/55">Trade value</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.04em]">{intent.amount}</p>
                </div>
                <p className="text-end text-[12px] text-[var(--lp-workspace-ink)]/55">Milestones<br />and delivery proof</p>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-[var(--lp-workspace-ink)]/62">Example trade intent</span>
                <Link href="/app" className="inline-flex min-h-11 items-center text-[var(--lp-accent)] focus-visible:outline focus-visible:outline-2">Enter Karwan →</Link>
              </div>
            </motion.div>
          </AnimatePresence>
          </div>
          {!reduce ? <span key={intent.id} aria-hidden className="landing-intent-progress" /> : null}
          <div className="mt-6 flex items-center gap-2" aria-label="Trade sources">
            {tradeIntents.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.platform} trade intent`}
                aria-pressed={intentIndex === index}
                onClick={() => setIntentIndex(index)}
                className={intentIndex === index ? 'landing-source-button landing-source-button-active' : 'landing-source-button'}
              >
                <PlatformMark id={item.id} />
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
