'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { Note } from '@/shared/components/AppUI';
import { api, type UserProfile, type UserRole, ApiError } from '@/core/api';

type Option = { value: UserRole; label: string; description: string };

const OPTIONS: Option[] = [
  { value: 'buyer', label: 'Buyer', description: 'Post briefs, accept bids' },
  { value: 'seller', label: 'Seller', description: 'Bid on briefs, deliver work' },
  { value: 'both', label: 'Both', description: 'One profile, both sides' },
];

export function RoleToggle({
  profile,
  onUpdate,
}: {
  profile: UserProfile;
  onUpdate: (next: UserProfile) => void;
}) {
  const [submitting, setSubmitting] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function eligibilityFor(role: UserRole): { ok: boolean; reason?: string } {
    const wantsBuyer = role === 'buyer' || role === 'both';
    const wantsSeller = role === 'seller' || role === 'both';
    if (wantsBuyer && !profile.buyer) return { ok: false, reason: 'Add buyer details first' };
    if (wantsSeller && !profile.seller) return { ok: false, reason: 'Add seller details first' };
    return { ok: true };
  }

  async function switchTo(role: UserRole) {
    if (role === profile.role) return;
    const eligibility = eligibilityFor(role);
    if (!eligibility.ok) {
      router.push(`/onboarding?role=${role}`);
      return;
    }
    setSubmitting(role);
    setError(null);
    try {
      const next = await api.saveProfile({
        address: profile.address,
        role,
        displayName: profile.displayName,
        ...(profile.seller && { seller: profile.seller }),
        ...(profile.buyer && { buyer: profile.buyer }),
      });
      onUpdate(next.profile);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not switch role';
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3">
          <Note tone="error">{error}</Note>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Account type">
        {OPTIONS.map((opt) => {
          const active = profile.role === opt.value;
          const eligibility = eligibilityFor(opt.value);
          const busy = submitting === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => switchTo(opt.value)}
              disabled={busy || active}
              title={!eligibility.ok ? eligibility.reason : undefined}
              className={cn(
                'relative text-left rounded-[20px] p-5 min-h-[104px] transition-all duration-200 text-[var(--lp-dark)]',
                active
                  ? 'bg-[var(--lp-card)] ring-2 ring-[var(--lp-dark)]'
                  : eligibility.ok
                    ? 'bg-[var(--lp-light)] hover:-translate-y-0.5'
                    : 'bg-[var(--lp-light)] opacity-55 cursor-help',
              )}
            >
              {active && (
                <span className="absolute top-4 right-4 inline-flex size-5 items-center justify-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)]">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
              <span className="text-[15px] font-bold tracking-[-0.01em]">{opt.label}</span>
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--lp-text-sub)]">
                {busy ? 'Saving…' : !eligibility.ok ? eligibility.reason : opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
