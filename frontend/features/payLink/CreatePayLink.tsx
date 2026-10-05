'use client';
import { useState, type FormEvent } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { ShareLink } from './ShareLink';
import { PayLinkHistory } from './PayLinkHistory';

const WEEK_MINUTES = 7 * 24 * 60;
const PRIMARY =
  'flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--lp-accent)] px-5 text-[16px] font-bold text-[#10170b] transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]';
const FIELD = 'block rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3';

/// Ask anyone for USDC with a link. Any account, email or wallet; the money
/// lands in the account that made the link.
export function CreatePayLink() {
  const copy = useTranslations().payLink.create;
  const { address } = useAuth();
  const { profile } = useUserProfile();
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const valid = /^\d+(?:\.\d{1,6})?$/.test(amount.trim()) && Number(amount) > 0;
  const me = profile?.handle ? `@${profile.handle}` : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(false);
    try {
      const { request } = await api.createDepositRequest({ amountUsdc: amount.trim(), purpose: purpose.trim() || undefined, ttlMinutes: WEEK_MINUTES });
      setUrl(`${window.location.origin}/deposit/request/${request.requestId}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProfileFrame title={url ? copy.ready : copy.title}>
      {url ? (
        <div className="space-y-6">
          <p className="text-[34px] font-semibold tabular-nums text-[var(--lp-dark)]">
            {amount} <span className="text-[16px] font-medium text-[var(--lp-text-sub)]">USDC</span>
          </p>
          <ShareLink url={url} />
          <button
            type="button"
            onClick={() => {
              setUrl(null);
              setAmount('');
              setPurpose('');
            }}
            className="min-h-11 text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4"
          >
            {copy.another}
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void create(event)} className="space-y-3" aria-busy={busy}>
          <label className={FIELD}>
            <span className="text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.amount}</span>
            <span className="mt-1 flex items-baseline gap-2">
              <input
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0"
                className="w-full bg-transparent text-[34px] font-semibold tabular-nums text-[var(--lp-dark)] outline-none"
              />
              <span className="text-[16px] font-medium text-[var(--lp-text-sub)]">USDC</span>
            </span>
          </label>
          <label className={FIELD}>
            <span className="text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.forLabel}</span>
            <input
              value={purpose}
              maxLength={120}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={copy.forPlaceholder}
              className="mt-1 block w-full bg-transparent text-[17px] text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
            />
          </label>
          <div className={FIELD}>
            <span className="text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.paidTo}</span>
            <p className="mt-1 text-[17px] text-[var(--lp-dark)]">{me ? `${copy.yourAccount} · ${me}` : copy.yourAccount}</p>
          </div>
          <p className="px-1 pt-1 text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.lasts}</p>
          {error ? <p role="alert" className="px-1 text-[14px] text-[var(--color-critical)]">{copy.error}</p> : null}
          <div className="pt-3">
            <button type="submit" disabled={!valid || busy} className={PRIMARY}>
              {busy ? copy.creating : copy.create}
            </button>
          </div>
        </form>
      )}
      <PayLinkHistory refreshKey={url} />
    </ProfileFrame>
  );
}
