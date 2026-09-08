'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { api, type UserProfile } from '@/core/api';
import { cn } from '@/shared/utils/cn';
import { WalletAvatar } from './WalletAvatar';
import { ActionBeacon } from './ActionBeacon';

/// The user's profile entry in the top nav. Identity comes from the SESSION
/// (useAuth), not wagmi, so it works for BOTH wallet users and email/Circle
/// users; the old useAccount() gate rendered nothing for email users, who have
/// no wagmi connection, hiding their profile entirely. Shows the bound X image
/// when available, the account's display name, and a clear chevron affordance.
/// On small screens the compact preferences control remains in the menu.
export function ProfileAvatar({ actionCount = 0 }: { actionCount?: number }) {
  const { address, email, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const messages = useTranslations();
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

  const xImage = imageOk ? profile?.xProfileImageUrl : undefined;
  const identityName =
    profile?.displayName?.trim() ||
    email?.split('@')[0]?.trim() ||
    `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('karwan:open-account'))}
      aria-label={
        actionCount > 0
          ? `${identityName} · ${actionCount} ${messages.pending.deals.sectionTag}`
          : identityName
      }
      className={cn(
        'group inline-flex min-h-11 max-w-[min(320px,34vw)] shrink-0 items-center gap-2.5 rounded-full px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
        'hover:bg-[var(--color-surface-2)]',
      )}
    >
      <span className="relative grid size-12 shrink-0 place-items-center">
        {xImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={xImage}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-full object-cover"
            onError={() => setImageOk(false)}
          />
        ) : (
          <WalletAvatar address={address} size={48} />
        )}
        {actionCount > 0 ? <ActionBeacon className="absolute -bottom-0.5 -end-0.5" /> : null}
      </span>
      <span className="hidden min-w-0 truncate pe-1 font-sans text-[14px] font-medium tracking-[-0.01em] text-[var(--color-ink)] md:inline">
        {identityName}
      </span>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
        className="hidden shrink-0 text-[var(--color-ink)] transition-transform duration-200 group-hover:translate-x-0.5 md:inline"
      >
        <path d="m7.5 4.5 5 5.5-5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
