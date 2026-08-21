'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur, ease } from '@/shared/motion/tokens';

/** A cinematic full-bleed landing hero for Karwan's trade-lane footage.
 *
 * The film fills the screen exactly: the free height between the sticky chrome
 * and the bottom of the viewport, published as `--lp-panel-h` (globals.css,
 * "Landing panels"). It used to guess at `100svh - 4rem`, which on most phones
 * left the cream band under it showing a centimetre of itself along the bottom
 * edge, and the hero read as a cropped mistake rather than a frame.
 *
 * The film also drifts and dims as the row leaves, so the row arriving is the
 * brighter of the two and the change of row is something you see, not just
 * something that happens.
 */
export function RealityHero() {
  const lp = useTranslations().landingPage;
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduce) {
      video.pause();
      video.currentTime = 0;
    } else {
      void video.play().catch(() => {
        // A blocked autoplay still leaves the poster and copy usable.
      });
    }
  }, [reduce]);

  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start start', 'end start'] });
  const filmY = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const filmScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const filmDim = useTransform(scrollYProgress, [0, 0.85], [1, 0.35]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -48]);
  const copyFade = useTransform(scrollYProgress, [0, 0.62], [1, 0]);

  return (
    <div
      ref={frameRef}
      className="relative isolate overflow-hidden bg-[#0a0a0b] text-white"
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
        style={{ background: 'linear-gradient(180deg, rgba(10,10,11,0.84) 0%, rgba(10,10,11,0.33) 42%, rgba(10,10,11,0.7) 100%)' }}
      />

      <motion.div
        className="relative z-10 flex items-center justify-center px-5 py-20 sm:px-8 sm:py-24 lg:px-16"
        style={{ minHeight: 'var(--lp-panel-h)', ...(reduce ? {} : { y: copyY, opacity: copyFade }) }}
      >
        <motion.div
          className="mx-auto w-full max-w-4xl text-center"
          initial={{ opacity: 0, y: reduce ? 0 : 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.18 : dur.hero, ease: ease.out }}
        >
          <span className="inline-flex items-center gap-2 mono text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
            [:{lp.hero.tag}]
          </span>
          <h1 className="mx-auto mt-8 max-w-[12ch] font-sans text-[clamp(3.5rem,9vw,8rem)] font-extrabold uppercase leading-[0.88] tracking-[-0.045em] text-balance">
            {lp.hero.titleLine1}{' '}
            {lp.hero.titleLine2}{' '}
            <span className="text-[var(--lp-accent)]">{lp.hero.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[39ch] text-pretty font-sans text-[clamp(1.15rem,2.2vw,1.6rem)] font-medium leading-[1.34] tracking-[-0.015em] text-white/90">
            {lp.hero.body}
          </p>
          <motion.div
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.18 : dur.base, delay: reduce ? 0 : 0.16, ease: ease.out }}
          >
            <Link href="/app" className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-tl-[14px] rounded-tr-[14px] rounded-br-[4px] rounded-bl-[14px] bg-[var(--lp-accent)] px-6 py-3 mono text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--lp-band-dark)] shadow-[0_4px_0_rgba(0,0,0,0.22)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]">
              {lp.hero.ctaPrimary}
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">↘</span>
            </Link>
            <Link href="/how-it-works" className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-tl-[14px] rounded-tr-[14px] rounded-br-[4px] rounded-bl-[14px] border border-white/45 px-6 py-3 mono text-[13px] font-semibold uppercase tracking-[0.08em] text-white transition-colors duration-200 hover:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b]">
              {lp.hero.ctaSecondary}
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">↗</span>
            </Link>
          </motion.div>
          <motion.p
            className="mono mt-8 text-[10px] uppercase tracking-[0.14em] text-white/65"
            animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
            transition={reduce ? undefined : { duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
          >
            {lp.hero.footnote}
          </motion.p>
        </motion.div>
      </motion.div>

      <div className="pointer-events-none absolute inset-x-5 bottom-5 z-10 flex items-end justify-between gap-4 mono text-[10px] uppercase tracking-[0.14em] text-white/60 sm:inset-x-8 lg:inset-x-16">
        <span>[:KARWAN REALITY]</span>
        <span className="hidden sm:inline">CROSS-BORDER WORK IN MOTION</span>
      </div>
    </div>
  );
}

const realityKits = [
  { id: 'escrow', tag: '[:ESCROW]', value: 'USDC HELD', detail: 'MILESTONE 01' },
  { id: 'lane', tag: '[:TRADE LANE]', value: 'LAGOS → DUBAI', detail: 'CROSS-BORDER' },
  { id: 'settle', tag: '[:SETTLE]', value: 'RELEASE READY', detail: 'ON ARC TESTNET' },
];

/** Operational vocabulary sits in its own editorial rail below the film. */
export function RealityKitRail() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % realityKits.length), 2800);
    return () => window.clearInterval(timer);
  }, [reduce]);

  return (
    <div className="border-y border-white/10 bg-[#0a0a0b] px-[clamp(20px,5vw,72px)] py-4 text-white">
      <div className="mx-auto grid max-w-[1440px] gap-3 sm:grid-cols-3">
        {realityKits.map((kit, index) => (
          <motion.div
            key={kit.id}
            animate={reduce ? undefined : { opacity: active === index ? 1 : 0.48, y: active === index ? 0 : 2 }}
            transition={{ duration: reduce ? 0 : 0.35, ease: ease.out }}
            className="flex min-h-11 items-center justify-between gap-4 border border-white/10 bg-white/[0.03] px-3 py-2.5 sm:px-4"
            style={{ borderRadius: 10 }}
          >
            <span className="flex items-center gap-2 mono text-[9px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:text-[10px]">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
              {kit.tag}
            </span>
            <span className="text-end">
              <span className="block font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-white">{kit.value}</span>
              <span className="mt-0.5 block mono text-[8px] uppercase tracking-[0.12em] text-white/45">{kit.detail}</span>
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
