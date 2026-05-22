'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type UserProfile } from '@/core/api';
import { useClipboard } from '@/shared/hooks/useClipboard';
import { shortAddress } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useReputation } from '@/features/reputation/hooks/useReputation';

// Per-tier hue, mirroring ProfileTierCard so the tier reads the same colour
// everywhere. Shown as a rail down the profile box.
const TIER_HUE: Record<string, string> = {
  NEW: '#9a9a9a',
  COLD: '#e0a23c',
  ESTABLISHED: 'var(--lp-accent)',
  STRONG: '#5fd08a',
  ELITE: '#39e08a',
};

interface Props {
  open: boolean;
  onClose: () => void;
  address: string;
  role: 'buyer' | 'seller';
}

export function ProfilePeekModal({ open, onClose, address, role }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { copied, copy } = useClipboard();
  const { data: rep } = useReputation(open ? address : undefined);
  const tierHue = TIER_HUE[(rep?.tier ?? 'NEW') as string] ?? TIER_HUE.NEW;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    api
      .getProfile(address)
      .then((r) => {
        if (!cancelled) {
          setProfile(r.profile);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, address]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const displayName = profile?.displayName?.trim();
  const xHandle = profile?.xHandle?.replace(/^@/, '');
  const xHref = xHandle ? `https://x.com/${xHandle}` : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${role} profile`}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden fade-up"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        {/* Tier-coloured rail down the box: reflects the account's reputation
            tier (grey NEW, amber COLD, lime ESTABLISHED, green STRONG/ELITE). */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[4px]"
          style={{ background: tierHue }}
        />
        <div className="relative px-6 pt-7 pb-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{role.toUpperCase()} PROFILE:]
          </span>
          <h2 className="mt-2 font-sans text-[20px] font-extrabold tracking-[-0.02em] text-[var(--lp-dark)]">
            {displayName || shortAddress(address)}
          </h2>
          <p className="mt-1 mono text-[11px] tabular-nums text-[var(--lp-text-sub)] break-all">
            {address}
          </p>

          <div className="mt-4 flex items-center gap-2">
            <ReputationBadge address={address} size="md" withDetail />
          </div>
        </div>

        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => copy(address)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              color: 'var(--lp-dark)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
          {xHref ? (
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
              style={{
                background: 'var(--lp-dark)',
                border: '1px solid var(--lp-dark)',
                color: 'var(--lp-card)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M12.5 1.5h2L9.8 6.9 15 14.5h-4.3l-3.4-4.9-3.8 4.9H1.4l5-6.4L1.5 1.5h4.4l3.1 4.5 3.5-4.5zm-.7 11.7h1.1L4.3 2.7H3.1l8.7 10.5z" />
              </svg>
              {`@${xHandle}`}
            </a>
          ) : (
            <span
              className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[11px] uppercase tracking-[0.08em]"
              style={{
                background: 'var(--lp-light)',
                border: '1px dashed rgba(0,0,0,0.18)',
                color: 'var(--lp-text-muted)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              {loaded ? 'X not connected' : 'Loading'}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
