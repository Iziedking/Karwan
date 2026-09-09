'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { CAPABILITIES, CAPABILITY_COPY, canRotateStory, STORY_INTERVAL_MS } from '../capabilityStory';

/** One explanation of Karwan for the landing page and the signed-in workspace. */
export function CapabilityIntro({ landing = false }: { landing?: boolean }) {
  const { locale } = useLocale();
  const copy = CAPABILITY_COPY[locale];
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const pausedBeforePointer = useRef(false);
  const running = canRotateStory({ paused, reduced: reduced !== false, hovered, visible, inView });

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % CAPABILITIES.length), STORY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [running, index]);

  return (
    <div ref={ref} className={`capability-intro${landing ? ' capability-intro-landing' : ''}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(true); }}>
      <h1 id={landing ? 'landing-heading' : 'home-heading'} className="capability-eyebrow">{copy.heading}</h1>
      <div className="capability-scenes" aria-live={running ? 'off' : 'polite'} aria-atomic="true">
        {CAPABILITIES.map((scene, sceneIndex) => {
          const selected = index === sceneIndex;
          const text = copy.scenes[scene.id];
          return (
            <motion.section key={scene.id} id={`${id}-${scene.id}`} aria-hidden={!selected} inert={!selected}
              className="capability-scene" data-active={selected} initial={false}
              animate={{ opacity: selected ? 1 : 0, y: selected || reduced ? 0 : 10 }}
              transition={{ duration: reduced ? 0 : selected ? 0.5 : 0.16, delay: selected && !reduced ? 0.14 : 0, ease: [0.16, 1, 0.3, 1] }}>
              <h2>{text.title}</h2>
              <p className="capability-body">{text.body}</p>
              <div className="capability-handoff">
                <span>{text.from}</span>
                <span className="capability-handoff-line" aria-hidden><span>→</span></span>
                <span>{text.to}</span>
              </div>
              <div className="capability-actions">
                <Link href={scene.href} className="capability-action-primary">{text.action}<span aria-hidden>↗</span></Link>
                <Link href="/how-it-works" className="capability-action-secondary">{copy.guide}<span aria-hidden>→</span></Link>
              </div>
            </motion.section>
          );
        })}
      </div>
      <div className="capability-controls" role="group" aria-label={copy.controls}>
        {CAPABILITIES.map((scene, sceneIndex) => (
          <button key={scene.id} type="button" aria-pressed={index === sceneIndex} aria-controls={`${id}-${scene.id}`}
            onClick={() => { setIndex(sceneIndex); setPaused(true); }}>
            {copy.scenes[scene.id].label}
            {index === sceneIndex && <motion.span aria-hidden layoutId={`${id}-selection`} className="capability-selected" transition={{ duration: reduced ? 0 : 0.3 }} />}
          </button>
        ))}
        {!reduced && <button type="button" className="capability-play" aria-label={paused ? copy.play : copy.pause}
          onPointerDown={() => { pausedBeforePointer.current = paused; }}
          onClick={(event) => setPaused(event.detail > 0 ? !pausedBeforePointer.current : !paused)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            {paused ? <path d="m5 3 7 5-7 5V3Z" fill="currentColor" /> : <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2" />}
          </svg>
        </button>}
      </div>
    </div>
  );
}
