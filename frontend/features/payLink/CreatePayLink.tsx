'use client';
import { useId, useState, type FormEvent } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { AmountHero } from '@/features/money/components/AmountHero';
import { useAmountInput } from '@/features/money/hooks/useAmountInput';
import { Keypad } from '@/features/money/components/Keypad';
import { pressKey } from '@/features/money/amountEntry';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { Button } from '@/shared/components/Button';
import { ShareLink } from './ShareLink';
import { PaymentCard } from './PaymentCard';
import { PayLinkHistory } from './PayLinkHistory';
import { LinkExpiryChips } from './LinkExpiryChips';
import { DEFAULT_EXPIRY, expiryAt, expiryMinutes, type LinkExpiry } from './linkExpiry';

const LABEL = 'block text-[14px] font-medium text-[var(--ink-secondary)]';
const FIELD = 'mt-2 block w-full rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--ink)]';

/// Ask anyone for USDC with a link. Any account, email or wallet; the money
/// lands in the account that made the link. On a phone the amount and its
/// keypad come first on their own, then the details (owner, 9 Nov 2026: "Typing
/// pad under all these info is bad user experience", Figma 224:570).
export function CreatePayLink() {
  const messages = useTranslations();
  const { create: copy } = messages.payLink;
  const entry = messages.money.entry;
  const steps = messages.money.sendFlow;
  const mt = useMoneyText();
  const keypad = useMediaQuery('(pointer: coarse)');
  const amountId = useId();
  const { address } = useAuth();
  const { profile } = useUserProfile();
  const amt = useAmountInput();
  const { typed: amount, setTyped: setAmount } = amt;
  const amountUsdc = amt.usdc === null ? '' : String(amt.usdc);
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expiry, setExpiry] = useState<LinkExpiry>(DEFAULT_EXPIRY);
  const [step, setStep] = useState<'amount' | 'details'>('amount');

  const valid = amt.usdc !== null;
  const me = profile?.handle ? `@${profile.handle}` : address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(false);
    try {
      const { request } = await api.createDepositRequest({ amountUsdc: amountUsdc, purpose: purpose.trim() || undefined, ttlMinutes: expiryMinutes(expiry) });
      setUrl(`${window.location.origin}/deposit/request/${request.requestId}`);
      setExpiresAt(request.expiresAt ?? expiryAt(expiry));
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
          <p className="-mt-3 text-[15px] text-[var(--ink-secondary)]">{copy.directNote}</p>
          {address ? <PaymentCard recipient={address} amount={amountUsdc} purpose={purpose.trim() || null} state="open" expiresAt={expiresAt} url={url} /> : null}
          <ShareLink url={url} compact />
          <button
            type="button"
            onClick={() => {
              setUrl(null);
              setAmount('');
              setPurpose('');
              setExpiry(DEFAULT_EXPIRY);
              setStep('amount');
            }}
            className="min-h-11 text-[14px] font-semibold text-[var(--ink-secondary)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
          >
            {copy.another}
          </button>
        </div>
      ) : (
        keypad && step === 'amount' ? (
          <form
            data-request-step="amount"
            onSubmit={(event) => { event.preventDefault(); if (valid) setStep('details'); }}
            className="space-y-6"
          >
            <p className="-mt-3 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{copy.howMuch}</p>
            <div className="py-6">
              <AmountHero id={amountId} label={copy.amount} value={amount} onChange={setAmount} keypad={keypad} sign={amt.sign} />
            </div>
            <Keypad onKey={(key) => setAmount((typed) => pressKey(typed, key))} label={entry.keypad} backLabel={entry.back} />
            <Button type="submit" size="lg" className="w-full" disabled={!valid}>
              {steps.next}
            </Button>
          </form>
        ) : (
        <form onSubmit={(event) => void create(event)} data-request-step="details" className="space-y-6" aria-busy={busy}>
          <p className="-mt-3 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{copy.directNote}</p>
          {keypad ? (
            <div data-request-amount className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--ink-secondary)]">{copy.askingFor}</p>
                <p className="text-[20px] font-semibold tabular-nums text-[var(--ink)]">{amt.usdc === null ? '' : mt.text(amt.usdc)}</p>
              </div>
              <button
                type="button"
                onClick={() => setStep('amount')}
                disabled={busy}
                className="min-h-11 shrink-0 px-1 text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
              >
                {steps.change}
              </button>
            </div>
          ) : (
            <div className="py-4">
              <AmountHero id={amountId} label={copy.amount} value={amount} onChange={setAmount} keypad={keypad} sign={amt.sign} />
            </div>
          )}
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
          <LinkExpiryChips value={expiry} onChange={setExpiry} disabled={busy} />
          {error ? <p role="alert" className="text-[14px] text-[var(--color-critical)]">{copy.error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={!valid} loading={busy} loadingLabel={copy.creating}>
            {copy.create}
          </Button>
        </form>
        )
      )}
      <PayLinkHistory refreshKey={url} />
    </ProfileFrame>
  );
}
