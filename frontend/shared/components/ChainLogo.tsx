import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export type ChainKey =
  | 'arc'
  | 'base'
  | 'ethereum'
  | 'optimism'
  | 'arbitrum'
  | 'polygon'
  | 'baseSepolia'
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'polygonAmoy';

type BaseChain = 'arc' | 'base' | 'ethereum' | 'optimism' | 'arbitrum' | 'polygon';

function normalize(k: ChainKey): BaseChain {
  if (k === 'baseSepolia') return 'base';
  if (k === 'sepolia') return 'ethereum';
  if (k === 'optimismSepolia') return 'optimism';
  if (k === 'arbitrumSepolia') return 'arbitrum';
  if (k === 'polygonAmoy') return 'polygon';
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

  if (c === 'optimism') {
    return tile(
      '#FF0420',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle cx="11" cy="16" r="4.4" stroke="#fff" strokeWidth="2.4" />
        <path
          d="M18.5 20.5c2.6 0 4.4-1.7 4.8-4 .3-1.9-.6-3-2.4-3-2.6 0-4.4 1.7-4.8 4-.3 1.9.6 3 2.4 3z"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>,
    );
  }

  if (c === 'arbitrum') {
    return tile(
      '#1B4ADD',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M16 6 L24 24 H19 L16 16 L13 24 H8 Z"
          fill="#fff"
          fillOpacity="0.95"
        />
      </svg>,
    );
  }

  if (c === 'polygon') {
    return tile(
      '#7B3FE4',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M16 7l7 4v4l-7 4-4-2.3v-3.4l4 2.3 3-1.7v-1.8l-3-1.7-7 4v4l7 4 7-4"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
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
