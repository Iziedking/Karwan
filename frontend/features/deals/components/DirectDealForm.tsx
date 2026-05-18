'use client';
import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { feeBreakdown } from '../config';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function DirectDealForm() {
  const router = useRouter();
  // Source of truth covers both wagmi web3 users and Circle passkey/email
  // users. Direct-deal create is backend-signed (the buyer agent DCW opens
  // escrow), so no actual wallet signature is needed here either way. The
  // form just needs the user's identity address.
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  // "Make offer" links from a listing detail land here with seller/amount/terms
  // pre-filled. Read once on mount; further changes come from user input.
  const search = useSearchParams();
  const initialSeller = search.get('seller') ?? '';
  const initialAmountRaw = search.get('amount');
  const initialAmount =
    initialAmountRaw != null && Number.isFinite(Number(initialAmountRaw))
      ? Number(initialAmountRaw)
      : undefined;
  const initialTerms = search.get('terms') ?? '';

  const [seller, setSeller] = useState(initialSeller);
  // Numeric fields always start empty; the placeholder "0" renders instead
  // of any autofilled number. The only exception is when the user arrives
  // from a listing's "Make offer" deep link with ?amount= in the URL, which
  // pre-fills from the listing's asking price; otherwise it stays blank.
  const [amount, setAmount] = useState<number | ''>(initialAmount ?? '');
  const [deadlineValue, setDeadlineValue] = useState<number | ''>('');
  const [deadlineUnit, setDeadlineUnit] = useState<'min' | 'hr' | 'd'>('d');
  const [firstPct, setFirstPct] = useState<number | ''>('');
  const [terms, setTerms] = useState(initialTerms);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellerValid = ADDR_RE.test(seller.trim());
  const sameWallet =
    sellerValid && address && seller.trim().toLowerCase() === address.toLowerCase();
  const amountValid = typeof amount === 'number' && amount > 0;
  // Single-input deadline with a min/hr/day unit toggle. Bounds per unit
  // mirror the buyer brief form so behaviour is identical across surfaces.
  const deadlineMax =
    deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : 180;
  const deadlineValid =
    typeof deadlineValue === 'number' &&
    deadlineValue >= 1 &&
    deadlineValue <= deadlineMax;
  const pctValid = typeof firstPct === 'number' && firstPct >= 1 && firstPct <= 99;
  const termsValid = terms.trim().length > 0;

  const canSubmit =
    isConnected &&
    sellerValid &&
    !sameWallet &&
    amountValid &&
    deadlineValid &&
    pctValid &&
    termsValid &&
    !submitting;

  const fee = amountValid ? feeBreakdown(amount as number) : null;
  const previewAmount = typeof amount === 'number' ? amount : 0;
  const previewPct = typeof firstPct === 'number' ? firstPct : 0;
  const previewDeadlineValue = typeof deadlineValue === 'number' ? deadlineValue : 0;
  const previewUnitLabel =
    deadlineUnit === 'min' ? 'min' : deadlineUnit === 'hr' ? 'hr' : 'days';
  // Convert the (value, unit) pair into the days+hours pair the API accepts.
  // Minutes round up to the next hour so the on-chain deadlineUnix is never
  // shorter than what the user picked.
  const totalSeconds =
    typeof deadlineValue === 'number'
      ? deadlineUnit === 'min'
        ? deadlineValue * 60
        : deadlineUnit === 'hr'
          ? deadlineValue * 3600
          : deadlineValue * 86400
      : 0;
  const submitDays = Math.floor(totalSeconds / 86400);
  const submitHours = Math.ceil((totalSeconds % 86400) / 3600);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.createDirectDeal({
        buyerAddress: address!,
        sellerAddress: seller.trim(),
        dealAmountUsdc: amount as number,
        deadlineDays: submitDays,
        deadlineHours: submitHours,
        terms: terms.trim(),
        firstReleasePct: firstPct as number,
      });
      sfx.send();
      router.push(`/deals/${r.deal.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.detail) setError(String(err.detail));
      else setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <p className="text-[13px] text-[var(--lp-text-sub)]">
        Sign in to open a direct deal. Use the Log in pill in the nav.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      {/* DEAL PREVIEW */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--lp-band-dark)',
          color: 'white',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-40 grid-drift"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 100% 0%, black, transparent 70%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 80% at 100% 0%, black, transparent 70%)',
          }}
        />
        <div className="relative px-6 py-6">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            DEAL PREVIEW
          </p>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="font-sans text-[clamp(2.5rem,6vw,3.75rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-none">
              {previewAmount}
            </span>
            <span className="mono text-[12px] uppercase tracking-[0.12em] text-white/55">
              USDC
            </span>
            <span aria-hidden className="ml-2 mb-1 w-px h-7 bg-white/20" />
            <span className="font-sans text-[clamp(1.5rem,3.4vw,2rem)] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
              {previewDeadlineValue}
            </span>
            <span className="mono text-[12px] uppercase tracking-[0.12em] text-white/55">
              {previewUnitLabel}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] mono text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                data-instrument-blink
                className="w-[6px] h-[6px]"
                style={{
                  background: 'var(--lp-accent)',
                  animation: 'instrumentBlink 1.6s ease-in-out infinite',
                }}
              />
              {previewPct}% on delivery
            </span>
            <span aria-hidden className="w-px h-3 bg-white/20" />
            <span>{100 - previewPct}% on verification</span>
            <span aria-hidden className="w-px h-3 bg-white/20" />
            <span>direct escrow</span>
          </div>
        </div>
      </div>

      {/* COUNTERPARTY */}
      <FieldSection eyebrow="COUNTERPARTY" title="Name the seller wallet.">
        <FormLabel
          label="Seller address"
          hint="Their wallet. They sign in with the same address to accept and deliver."
        >
          <input
            type="text"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            placeholder="0x..."
            disabled={submitting}
            className="form-input form-input-mono"
          />
          {seller.length > 0 && !sellerValid && (
            <span className="mono text-[11px] text-[#7a1f1a] mt-1.5 inline-block">
              Not a valid 20-byte address.
            </span>
          )}
          {sameWallet && (
            <span className="mono text-[11px] text-[#7a1f1a] mt-1.5 inline-block">
              Seller must differ from your wallet.
            </span>
          )}
        </FormLabel>
      </FieldSection>

      {/* TERMS */}
      <FieldSection eyebrow="DEAL TERMS" title="Set the amount and release split.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormLabel label="Amount" unit="USDC">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              disabled={submitting}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="form-input form-input-num"
            />
          </FormLabel>
          <FormLabel
            label="Deadline"
            unit={previewUnitLabel}
            hint="When the seller must deliver by. Pick min, hr, or days. Max 180 days."
          >
            <div className="flex items-stretch gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={deadlineMax}
                step={1}
                value={deadlineValue}
                disabled={submitting}
                onChange={(e) =>
                  setDeadlineValue(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="0"
                className="form-input form-input-num flex-1 min-w-0"
              />
              <DeadlineUnitPicker
                value={deadlineUnit}
                disabled={submitting}
                onChange={(next) => {
                  // When switching units, reset to empty so the user picks a
                  // sensible number for the new unit. The buyer form seeds
                  // sample values; the direct-deal form stays empty per the
                  // "no autofills" rule.
                  setDeadlineUnit(next);
                  setDeadlineValue('');
                }}
              />
            </div>
          </FormLabel>
          <FormLabel
            label="On delivery"
            unit="%"
            hint="Slice released when seller marks delivered. Rest on your verification."
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              step={1}
              value={firstPct}
              disabled={submitting}
              onChange={(e) => setFirstPct(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="form-input form-input-num"
            />
          </FormLabel>
        </div>
      </FieldSection>

      {/* DELIVERABLE */}
      <FieldSection eyebrow="DELIVERABLE" title="What's being delivered.">
        <FormLabel label="Terms" hint="Visible to both parties on the deal page.">
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={3}
            disabled={submitting}
            placeholder="e.g. Logo redesign with 2 revision rounds. Final files in SVG + PNG."
            className="form-input form-textarea"
          />
        </FormLabel>
      </FieldSection>

      {/* FUNDING BREAKDOWN */}
      {fee && (
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          <div className="px-5 py-4 border-b border-[var(--lp-border-light)]">
            <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
              FUNDING BREAKDOWN · 1.5% FEE, SPLIT EVENLY
            </p>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            <FeeLine label="You fund" value={fee.fundedAmount} strong />
            <FeeLine label="Seller receives" value={fee.sellerNet} />
            <FeeLine label="Platform fee" value={fee.feeTotal} faint />
          </div>
          <div className="px-5 py-3 border-t border-[var(--lp-border-light)] mono text-[11px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
            ↳ {previewPct}% on delivery · {100 - previewPct}% on verification · funds when seller
            accepts
          </div>
        </div>
      )}

      {/* SUBMIT */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--lp-border-light)]">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em]',
            'transition-[transform,box-shadow] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
            !canSubmit
              ? 'bg-[var(--lp-light)] text-[var(--lp-text-muted)] cursor-not-allowed border border-[var(--lp-border-light)]'
              : 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)]',
          )}
          style={{
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {submitting && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              className="animate-spin"
              aria-hidden
            >
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? 'Opening deal...' : 'Open deal'}
          {!submitting && (
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          )}
        </button>
        {!submitting && (
          <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
            ↳ funds when seller accepts
          </p>
        )}
      </div>

      {error && (
        <p className="mono text-[12px] text-[#7a1f1a]">Couldn&apos;t open deal: {error}</p>
      )}

    </form>
  );
}

function FieldSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
          {eyebrow}
        </p>
        <h3 className="font-sans text-[17px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function FormLabel({
  label,
  unit,
  hint,
  children,
}: {
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 justify-between">
        <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
        {unit && (
          <span className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]/70">
            {unit}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function DeadlineUnitPicker({
  value,
  disabled,
  onChange,
}: {
  value: 'min' | 'hr' | 'd';
  disabled?: boolean;
  onChange: (next: 'min' | 'hr' | 'd') => void;
}) {
  const options: Array<{ key: 'min' | 'hr' | 'd'; label: string }> = [
    { key: 'min', label: 'MIN' },
    { key: 'hr', label: 'HR' },
    { key: 'd', label: 'DAY' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Deadline unit"
      className="inline-flex items-center gap-0.5 p-0.5 shrink-0"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 9,
        borderTopRightRadius: 9,
        borderBottomLeftRadius: 9,
        borderBottomRightRadius: 2,
      }}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className="px-2.5 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: active ? 'var(--lp-dark)' : 'transparent',
              color: active ? 'white' : 'var(--lp-text-sub)',
              borderTopLeftRadius: 7,
              borderTopRightRadius: 7,
              borderBottomLeftRadius: 7,
              borderBottomRightRadius: 2,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FeeLine({
  label,
  value,
  strong,
  faint,
}: {
  label: string;
  value: number;
  strong?: boolean;
  faint?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={cn(
          'mono text-[11px] uppercase tracking-[0.1em]',
          faint ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums tracking-tight',
          strong
            ? 'font-sans font-extrabold text-[20px] text-[var(--lp-dark)]'
            : 'font-mono text-[13px] text-[var(--lp-dark)]',
        )}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}
