import styles from './WaitlistSeal.module.css';

/// The Karwan M, drawn in one line whose last leg becomes a check mark. Plays
/// once when someone joins; with reduced motion it appears already drawn.
export function WaitlistSeal() {
  return (
    <svg className={styles.seal} viewBox="0 0 512 512" width="72" height="72" aria-hidden>
      <rect className={styles.tile} x="20" y="20" width="472" height="472" rx="72" />
      <path
        className={styles.line}
        d="M92,330 L150,150 L191,262 L232,150 L306,370 L420,248"
        pathLength={1}
      />
    </svg>
  );
}
