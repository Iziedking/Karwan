'use client';

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { rememberReturn } from '@/features/assistant/assistantReturn';
import { carryAsk } from '@/features/assistant/carriedAsk';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { landingCopy } from '@/shared/i18n/messages/landing';
import { createBody, reachesTarget, settled, step, wake, type Body } from '../chipPhysics';
import { useInView, useReducedMotionPreference } from '../useLandingMotion';
import s from '../landing.module.css';

/// Chips in green or ink, in drawn order; the rest are outlined.
const TONES: Record<number, 'green' | 'ink'> = { 1: 'green', 2: 'ink', 4: 'ink', 7: 'ink', 8: 'green' };
/// The angle each chip lands at, so the pile looks thrown, not stacked.
const TILT = [0, 0, -4, 0, 3, 0, 5, -6, 5, -3];

interface Drag { index: number; dx: number; dy: number; lastX: number; lastY: number; lastT: number; vx: number; vy: number; moved: number }

/// Section 5: things to ask your agent. They drop in and bounce; on a desktop
/// you can throw one into the chat bar. Any chip, tapped or thrown, and
/// anything typed, opens the assistant with the words already asked.
export function AskChips() {
  const { locale } = useLocale();
  const t = (landingCopy[locale] ?? landingCopy.en).ask;
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotionPreference();
  const panel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLFormElement>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const bodies = useRef<Body[]>([]);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const frame = useRef(0);
  const sent = useRef(false);
  const arrived = useInView(panel, { once: true, rootMargin: '0px 0px -20% 0px' });
  const onScreen = useInView(panel);
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');

  const send = (words: string) => {
    const clean = words.trim();
    if (!clean || sent.current) return;
    sent.current = true;
    carryAsk(clean);
    rememberReturn(pathname);
    router.push('/assistant');
  };

  const draw = () => {
    bodies.current.forEach((b, i) => {
      const el = chips.current[i];
      if (el) el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${TILT[i] ?? 0}deg)`;
    });
  };

  const loop = useRef<() => void>(() => {});
  loop.current = () => {
    const box = panel.current;
    const target = bar.current;
    if (!box) return;
    const width = box.clientWidth;
    const height = box.clientHeight;
    const result = step(bodies.current, { width, height }, 1 / 60);
    bodies.current = result.bodies;
    result.impacts.forEach((i) => {
      const el = chips.current[i];
      if (!el) return;
      el.dataset.squash = '';
      window.setTimeout(() => { delete el.dataset.squash; }, 140);
    });
    if (target) {
      const rect = { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
      const hit = bodies.current.findIndex((b) => !b.held && reachesTarget(b, rect));
      if (hit >= 0) send(t.chips[hit]);
    }
    draw();
    if (!settled(bodies.current) || drag.current) frame.current = requestAnimationFrame(() => loop.current());
    else frame.current = 0;
  };

  const run = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => loop.current());
  };

  // Drop the chips in once the panel arrives. Reduced motion keeps the still pile.
  useEffect(() => {
    if (!arrived || reduced || live) return;
    const box = panel.current;
    if (!box) return;
    const width = box.clientWidth;
    bodies.current = chips.current.map((el, i) => {
      const w = el?.offsetWidth ?? 160;
      const h = el?.offsetHeight ?? 48;
      const x = ((i * 0.37) % 1) * Math.max(0, width - w);
      return createBody({ x, y: -h - i * 70, w, h });
    });
    setLive(true);
  }, [arrived, reduced, live]);

  // Placed before the first paint, so no chip shows at the corner.
  useLayoutEffect(() => {
    if (!live) return;
    draw();
    run();
    return () => { cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [live]);

  // Off screen the loop stops; back on screen, anything still moving carries on.
  useEffect(() => {
    if (live && onScreen && !settled(bodies.current)) run();
    if (!onScreen && frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
  }, [onScreen, live]);

  // A resize re-measures the panel and lets the chips fall into it again.
  useEffect(() => {
    if (!live) return;
    const onResize = () => { bodies.current = bodies.current.map(wake); run(); };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [live]);

  const canThrow = () => live && window.matchMedia('(pointer: fine)').matches;

  const down = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    suppressClick.current = false;
    if (!canThrow()) return;
    const box = panel.current!.getBoundingClientRect();
    const b = bodies.current[i];
    drag.current = { index: i, dx: e.clientX - box.left - b.x, dy: e.clientY - box.top - b.y, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, vy: 0, moved: 0 };
    bodies.current[i] = { ...wake(b), held: true, vx: 0, vy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    run();
  };

  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const box = panel.current!.getBoundingClientRect();
    const dt = Math.max(1, e.timeStamp - d.lastT) / 1000;
    d.vx = (e.clientX - d.lastX) / dt;
    d.vy = (e.clientY - d.lastY) / dt;
    d.moved += Math.abs(e.clientX - d.lastX) + Math.abs(e.clientY - d.lastY);
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const b = bodies.current[d.index];
    bodies.current[d.index] = { ...b, x: e.clientX - box.left - d.dx, y: e.clientY - box.top - d.dy };
  };

  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const b = bodies.current[d.index];
    const clamp = (v: number) => Math.max(-3200, Math.min(3200, v));
    bodies.current[d.index] = { ...b, held: false, thrown: d.moved > 6, vx: clamp(d.vx), vy: clamp(d.vy) };
    if (d.moved > 6) suppressClick.current = true;
    run();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <section className={s.ask} aria-labelledby="landing-ask">
      <header className={s.sectionHead}>
        <div>
          <p className={s.eyebrow}>{t.eyebrow}</p>
          <h2 id="landing-ask" className={s.sectionTitle}>{t.title}</h2>
        </div>
        <p className={s.lead}>{t.lede}</p>
      </header>
      <div ref={panel} className={s.toss} data-live={live ? '' : undefined}>
        <form ref={bar} className={s.chatBar} onSubmit={submit}>
          <label htmlFor="landing-ask-input" className={s.srOnly}>{t.placeholder}</label>
          <input id="landing-ask-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} autoComplete="off" />
          <button type="submit" aria-label={t.send}><Icon name="send" size={20} aria-hidden /></button>
        </form>
        <div className={s.pile}>
          {t.chips.map((chip, i) => (
            <button
              key={chip}
              ref={(el) => { chips.current[i] = el; }}
              type="button"
              className={s.chip}
              data-tone={TONES[i]}
              style={live ? undefined : { rotate: `${TILT[i] ?? 0}deg` }}
              onPointerDown={down(i)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                send(chip);
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
      <p className={s.hint}>{t.hint}</p>
    </section>
  );
}
