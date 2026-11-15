'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { landingCopy } from '@/shared/i18n/messages/landing';
import { figureParts, formatFigure } from '../figures';
import { stagger } from '../motion';
import { TRADE_CLIPS, clipFiles, type TradeClip } from '../tradeClips';
import { useClipChoice, useInView, useMostInView, useReducedMotionPreference } from '../useLandingMotion';
import { useMotionLevel } from '@/shared/motion/MotionLevel';
import s from '../landing.module.css';

/// How many milestones each kind of trade has, and how many are released.
const ROUTES: Record<TradeClip['key'], { steps: number; done: number }> = {
  tailor: { steps: 3, done: 1 },
  market: { steps: 2, done: 1 },
  developer: { steps: 4, done: 2 },
  designer: { steps: 2, done: 2 },
  seller: { steps: 1, done: 1 },
  finance: { steps: 3, done: 1 },
};

/// Counts the figure up once when its tile is fully in view.
function Figure({ text, start }: { text: string; start: boolean }) {
  const reduced = useReducedMotionPreference();
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const parts = figureParts(text);
    if (!start || !parts || reduced) {
      setShown(text);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - began) / 900);
      setShown(formatFigure(parts, parts.value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, text, reduced]);
  return <strong className={s.figure}><span className={s.srOnly}>{text}</span><span aria-hidden>{shown}</span></strong>;
}

const ORDER = TRADE_CLIPS.map((clip) => clip.key);

function Tile({ clip, index, playing, register }: { clip: TradeClip; index: number; playing: boolean; register: (key: string, el: Element | null) => void }) {
  const { locale } = useLocale();
  const t = landingCopy[locale] ?? landingCopy.en;
  const item = t.trades.items[clip.key];
  const route = ROUTES[clip.key];
  const ref = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const arrived = useInView(ref, { once: true, rootMargin: '0px 0px -10% 0px' });
  const full = useInView(ref, { once: true, rootMargin: '0px 0px -35% 0px' });
  // The clip is fetched only once its tile is a screen away (view 86).
  const near = useInView(ref, { once: true, rootMargin: '100% 0px' });
  const choice = useClipChoice(ref, useMotionLevel() === 'lite' ? 'small' : undefined);
  const files = clipFiles(clip.key);
  /// The poster stays under the clip, which fades in on its first frame, so
  /// the tile never shows a blank frame between the two.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (playing) void el.play().catch(() => {});
    else el.pause();
  }, [playing, choice, near]);

  const setRef = useCallback((el: HTMLElement | null) => {
    ref.current = el;
    register(clip.key, el);
  }, [register, clip.key]);

  return (
    <article ref={setRef} className={s.tile} data-wide={index % 4 === 0 || index % 4 === 3 ? '' : undefined} data-arrived={arrived ? '' : undefined} data-drawn={full ? '' : undefined} style={{ transitionDelay: `${stagger(index % 2)}ms` }}>
      <img className={s.clip} src={files.poster} alt="" loading="lazy" decoding="async" />
      {near && choice !== 'poster' && (
        <video key={choice} ref={video} className={s.clip} muted loop playsInline preload="none" poster={files.poster} aria-hidden="true" data-ready={ready ? '' : undefined} onPlaying={() => setReady(true)}>
          <source src={choice === 'small' ? files.small : files.large} type="video/mp4" />
        </video>
      )}
      <div className={s.tileShade} aria-hidden />
      <span className={s.tileIndex} aria-hidden>{String(index + 1).padStart(2, '0')}</span>
      <span className={s.place}>{item.from} → {item.to}</span>
      <div className={s.tileText}>
        <div>
          <h3>{item.title}</h3>
          <p>{item.label}</p>
        </div>
        <div className={s.tileFigure}>
          <Figure text={item.figure} start={full} />
          <span>{item.caption}</span>
        </div>
      </div>
      <div className={s.route} aria-label={t.trades.released.replace('{done}', String(route.done)).replace('{total}', String(route.steps))} role="img">
        <span>{item.from}</span>
        <div className={s.track}>
          <i style={{ ['--done' as string]: route.done / route.steps }} />
          {Array.from({ length: route.steps }, (_, k) => <b key={k} data-on={k < route.done ? '' : undefined} style={{ insetInlineStart: `${((k + 1) / route.steps) * 100}%`, ['--k' as string]: k }} />)}
        </div>
        <span>{item.to}</span>
      </div>
    </article>
  );
}

/// Section 3: six kinds of trade, each a looping clip behind its title, route
/// and one green figure. Kinds of trade, never customers (SOURCES.md).
export function TradeCases() {
  const { locale } = useLocale();
  const t = (landingCopy[locale] ?? landingCopy.en).trades;
  // Only the tile most in view plays; the rest hold their frame (view 86).
  const tiles = useRef(new Map<string, Element>());
  const register = useCallback((key: string, el: Element | null) => {
    if (el) tiles.current.set(key, el);
    else tiles.current.delete(key);
  }, []);
  const playing = useMostInView(tiles, ORDER);
  return (
    <section className={s.trades} aria-labelledby="landing-trades">
      <div className={s.glow} aria-hidden />
      <span className={s.wordmarkTouch} data-top="" aria-hidden>Karwan</span>
      <header className={s.sectionHead}>
        <div>
          <p className={s.eyebrow}>{t.eyebrow}</p>
          <h2 id="landing-trades" className={s.sectionTitle}>{t.title}</h2>
        </div>
      </header>
      <div className={s.tiles}>
        {TRADE_CLIPS.map((clip, index) => <Tile key={clip.key} clip={clip} index={index} playing={playing === clip.key} register={register} />)}
      </div>
    </section>
  );
}
