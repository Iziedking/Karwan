import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export type ChainKey =
  | 'arc'
  | 'base'
  | 'ethereum'
  | 'optimism'
  | 'arbitrum'
  | 'polygon'
  | 'solana'
  | 'avalanche'
  | 'unichain'
  | 'sei'
  | 'sonic'
  | 'worldchain'
  | 'hyperevm'
  | 'baseSepolia'
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'polygonAmoy'
  | 'solanaDevnet'
  | 'avalancheFuji'
  | 'unichainSepolia'
  | 'seiTestnet'
  | 'sonicTestnet'
  | 'worldchainSepolia'
  | 'hyperevmTestnet';

type BaseChain =
  | 'arc'
  | 'base'
  | 'ethereum'
  | 'optimism'
  | 'arbitrum'
  | 'polygon'
  | 'solana'
  | 'avalanche'
  | 'unichain'
  | 'sei'
  | 'sonic'
  | 'worldchain'
  | 'hyperevm';

function normalize(k: ChainKey): BaseChain {
  if (k === 'baseSepolia') return 'base';
  if (k === 'sepolia') return 'ethereum';
  if (k === 'optimismSepolia') return 'optimism';
  if (k === 'arbitrumSepolia') return 'arbitrum';
  if (k === 'polygonAmoy') return 'polygon';
  if (k === 'solanaDevnet') return 'solana';
  if (k === 'avalancheFuji') return 'avalanche';
  if (k === 'unichainSepolia') return 'unichain';
  if (k === 'seiTestnet') return 'sei';
  if (k === 'sonicTestnet') return 'sonic';
  if (k === 'worldchainSepolia') return 'worldchain';
  if (k === 'hyperevmTestnet') return 'hyperevm';
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
    // Arbitrum navy with the signature white double-slash + two-tone peak
    // (white left face, cyan right face).
    return tile(
      '#213147',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M8.5 23 L12 9.5 L13.6 9.5 L10.1 23 Z" fill="#fff" />
        <path d="M17 9 L11.8 23 L14.8 23 L17 16 Z" fill="#fff" />
        <path d="M17 9 L22.2 23 L19.2 23 L17 16 Z" fill="#28A0F0" />
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

  if (c === 'solana') {
    // Solana's signature three-bar gradient mark, drawn as flat fills so the
    // tile sits cleanly next to the EVM marks (matches the codebase rule
    // against AI gradients on chain logos). Dark backdrop with the brand's
    // teal + magenta strokes flat-coloured.
    return tile(
      '#0B0F1A',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M9 11 L24 11 L21 14 L6 14 Z" fill="#14F195" />
        <path d="M9 17.5 L24 17.5 L21 20.5 L6 20.5 Z" fill="#9945FF" />
        <path d="M9 24 L24 24 L21 27 L6 27 Z" fill="#14F195" />
      </svg>,
    );
  }

  if (c === 'avalanche') {
    // Avalanche red with the white peak split by the brand's angled notch.
    return tile(
      '#E84142',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M16 6.5 L26 24.5 L20.4 24.5 L16 16.6 Z" fill="#fff" />
        <path d="M16 6.5 L6 24.5 L11.6 24.5 L16 16.6 Z" fill="#fff" />
        <path d="M13.4 24.5 L16.6 19 L19.8 24.5 Z" fill="#E84142" />
      </svg>,
    );
  }

  if (c === 'unichain') {
    return tile(
      '#F50DB4',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M16 6 A10 10 0 0 1 16 26 L16 6 Z" fill="#fff" fillOpacity="0.95" />
        <circle cx="16" cy="16" r="10" stroke="#fff" strokeWidth="2" />
      </svg>,
    );
  }

  if (c === 'sei') {
    return tile(
      '#9E1F19',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M6 20 L18 8 L26 8 L14 20 Z" fill="#fff" />
        <path d="M9 24 L21 12 L26 12 L17 24 Z" fill="#fff" fillOpacity="0.55" />
      </svg>,
    );
  }

  if (c === 'sonic') {
    return tile(
      '#FE9A4D',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M18 5 L9 18 L15 18 L13 27 L23 13 L17 13 Z" fill="#fff" />
      </svg>,
    );
  }

  if (c === 'worldchain') {
    return tile(
      '#0B0B0B',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle cx="16" cy="16" r="10" stroke="#fff" strokeWidth="2" />
        <path d="M6.4 13.6 L25.6 13.6 M6.4 18.4 L25.6 18.4" stroke="#fff" strokeWidth="2" />
      </svg>,
    );
  }

  if (c === 'hyperevm') {
    return tile(
      '#072723',
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M6 18.5c2.6-6 5.2-6 7.8-2.4 2.6 3.6 5.2 3.6 7.8-2.4"
          stroke="#97FCE4"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="24.5" cy="12" r="1.8" fill="#97FCE4" />
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
