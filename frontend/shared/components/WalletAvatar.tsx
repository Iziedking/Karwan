import { cn } from '@/shared/utils/cn';

// Curated gradient pairs so a deterministic avatar always looks intentional,
// never the muddy random-hue conic.
const PAIRS: Array<[string, string]> = [
  ['#7C6BF0', '#AB9FF2'],
  ['#2775CA', '#6CA8FF'],
  ['#0E5E3E', '#2BBF7A'],
  ['#E0623F', '#F2B85C'],
  ['#1B1330', '#5A4E78'],
  ['#0052FF', '#7CA8FF'],
];

/// A deterministic wallet/agent avatar — a clean two-stop gradient orb keyed on
/// the address, with a soft inner highlight.
export function WalletAvatar({
  address,
  size = 28,
  className,
}: {
  address?: string;
  size?: number;
  className?: string;
}) {
  const seed =
    address && address.length >= 8 ? parseInt(address.slice(2, 8), 16) || 0 : 0;
  const [a, b] = PAIRS[seed % PAIRS.length]!;
  const angle = 110 + (seed % 6) * 20;
  return (
    <span
      className={cn('inline-block rounded-full shrink-0', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(${angle}deg, ${a}, ${b})`,
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.5), 0 1px 3px rgba(0,0,0,0.16)',
      }}
      aria-hidden
    />
  );
}
