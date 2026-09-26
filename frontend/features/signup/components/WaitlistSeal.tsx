import styles from './WaitlistSeal.module.css';

/// The Karwan mark drawing itself (the exact stroke from
/// public/brand/karwan-mark-lime.svg), then a check badge landing on its
/// corner. Plays once when someone joins; with reduced motion it appears drawn.
export function WaitlistSeal() {
  return (
    <svg className={styles.seal} viewBox="0 0 600 600" width="84" height="84" aria-hidden>
      <path className={styles.tile} d="M56,20 L456,20 Q492,20 492,56 L492,456 Q492,492 456,492 L92,492 Q20,492 20,420 L20,56 Q20,20 56,20 Z" />
      <path className={styles.mark} d="M148,362 L215,150 L256,278 L297,150 L364,362" pathLength={1} />
      <g className={styles.badge}>
        <circle cx="478" cy="478" r="104" className={styles.badgeRing} />
        <circle cx="478" cy="478" r="86" className={styles.badgeFill} />
        <path className={styles.check} d="M432,480 L464,512 L526,446" pathLength={1} />
      </g>
    </svg>
  );
}
