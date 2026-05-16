import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export type ChainKey = 'arc' | 'base' | 'ethereum' | 'baseSepolia' | 'sepolia';

function normalize(k: ChainKey): 'arc' | 'base' | 'ethereum' {
  if (k === 'baseSepolia') return 'base';
  if (k === 'sepolia') return 'ethereum';
  return k;
}

/// Brand-coloured chain marks on rounded tiles. Ethereum is the real diamond,
/// Base is its blue ring. Arc is a placeholder arc curve. swap in the real
/// Arc logo here when it lands.
export function ChainLogo({
  chain,
  size = 28,
  className,
}: {
  chain: ChainKey;
  size?: number;
  className?: string;
}) {
  const c = normalize(chain);
  const s = Math.round(size * 0.6);

  const tile = (bg: string, mark: ReactNode) => (
    <span
      className={cn('inline-flex items-center justify-center rounded-[8px] shrink-0', className)}
      style={{
        width: size,
        height: size,
        background: bg,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
      aria-label={c}
    >
      {mark}
    </span>
  );

  if (c === 'ethereum') {
    return tile(
      '#627EEA',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M16 3 L16 13 L24 16.5 Z" fill="#fff" fillOpacity="0.95" />
        <path d="M16 3 L8 16.5 L16 13 Z" fill="#fff" fillOpacity="0.6" />
        <path d="M16 18 L16 29 L24 18.5 Z" fill="#fff" fillOpacity="0.95" />
        <path d="M16 18 L8 18.5 L16 29 Z" fill="#fff" fillOpacity="0.6" />
      </svg>,
    );
  }

  if (c === 'base') {
    return tile(
      '#0052FF',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle cx="16" cy="16" r="11.5" stroke="#fff" strokeWidth="3" />
      </svg>,
    );
  }

  // Arc. render the literal brand mark from /public so we never drift from
  // the real logo.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/arc-logo.png"
      alt="Arc"
      width={size}
      height={size}
      className={cn('inline-block rounded-[8px] shrink-0 object-cover', className)}
      style={{
        width: size,
        height: size,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
    />
  );
}
