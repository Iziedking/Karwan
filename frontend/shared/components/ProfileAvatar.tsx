'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { api, type UserProfile } from '@/core/api';
import { cn } from '@/shared/utils/cn';
import { WalletAvatar } from './WalletAvatar';

/// The user's profile entry in the top nav. Identity comes from the SESSION
/// (useAuth), not wagmi, so it works for BOTH wallet users and email/Circle
/// users; the old useAccount() gate rendered nothing for email users, who have
/// no wagmi connection, hiding their profile entirely. Shows a deterministic
/// mark (or the bound X picture) plus an explicit "Profile" label so users know
/// it opens their profile instead of having to discover an unlabeled icon. The
/// label collapses on small screens, where the menu carries Profile. Routes to
/// /profile.
export function ProfileAvatar() {
  const { address, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const nav = useTranslations().nav;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => {
    if (!address || !isAuthenticated) {
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
  }, [address, isAuthenticated, pathname]);

  if (!isAuthenticated || !address) return null;

  const active = pathname.startsWith('/profile');
  const xImage = imageOk ? profile?.xProfileImageUrl : undefined;

  return (
    <Link
      href="/profile"
      aria-label={nav.hints.profile}
      title={nav.hints.profile}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border p-1 transition-colors',
        active
          ? 'border-[var(--lp-accent)] bg-[var(--color-surface-2)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {xImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={xImage}
          alt=""
          width={26}
          height={26}
          className="rounded-full object-cover w-[26px] h-[26px]"
          onError={() => setImageOk(false)}
        />
      ) : (
        <WalletAvatar address={address} size={26} />
      )}
      <span className="hidden md:inline pe-2 mono text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--color-ink-dim)]">
        {nav.profile}
      </span>
    </Link>
  );
}
