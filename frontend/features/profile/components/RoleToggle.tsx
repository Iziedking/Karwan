'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
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
        <div
          className="mb-3 px-3 py-2.5 text-[12.5px]"
          style={{
            background: 'rgba(176,61,58,0.10)',
            color: '#b03d3a',
            border: '1px solid rgba(176,61,58,0.35)',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          {error}
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
                'group relative overflow-hidden text-left p-5 min-h-[112px] transition-all duration-200 text-[var(--lp-dark)]',
                !active && eligibility.ok && 'hover:-translate-y-0.5',
              )}
              style={{
                background: active
                  ? 'rgba(189, 225, 34,0.10)'
                  : eligibility.ok
                    ? 'var(--lp-card)'
                    : 'var(--lp-light)',
                border: active
                  ? '1px solid var(--lp-accent)'
                  : '1px solid var(--lp-border-light)',
                opacity: !active && !eligibility.ok ? 0.55 : 1,
                cursor: !eligibility.ok ? 'help' : undefined,
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
                boxShadow: active ? '0 1px 0 rgba(189, 225, 34,0.18)' : 'none',
              }}
            >
              {active && (
                <>
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: 'var(--lp-accent)' }}
                  />
                  <span
                    aria-hidden
                    data-instrument-blink
                    className="absolute top-3.5 right-3.5 inline-block w-[7px] h-[7px]"
                    style={{
                      background: 'var(--lp-accent)',
                      animation: 'instrumentBlink 1.6s ease-in-out infinite',
                    }}
                  />
                </>
              )}
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:ROLE:]
              </span>
              <p className="mt-2 font-sans text-[18px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
                {opt.label}
              </p>
              <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)]">
                {busy ? 'Saving…' : !eligibility.ok ? eligibility.reason : opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
