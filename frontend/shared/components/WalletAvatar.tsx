import { cn } from '@/shared/utils/cn';

// A deterministic identicon: a mirrored 5x5 grid keyed on the address, in a
// single brand-adjacent ink color on a faint tint of itself. Reads as an
// address fingerprint, not a generic gradient orb. This is a placeholder —
// it gives way to the bound X profile picture once X account binding ships.

const PALETTE = ['#0e0e0e', '#2c3e63', '#1f7a3f', '#b45309', '#5b4b8a', '#0b6b6b', '#9a1f3a'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export function WalletAvatar({
  address,
  size = 28,
  className,
}: {
  address?: string;
  size?: number;
  className?: string;
}) {
  const h = hash((address ?? '').toLowerCase() || 'karwan');
  const fg = PALETTE[h % PALETTE.length]!;

  // Deterministic per-cell bits from a small LCG seeded by the hash.
  let r = h || 1;
  const bit = () => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return ((r >> 8) & 1) === 1;
  };

  const rects: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (bit()) {
        rects.push({ x, y });
        if (x < 2) rects.push({ x: 4 - x, y });
      }
    }
  }

  return (
    <span
      className={cn('inline-block overflow-hidden rounded-full shrink-0', className)}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${fg} 14%, #ffffff)`,
        boxShadow: 'inset 0 0 0 1px rgba(12,14,16,0.08)',
      }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges">
        {rects.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={1} height={1} fill={fg} />
        ))}
      </svg>
    </span>
  );
}
