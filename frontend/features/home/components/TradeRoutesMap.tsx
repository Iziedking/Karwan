'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { WORLD_DOTS, WORLD_HEIGHT, WORLD_WIDTH } from '../worldDots';
import styles from './TradeRoutesMap.module.css';

type City = 'kano' | 'hamburg' | 'lagos' | 'london' | 'johannesburg' | 'shenzhen' | 'nairobi' | 'dubai' | 'toronto';
type Side = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// Positions are dotted-map pins, snapped to the same grid as the land dots.
const CITIES: Record<City, { x: number; y: number; label: Side }> = {
  kano: { x: 63, y: 32.04, label: 'e' },
  hamburg: { x: 63.5, y: 13.86, label: 'ne' },
  lagos: { x: 61, y: 33.77, label: 'sw' },
  london: { x: 59, y: 14.72, label: 'nw' },
  johannesburg: { x: 69, y: 45.9, label: 's' },
  shenzhen: { x: 99.5, y: 27.71, label: 'e' },
  nairobi: { x: 72.5, y: 36.37, label: 'e' },
  dubai: { x: 79, y: 26.85, label: 'n' },
  toronto: { x: 31.5, y: 19.05, label: 'n' },
};

const ROUTES: ReadonlyArray<readonly [City, City]> = [
  ['kano', 'hamburg'],
  ['lagos', 'toronto'],
  ['shenzhen', 'lagos'],
  ['johannesburg', 'london'],
  ['nairobi', 'dubai'],
];

const DOT_RADIUS = 0.24;

// Every land dot in one path, so the browser draws one node instead of three thousand.
const LAND = (() => {
  const r = DOT_RADIUS;
  let d = '';
  for (let i = 0; i < WORLD_DOTS.length; i += 2) {
    d += `M${WORLD_DOTS[i]! - r} ${WORLD_DOTS[i + 1]}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return d;
})();

// Bend each route off its midpoint, always towards the top of the map, so
// north-south routes curve apart instead of stacking.
function arc(from: City, to: City): string {
  const a = CITIES[from];
  const b = CITIES[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  let nx = -dy / length;
  let ny = dx / length;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bend = Math.max(3, length * 0.26);
  return `M${a.x} ${a.y}Q${(a.x + b.x) / 2 + nx * bend} ${(a.y + b.y) / 2 + ny * bend} ${b.x} ${b.y}`;
}

const CYCLE_S = 7;
const STAGGER_S = 0.55;

export function TradeRoutesMap() {
  const t = useTranslations().landingEditorial.routes;
  const reduced = useHydratedReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);

  // Motion runs only while the map is on screen.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || reduced) return;
    if (visible) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [visible, reduced]);

  const cities = [...new Set(ROUTES.flat())];

  return (
    <section className={styles.section} aria-labelledby="routes-title">
      <div className={styles.wrap}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{t.label}</p>
          <h2 id="routes-title">{t.title}</h2>
          <p className={styles.body}>{t.body}</p>
        </header>
        <div className={styles.map} dir="ltr" data-running={visible && !reduced ? 'true' : 'false'} aria-hidden="true">
          <svg ref={svgRef} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} className={styles.svg} focusable="false">
            <path d={LAND} className={styles.land} />
            {ROUTES.map(([from, to], i) => {
              const d = arc(from, to);
              const delay = `${i * STAGGER_S}s`;
              return (
                <g key={`${from}-${to}`}>
                  <path d={d} pathLength={1} className={reduced ? styles.routeStill : styles.route} style={{ animationDelay: delay }} />
                  {!reduced && (
                    <circle r={0.55} className={styles.traveller}>
                      <animateMotion
                        dur={`${CYCLE_S}s`}
                        begin={delay}
                        repeatCount="indefinite"
                        path={d}
                        keyPoints="0;0;1;1"
                        keyTimes="0;0.02;0.45;1"
                        calcMode="linear"
                      />
                      <animate attributeName="opacity" dur={`${CYCLE_S}s`} begin={delay} repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.05;0.42;0.5;1" />
                    </circle>
                  )}
                </g>
              );
            })}
            {cities.map(city => (
              <g key={city}>
                <circle cx={CITIES[city].x} cy={CITIES[city].y} r={1.4} className={styles.halo} />
                <circle cx={CITIES[city].x} cy={CITIES[city].y} r={0.7} className={styles.pin} />
              </g>
            ))}
          </svg>
          {cities.map(city => (
            <span
              key={city}
              className={styles.label}
              data-side={CITIES[city].label}
              style={{ left: `${(CITIES[city].x / WORLD_WIDTH) * 100}%`, top: `${(CITIES[city].y / WORLD_HEIGHT) * 100}%` }}
            >
              {t.cities[city]}
            </span>
          ))}
        </div>
        <p className={styles.note}>{t.note}</p>
      </div>
    </section>
  );
}
