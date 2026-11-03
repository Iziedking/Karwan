'use client';
import { useState, type FormEvent } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { Button } from '@/shared/components/Button';
import { fill } from '@/features/deals/workspace/presentation';
import { ShareLink } from './ShareLink';
import { PayLinkHistory } from './PayLinkHistory';

const WEEK_MINUTES = 7 * 24 * 60;
const LABEL = 'block text-[14px] font-medium text-[var(--ink-secondary)]';
const FIELD = 'mt-2 block w-full rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--ink)]';

/// Ask anyone for USDC with a link. Any account, email or wallet; the money
/// lands in the account that made the link.
export function CreatePayLink() {
  const { create: copy, pay } = useTranslations().payLink;
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
          <p className="-mt-3 text-[15px] text-[var(--ink-secondary)]">
            {[`${amount} USDC`, purpose.trim() ? fill(pay.forTemplate, { purpose: purpose.trim() }) : null].filter(Boolean).join(' · ')}
          </p>
          <ShareLink url={url} />
          <button
            type="button"
            onClick={() => {
              setUrl(null);
              setAmount('');
              setPurpose('');
            }}
            className="min-h-11 text-[14px] font-semibold text-[var(--ink-secondary)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
          >
            {copy.another}
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void create(event)} className="space-y-6" aria-busy={busy}>
          <p className="-mt-3 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{copy.directNote}</p>
          <label className="block">
            <span className={LABEL}>{copy.amount}</span>
            <span className="mt-1 flex items-baseline gap-2">
              <input
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0"
                className="w-full bg-transparent text-[34px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
              />
              <span className="text-[17px] font-semibold text-[var(--ink-secondary)]">USDC</span>
            </span>
          </label>
          <label className="block">
            <span className={LABEL}>{copy.forLabel}</span>
            <input
              value={purpose}
              maxLength={120}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={copy.forPlaceholder}
              className={`${FIELD} outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--ink)]`}
            />
          </label>
          <div>
            <span className={LABEL}>{copy.paidTo}</span>
            <p className={FIELD}>{me ? `${copy.yourAccount} · ${me}` : copy.yourAccount}</p>
          </div>
          <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{copy.lasts}</p>
          {error ? <p role="alert" className="text-[14px] text-[var(--color-critical)]">{copy.error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={!valid} loading={busy} loadingLabel={copy.creating}>
            {copy.create}
          </Button>
        </form>
      )}
      <PayLinkHistory refreshKey={url} />
    </ProfileFrame>
  );
}
