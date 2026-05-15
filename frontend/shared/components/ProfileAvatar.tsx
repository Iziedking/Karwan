'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { WalletAvatar } from './WalletAvatar';

/// The user's profile icon in the top nav. A deterministic avatar keyed on the
/// wallet address for now; swaps to a bound X profile picture once X account
/// binding ships. Clicking it routes to /profile.
export function ProfileAvatar() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();

  if (!isConnected || !address) return null;

  const active = pathname.startsWith('/profile');

  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      title="Your profile"
      className="relative inline-flex shrink-0 transition-transform hover:-translate-y-0.5"
      style={{
        padding: 2,
        background: active ? 'var(--lp-accent)' : 'var(--color-line)',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
      }}
    >
      <span
        className="inline-flex overflow-hidden"
        style={{
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 1,
        }}
      >
        <WalletAvatar address={address} size={28} />
      </span>
      {active && (
        <span
          aria-hidden
          data-instrument-blink
          className="absolute -top-0.5 -right-0.5 inline-block w-[5px] h-[5px]"
          style={{
            background: 'var(--lp-accent)',
            animation: 'instrumentBlink 1.6s ease-in-out infinite',
          }}
        />
      )}
    </Link>
  );
}
