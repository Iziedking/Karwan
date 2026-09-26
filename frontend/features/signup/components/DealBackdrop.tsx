'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import styles from './DealBackdrop.module.css';

const AMOUNTS = [150, 420, 900, 80, 1800, 60];
const STATES = ['agreed', 'locked', 'delivered', 'paid'] as const;
const STEP_MS = 1800;

/// Behind the sign-in card: the kinds of deals people make on Karwan, each
/// moving from agreed to paid. Decorative, so hidden from assistive tech; with
/// reduced motion the cards hold still at their final state.
export function DealBackdrop() {
  const t = useTranslations().signup;
  const [tick, setTick] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setTick((n) => n + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, [still]);

  const cards = t.backdrop.deals.map((title, i) => {
    const state = still ? 3 : (tick + i * 3) % (STATES.length + 1);
    return { title, amount: AMOUNTS[i] ?? 0, state: Math.min(state, 3) };
  });
  const columns = [cards.slice(0, 2), cards.slice(2, 4), cards.slice(4, 6)];

  return (
    <div className={styles.backdrop} aria-hidden data-still={still || undefined}>
      {columns.map((column, c) => (
        <div key={c} className={styles.column} style={{ animationDelay: `${c * -14}s` }}>
          {[...column, ...column].map((card, k) => (
            <div key={k} className={styles.card}>
              <p className={styles.title}>{card.title}</p>
              <p className={styles.amount}>
                {card.amount.toLocaleString('en-US')} <span>USDC</span>
              </p>
              <div className={styles.track}>
                {STATES.map((s, n) => (
                  <span key={s} className={styles.pip} data-on={n <= card.state || undefined} data-paid={card.state === 3 || undefined} />
                ))}
              </div>
              <p className={styles.state} data-paid={card.state === 3 || undefined}>
                {t.backdrop.states[STATES[card.state]]}
              </p>
            </div>
          ))}
        </div>
      ))}
      <div className={styles.scrim} />
    </div>
  );
}
