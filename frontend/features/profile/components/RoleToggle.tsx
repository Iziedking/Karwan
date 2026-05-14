'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      <div className="flex items-baseline justify-between mb-2.5">
        <p className="eyebrow">Account type</p>
        {error && <p className="text-[11px] text-[var(--color-critical)]">{error}</p>}
      </div>
      <div
        className="grid grid-cols-3 rounded-lg p-1 gap-1"
        style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-line)',
        }}
      >
        {OPTIONS.map((opt) => {
          const active = profile.role === opt.value;
          const eligibility = eligibilityFor(opt.value);
          const busy = submitting === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => switchTo(opt.value)}
              disabled={busy || active}
              title={!eligibility.ok ? eligibility.reason : undefined}
              className={`relative text-left rounded-md px-3 py-2.5 transition-all overflow-hidden ${
                active
                  ? 'bg-[var(--color-surface)] shadow-[var(--shadow-card)]'
                  : eligibility.ok
                  ? 'hover:bg-[var(--color-surface)]/60'
                  : 'opacity-60 cursor-help'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="relative inline-flex w-3.5 h-3.5 rounded-full items-center justify-center shrink-0"
                  style={{
                    background: active ? 'var(--color-ink)' : 'transparent',
                    border: active ? 'none' : '1.5px solid var(--color-line-strong)',
                  }}
                >
                  {active && (
                    <span
                      className="block w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--color-surface)' }}
                    />
                  )}
                </span>
                <span className="text-[13px] font-semibold tracking-tight">{opt.label}</span>
              </div>
              <p className="text-[10px] mono text-[var(--color-ink-faint)] mt-1 leading-tight">
                {busy ? 'Saving…' : !eligibility.ok ? eligibility.reason : opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
