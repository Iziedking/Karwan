'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, ApiError } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { cn } from '@/shared/utils/cn';
import { looksLikeWrongSide } from '@/shared/utils/intentDetect';

export function PostJobForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { profile, loading: profileLoading } = useUserProfile();
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState<number | ''>(10);
  // Deadline split: a raw `value` and a `unit`. Submit converts to seconds.
  // Defaults adapt per unit so switching feels natural (5d → 2h → 15m).
  const [deadlineUnit, setDeadlineUnit] = useState<'min' | 'hr' | 'd'>('d');
  const [deadlineValue, setDeadlineValue] = useState<number | ''>(5);
  const [tolerance, setTolerance] = useState<number | ''>(15);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!submitting) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startedAt.current == null) return;
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [submitting]);

  const [insufficientBalance, setInsufficientBalance] = useState(false);
  // Symmetric check to the seller form. If a buyer brief reads as an offer
  // ("I sell..."), warn before posting so it doesn't end up on the wrong
  // surface. Brief has no title field, so we pass the brief itself as both
  // title + body. the regex set handles either case.
  const [intentWarned, setIntentWarned] = useState(false);
  const intentCheck = looksLikeWrongSide(brief, '', 'request');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !address ||
      !brief ||
      typeof budget !== 'number' ||
      typeof deadlineValue !== 'number'
    )
      return;
    if (intentCheck.wrong && !intentWarned) {
      setIntentWarned(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    setInsufficientBalance(false);
    try {
      const r = await api.postJob({
        posterAddress: address,
        brief,
        budgetUsdc: budget,
        deadlineSeconds: deadlineToSeconds(deadlineValue, deadlineUnit),
        negotiationMaxIncreasePct: typeof tolerance === 'number' ? tolerance : undefined,
      });
      sfx.send();
      router.push(`/jobs/${r.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'insufficient buyer balance') {
        setInsufficientBalance(true);
        setError(err.detail ? String(err.detail) : 'Buyer agent is short on USDC.');
      } else if (err instanceof ApiError && err.detail) {
        setError(String(err.detail));
      } else {
        setError((err as Error).message);
      }
      setSubmitting(false);
    }
  }

  const disabled = submitting || !brief.trim() || !budget || !deadlineValue;
  const buttonLabel = submitting
    ? elapsed < 8
      ? 'Submitting tx…'
      : elapsed < 30
        ? `Waiting for Arc to confirm… ${elapsed}s`
        : `Still waiting on Circle… ${elapsed}s`
    : 'Post on chain';

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--lp-text-sub)]">
          Connect your wallet to post a managed job.
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (!profileLoading && !profile?.buyer) {
    return (
      <div
        className="p-6 space-y-3"
        style={{
          background: 'var(--lp-light)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          BUYER PROFILE
        </p>
        <h3 className="font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em]">
          Set up a buyer profile.
        </h3>
        <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed">
          Managed jobs run on your own buyer agent, using your budget, deadline range, and
          milestone split.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 mt-2 px-[18px] py-[10px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.22)] hover:shadow-[0_4px_0_rgba(0,0,0,0.22)]"
          style={{
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          Set up profile →
        </Link>
      </div>
    );
  }

  const previewAmount = typeof budget === 'number' ? budget : 0;
  const previewDeadline = typeof deadlineValue === 'number' ? deadlineValue : 0;
  const previewUnitLabel =
    deadlineUnit === 'min' ? 'MIN' : deadlineUnit === 'hr' ? 'HR' : 'DAYS';
  const previewTol = typeof tolerance === 'number' ? tolerance : 0;
  const ceiling =
    typeof budget === 'number' && typeof tolerance === 'number'
      ? (budget * (1 + tolerance / 100)).toFixed(2)
      : null;

  return (
    <form onSubmit={submit} className="space-y-7">
      {/* DEAL PREVIEW. big editorial display */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--lp-dark)',
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
              {previewDeadline}
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
              tolerance {previewTol}%
            </span>
            {ceiling && (
              <>
                <span aria-hidden className="w-px h-3 bg-white/20" />
                <span>ceiling {ceiling} USDC</span>
              </>
            )}
            <span aria-hidden className="w-px h-3 bg-white/20" />
            <span>milestone escrow on Arc</span>
          </div>
        </div>
      </div>

      {/* THE WORK */}
      <FieldSection eyebrow="THE WORK" title="Describe what you need built.">
        <FormLabel
          label="Brief"
          hint="Outline scope, deliverables, must-haves. The seller agent reads this to decide whether to bid."
        >
          <textarea
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              setIntentWarned(false);
            }}
            rows={4}
            disabled={submitting}
            placeholder="e.g. Spanish → Arabic legal translation. 14 pages. Sworn translator preferred."
            className="form-input form-textarea"
          />
        </FormLabel>
      </FieldSection>

      {/* TERMS */}
      <FieldSection eyebrow="TERMS" title="Set the auction guardrails.">
        <div className="grid grid-cols-3 gap-3">
          <FormLabel
            label="Budget"
            unit="USDC"
            hint="Target price. The agent negotiates from here within the tolerance."
          >
            <input
              type="number"
              min={1}
              step={1}
              value={budget}
              disabled={submitting}
              onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
              className="form-input form-input-num"
            />
          </FormLabel>
          <FormLabel
            label="Deadline"
            unit={previewUnitLabel.toLowerCase()}
            hint="Sellers won't bid if it falls outside their delivery window. Choose min, hr, or days."
          >
            <div className="flex items-stretch gap-2">
              <input
                type="number"
                min={1}
                max={deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : 90}
                step={1}
                value={deadlineValue}
                disabled={submitting}
                onChange={(e) =>
                  setDeadlineValue(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="form-input form-input-num flex-1 min-w-0"
              />
              <DeadlineUnitPicker
                value={deadlineUnit}
                disabled={submitting}
                onChange={(next) => {
                  // Pick a sensible default when the unit changes so the field
                  // never lands on something nonsensical (90 minutes vs 90 days).
                  const defaults = { min: 15, hr: 2, d: 5 } as const;
                  setDeadlineUnit(next);
                  setDeadlineValue(defaults[next]);
                }}
              />
            </div>
          </FormLabel>
          <FormLabel
            label="Tolerance"
            unit="%"
            hint="How much above budget the agent may accept on a counter. 0 = strict."
          >
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={tolerance}
              disabled={submitting}
              onChange={(e) => setTolerance(e.target.value === '' ? '' : Number(e.target.value))}
              className="form-input form-input-num"
            />
          </FormLabel>
        </div>
      </FieldSection>

      {/* INTENT WARNING. surfaces if the brief reads as a seller offer
          ("I sell..."). User can click submit again to post anyway. */}
      {intentCheck.wrong && intentWarned && (
        <div
          className="px-4 py-3"
          style={{
            background: 'rgba(178, 84, 37, 0.10)',
            border: '1px solid rgba(178, 84, 37, 0.35)',
            color: '#b25425',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5">
            [:WAIT. IS THIS A BRIEF OR A LISTING?:]
          </p>
          <p className="text-[12.5px] leading-snug text-[var(--lp-dark)]">
            This reads like something you <span className="font-bold">offer</span>, not something
            you <span className="font-bold">need</span>. Briefs are for buyers; listings (posted
            from the seller desk) are for sellers. If you meant to sell a service,{' '}
            <Link
              href="/seller"
              className="underline underline-offset-2 hover:opacity-80"
            >
              post a listing instead
            </Link>
            . Click <span className="font-bold">Post on chain</span> again to post the brief
            as-is.
          </p>
        </div>
      )}

      {/* SUBMIT */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--lp-border-light)]">
        <button
          type="submit"
          disabled={disabled}
          className={cn(
            'group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em]',
            'transition-[transform,box-shadow] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
            disabled
              ? 'bg-[var(--lp-light)] text-[var(--lp-text-muted)] cursor-not-allowed border border-[var(--lp-border-light)]'
              : 'bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)]',
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
          {buttonLabel}
          {!submitting && (
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          )}
        </button>
        {submitting && (
          <p className="text-[12px] text-[var(--lp-text-muted)] leading-snug max-w-[36ch]">
            Circle is broadcasting and confirming on Arc. Live job page opens when it lands.
          </p>
        )}
        {!submitting && (
          <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
            ↳ tx fee paid in USDC
          </p>
        )}
      </div>

      {insufficientBalance ? (
        <div
          className="p-4 space-y-2"
          style={{
            background: 'rgba(133,83,0,0.06)',
            border: '1px solid rgba(133,83,0,0.25)',
            borderRadius: 12,
          }}
        >
          <p className="font-sans text-[14px] font-extrabold uppercase tracking-[-0.01em] text-[var(--lp-dark)]">
            Buyer agent short on USDC.
          </p>
          <p className="text-[12px] text-[var(--lp-text-sub)] leading-snug">{error}</p>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('bridge-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="mono text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--lp-dark)] underline-offset-2 hover:underline"
          >
            Top up via CCTP →
          </button>
        </div>
      ) : (
        error && (
          <p className="mono text-[12px] text-[#7a1f1a]">Couldn&apos;t post: {error}</p>
        )
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

const UNIT_SECONDS = { min: 60, hr: 3600, d: 86_400 } as const;

function deadlineToSeconds(value: number, unit: 'min' | 'hr' | 'd'): number {
  return Math.max(60, Math.round(value * UNIT_SECONDS[unit]));
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
