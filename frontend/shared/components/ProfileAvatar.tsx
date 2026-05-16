'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type UserProfile } from '@/core/api';
import { WalletAvatar } from './WalletAvatar';

/// The user's profile icon in the top nav. Prefers the bound X display
/// picture when present; otherwise falls back to a deterministic mark keyed
/// on the wallet address. Clicking routes to /profile.
export function ProfileAvatar() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    api
      .getProfile(address)
      .then((r) => {
        if (!cancelled) {
          setProfile(r.profile);
          setImageOk(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, pathname]);

  if (!isConnected || !address) return null;

  const active = pathname.startsWith('/profile');
  const xImage = imageOk ? profile?.xProfileImageUrl : undefined;

  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      title={profile?.xHandle ? `@${profile.xHandle}` : 'Your profile'}
      className={`inline-flex shrink-0 rounded-full transition-transform hover:scale-105 ${
        active
          ? 'ring-2 ring-[var(--lp-accent)] ring-offset-2 ring-offset-[var(--color-surface)]'
          : ''
      }`}
    >
      {xImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={xImage}
          alt=""
          width={28}
          height={28}
          className="rounded-full object-cover w-[28px] h-[28px]"
          onError={() => setImageOk(false)}
        />
      ) : (
        <WalletAvatar address={address} size={28} />
      )}
    </Link>
  );
}
