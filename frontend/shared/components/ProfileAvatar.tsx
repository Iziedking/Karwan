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
      className={`inline-flex shrink-0 rounded-full transition-transform hover:scale-105 ${
        active
          ? 'ring-2 ring-[var(--lp-accent)] ring-offset-2 ring-offset-[var(--color-surface)]'
          : ''
      }`}
    >
      <WalletAvatar address={address} size={28} />
    </Link>
  );
}
