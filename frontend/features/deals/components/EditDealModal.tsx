'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type DirectDeal } from '@/core/api';
import { feeBreakdown } from '../config';
import { formatUsdc } from '@/shared/utils/format';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { CTAPill } from '@/shared/components/Bands';

type DeadlineUnit = 'min' | 'hr' | 'd';

const ACCEPTANCE_PRESETS = [
  { label: '1 hr', value: 1 },
  { label: '6 hr', value: 6 },
  { label: '24 hr', value: 24 },
  { label: '3 d', value: 72 },
  { label: '7 d', value: 168 },
] as const;

/// Convert the stored deadlineUnix into a (value, unit) pair that fits the same
/// picker the create form uses. Picks the largest unit that yields a clean
/// integer so the buyer sees "3 d" instead of "72 hr" when they originally set
/// 3 days. Returns blank for open-ended deals.
function decomposeDeadline(deal: DirectDeal): { value: number | ''; unit: DeadlineUnit } {
  if (!deal.deadlineUnix) return { value: '', unit: 'd' };
  const remainingSeconds = Math.max(0, deal.deadlineUnix - Math.floor(Date.now() / 1000));
  if (remainingSeconds <= 0) return { value: '', unit: 'd' };
  if (remainingSeconds % 86400 === 0) return { value: remainingSeconds / 86400, unit: 'd' };
  if (remainingSeconds % 3600 === 0) return { value: remainingSeconds / 3600, unit: 'hr' };
  return { value: Math.max(1, Math.round(remainingSeconds / 60)), unit: 'min' };
}

function pickAcceptancePreset(deal: DirectDeal): number {
  if (!deal.acceptanceDeadlineUnix) return 24;
  const remainingSeconds = Math.max(
    0,
    deal.acceptanceDeadlineUnix - Math.floor(Date.now() / 1000),
  );
  const hours = Math.max(1, Math.round(remainingSeconds / 3600));
  const closest = ACCEPTANCE_PRESETS.reduce((best, opt) =>
    Math.abs(opt.value - hours) < Math.abs(best.value - hours) ? opt : best,
  );
  return closest.value;
}

export function EditDealModal({
  deal,
  caller,
  onClose,
  onSaved,
}: {
  deal: DirectDeal;
  caller: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const initialDeadline = useMemo(() => decomposeDeadline(deal), [deal]);
  const initialAcceptance = useMemo(() => pickAcceptancePreset(deal), [deal]);

  const [amount, setAmount] = useState<number | ''>(Number(deal.dealAmountUsdc) || '');
  const [deadlineValue, setDeadlineValue] = useState<number | ''>(initialDeadline.value);
  const [deadlineUnit, setDeadlineUnit] = useState<DeadlineUnit>(initialDeadline.unit);
  const [acceptanceHours, setAcceptanceHours] = useState<number>(initialAcceptance);
  const [firstPct, setFirstPct] = useState<number | ''>(deal.firstReleasePct);
  const [terms, setTerms] = useState(deal.terms);
  const [requireStake, setRequireStake] = useState(!!deal.requireStake);
  const [requireStakePct, setRequireStakePct] = useState(deal.requireStakePct ?? 50);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValid = typeof amount === 'number' && amount > 0;
  const deadlineMax = deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : 180;
  const deadlineValid =
    deadlineValue === '' ||
    (typeof deadlineValue === 'number' &&
      deadlineValue >= 1 &&
      deadlineValue <= deadlineMax);
  const pctValid = typeof firstPct === 'number' && firstPct >= 1 && firstPct <= 99;
  const termsValid = terms.trim().length > 0 && terms.trim().length <= 600;
  const canSave = amountValid && deadlineValid && pctValid && termsValid && !busy;

  const fee = amountValid ? feeBreakdown(amount as number) : null;

  async function submit() {
    if (!canSave || typeof amount !== 'number' || typeof firstPct !== 'number') return;
    setBusy(true);
    setError(null);
    try {
      const totalSeconds =
        typeof deadlineValue === 'number'
          ? deadlineUnit === 'min'
            ? deadlineValue * 60
            : deadlineUnit === 'hr'
              ? deadlineValue * 3600
              : deadlineValue * 86400
          : 0;
      const deadlineDays = Math.floor(totalSeconds / 86400);
      const deadlineHours = Math.ceil((totalSeconds % 86400) / 3600);

      await api.editDirectDeal(deal.jobId, {
        caller,
        dealAmountUsdc: amount,
        deadlineDays,
        deadlineHours,
        acceptanceWindowHours: acceptanceHours,
        terms: terms.trim(),
        firstReleasePct: firstPct,
        requireStake,
        ...(requireStake ? { requireStakePct } : {}),
      });
      sfx.send();
      await onSaved();
      onClose();
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl my-auto overflow-hidden"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:EDIT DEAL:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            Update terms
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
          <p className="mt-2 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
            Changes save right away. The seller sees the new terms before accepting,
            and the acceptance window restarts so they can review.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Amount" unit="USDC">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                disabled={busy}
                onChange={(e) =>
                  setAmount(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="form-input form-input-num"
              />
            </Field>
            <Field
              label="On delivery"
              unit="%"
              hint="Slice the seller receives when they mark delivered. Rest on your verification."
            >
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                step={1}
                value={firstPct}
                disabled={busy}
                onChange={(e) =>
                  setFirstPct(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="form-input form-input-num"
              />
            </Field>
          </div>

          <Field
            label="Deadline (optional)"
            hint="Leave blank for an open-ended deal. Max 180 days when set."
          >
            <div className="flex items-stretch gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={deadlineMax}
                step={1}
                value={deadlineValue}
                disabled={busy}
                onChange={(e) =>
                  setDeadlineValue(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="0"
                className="form-input form-input-num flex-1 min-w-0"
              />
              <UnitPicker
                value={deadlineUnit}
                disabled={busy}
                onChange={(next) => {
                  setDeadlineUnit(next);
                  setDeadlineValue('');
                }}
              />
            </div>
          </Field>

          <Field
            label="Seller has to accept within"
            hint="The acceptance clock restarts from now after you save."
          >
            <div className="flex flex-wrap gap-1.5">
              {ACCEPTANCE_PRESETS.map((opt) => {
                const active = acceptanceHours === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={busy}
                    onClick={() => setAcceptanceHours(opt.value)}
                    className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: active ? 'var(--lp-dark)' : 'var(--lp-light)',
                      color: active ? 'var(--lp-light)' : 'var(--lp-text-sub)',
                      border: '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 7,
                      borderTopRightRadius: 7,
                      borderBottomLeftRadius: 7,
                      borderBottomRightRadius: 2,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Terms" hint="Visible to both parties on the deal page.">
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              disabled={busy}
              rows={4}
              maxLength={600}
              className="form-input form-textarea"
            />
            <span className="mono text-[10px] text-[var(--lp-text-muted)]">
              {terms.length}/600
            </span>
          </Field>

          <label
            className="flex items-start gap-3 px-4 py-3 cursor-pointer"
            style={{
              background: requireStake
                ? 'color-mix(in oklab, var(--lp-accent) 10%, transparent)'
                : 'var(--lp-light)',
              border: requireStake
                ? '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)'
                : '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <input
              type="checkbox"
              checked={requireStake}
              onChange={(e) => setRequireStake(e.target.checked)}
              disabled={busy}
              className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
            />
            <div className="min-w-0">
              <span
                className="mono text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: requireStake ? 'var(--lp-band-dark)' : 'var(--lp-dark)' }}
              >
                [:TRUSTED MATCH:]
              </span>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
                Seller has to stake USDC to accept. Slashed if they lose a dispute.
                Leave off for casual deals.
              </p>
              {requireStake && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={requireStakePct}
                    onChange={(e) => setRequireStakePct(Number(e.target.value))}
                    disabled={busy}
                    className="flex-1 min-w-[160px] accent-[var(--lp-accent)]"
                    aria-label="Required stake percentage"
                  />
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="font-sans text-[18px] font-extrabold tabular-nums text-[var(--lp-dark)]">
                      {requireStakePct}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      % OF DEAL
                    </span>
                  </div>
                </div>
              )}
            </div>
          </label>

          {fee && (
            <div
              className="px-4 py-3 mono text-[11px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]"
              style={{
                background: 'var(--lp-light)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 2,
              }}
            >
              You fund {formatUsdc(fee.fundedAmount)} USDC · seller receives{' '}
              {formatUsdc(fee.sellerNet)} · platform fee {formatUsdc(fee.feeTotal)}
            </div>
          )}

          {error && <p className="mono text-[11px] text-[#b03d3a]">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <CTAPill onClick={submit} disabled={!canSave}>
              {busy ? 'Saving...' : 'Save changes'}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              Cancel
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}

function Field({
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

function UnitPicker({
  value,
  disabled,
  onChange,
}: {
  value: DeadlineUnit;
  disabled?: boolean;
  onChange: (next: DeadlineUnit) => void;
}) {
  const options: Array<{ key: DeadlineUnit; label: string }> = [
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
              color: active ? 'var(--lp-light)' : 'var(--lp-text-sub)',
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
