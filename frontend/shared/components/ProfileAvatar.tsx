'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';

/// The user's profile icon in the top nav. A deterministic identicon keyed on
/// the wallet address for now; swaps to a bound X profile picture once X account
/// binding ships. Clicking it routes to /profile.
export function ProfileAvatar() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();

  if (!isConnected || !address) return null;

  const active = pathname.startsWith('/profile');
  const hue = parseInt(address.slice(2, 8), 16) % 360;

  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      title="Your profile"
      className={`inline-flex shrink-0 rounded-full transition-transform hover:scale-105 ${
        active ? 'ring-2 ring-[var(--color-ink)] ring-offset-2 ring-offset-[var(--color-surface)]' : ''
      }`}
    >
      <span
        className="block w-7 h-7 rounded-full"
        style={{
          background: `conic-gradient(from 210deg at 50% 50%, hsl(${hue} 65% 55%), hsl(${(hue + 80) % 360} 55% 45%), hsl(${(hue + 200) % 360} 60% 50%), hsl(${hue} 65% 55%))`,
          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.14)',
        }}
        aria-hidden
      />
    </Link>
  );
}
