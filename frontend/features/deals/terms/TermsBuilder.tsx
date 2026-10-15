'use client';

import { useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { MAX_PARTS, composeTerms, evenSplit, termsIssues, type TermsDraft, type TermsPart } from './composeTerms';
import { TERMS_COPY } from './termsCopy';
import { termsBlocker, termsIssueText } from './termsBlocker';

const REVIEW_CHOICES = [1, 3, 7, 14] as const;
export const MAX_REVIEW_DAYS = 90;

export const DEFAULT_TERMS: TermsDraft = {
  conditions: [''],
  proof: 'link',
  parts: [{ pct: 100, what: '' }],
  reviewWindowDays: 3,
};

export const chip =
  'inline-flex min-h-11 items-center rounded-full border px-3.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]';
export const chipOn = 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]';
export const chipOff = 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]';

/// Terms both sides sign, written as milestones: each says in plain words what
/// it delivers and what share of the price it releases. The delivery check
/// reads each milestone against what is submitted. Parent forms own the value
/// and send `composeTerms(...)` as the agreement.
export function TermsBuilder({
  value,
  onChange,
  priceUsdc,
  dueLabel,
  minParts = 1,
  maxParts = MAX_PARTS,
  disabled = false,
}: {
  value: TermsDraft;
  onChange: (next: TermsDraft) => void;
  priceUsdc: number | null;
  dueLabel: string | null;
  minParts?: number;
  maxParts?: number;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const t = TERMS_COPY[locale];
  const [customReview, setCustomReview] = useState(!REVIEW_CHOICES.includes(value.reviewWindowDays as (typeof REVIEW_CHOICES)[number]));
  const [reviewText, setReviewText] = useState(String(value.reviewWindowDays));
  const set = (patch: Partial<TermsDraft>) => onChange({ ...value, ...patch });
  const total = value.parts.reduce((sum, part) => sum + (Number.isFinite(part.pct) ? part.pct : 0), 0);
  const issues = termsIssues(value);
  const agreement = composeTerms(value, { priceUsdc, dueLabel }, t.text);
  const partName = (index: number) => t.part.replace('{n}', String(index + 1));

  function setPart(index: number, patch: Partial<TermsPart>) {
    const parts = value.parts.map((part, i) => (i === index ? { ...part, ...patch } : part));
    // With two milestones, setting one share sets the other.
    if (patch.pct !== undefined && parts.length === 2 && patch.pct >= 1) {
      parts[1 - index] = { ...parts[1 - index]!, pct: 100 - patch.pct };
    }
    set({ parts });
  }

  function addPart() {
    if (value.parts.length >= maxParts) return;
    const shares = evenSplit(value.parts.length + 1);
    set({ parts: [...value.parts, { pct: 0, what: '' }].map((part, i) => ({ ...part, pct: shares[i]! })) });
  }

  function removePart(index: number) {
    if (value.parts.length <= minParts) return;
    const kept = value.parts.filter((_, i) => i !== index);
    const shares = evenSplit(kept.length);
    set({ parts: kept.map((part, i) => ({ ...part, pct: shares[i]! })) });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <div>
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</p>
        <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{t.lead}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.parts}</p>
          {value.parts.length > 2 ? (
            <button type="button" onClick={() => set({ parts: value.parts.map((part, i) => ({ ...part, pct: evenSplit(value.parts.length)[i]! })) })} className="min-h-11 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
              {t.splitEvenly}
            </button>
          ) : null}
        </div>
        <ol className="space-y-2">
          {value.parts.map((part, index) => (
            <li key={index} className="rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-3">
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{partName(index)}</span>
                  {priceUsdc && priceUsdc > 0 ? (
                    <span className="whitespace-nowrap text-[14px] tabular-nums text-[var(--lp-text-sub)] font-medium">{((priceUsdc * part.pct) / 100).toFixed(2)} USDC</span>
                  ) : null}
                </span>
                {value.parts.length === 1 ? null : <span className="flex w-24 shrink-0 items-center gap-1.5">
                  <input
                    inputMode="numeric"
                    value={String(part.pct)}
                    onChange={(e) => setPart(index, { pct: Math.min(99, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                    aria-label={`${partName(index)} %`}
                    className="form-input form-input-num h-10 text-end"
                  />
                  <span aria-hidden className="text-[14px] text-[var(--lp-text-sub)] font-medium">%</span>
                </span>}
                {value.parts.length > minParts ? (
                  <button
                    type="button"
                    onClick={() => removePart(index)}
                    aria-label={`${t.removeLine} ${partName(index)}`}
                    className="grid size-10 place-items-center rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
                  >
                    <Icon name="close" size={16} />
                  </button>
                ) : null}
              </div>
              <label className="mt-2 block">
                <span className="sr-only">{`${partName(index)}: ${t.whatLabel}`}</span>
                <textarea
                  value={part.what}
                  onChange={(e) => setPart(index, { what: e.target.value })}
                  placeholder={index === 0 ? t.whatPlaceholder : t.whatLabel}
                  rows={2}
                  maxLength={200}
                  dir="auto"
                  className="form-input form-textarea min-h-[64px] text-[15px]"
                />
              </label>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          {value.parts.length < maxParts ? (
            <button
              type="button"
              onClick={addPart}
              className="inline-flex min-h-11 items-center rounded-[14px] border border-dashed border-[var(--lp-outline-strong)] px-3.5 text-[14px] font-medium text-[var(--lp-dark)]"
            >
              {t.addPart}
            </button>
          ) : <span />}
          {value.parts.length === 1 ? null : <p className={cn('text-[14px] font-semibold tabular-nums', total === 100 ? 'text-[var(--lp-accent-on-light)]' : 'text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]')}>
            {(total === 100 ? t.total : t.needs100).replace('{sum}', String(total))}
          </p>}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{t.review}</p>
        <div className="flex flex-wrap items-center gap-2">
          {REVIEW_CHOICES.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={!customReview && value.reviewWindowDays === days}
              onClick={() => {
                setCustomReview(false);
                setReviewText(String(days));
                set({ reviewWindowDays: days });
              }}
              className={cn(chip, !customReview && value.reviewWindowDays === days ? chipOn : chipOff)}
            >
              {days === 1 ? t.day : t.days.replace('{n}', String(days))}
            </button>
          ))}
          <button type="button" aria-pressed={customReview} onClick={() => setCustomReview(true)} className={cn(chip, customReview ? chipOn : chipOff)}>
            {t.other}
          </button>
          {customReview ? (
            <label className="inline-flex items-center gap-2 text-[14px] text-[var(--lp-text-sub)] font-medium">
              <span className="block w-20 shrink-0">
                <input
                  inputMode="numeric"
                  value={reviewText}
                  onChange={(e) => {
                    const text = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setReviewText(text);
                    if (Number(text) >= 1) set({ reviewWindowDays: Math.min(MAX_REVIEW_DAYS, Number(text)) });
                  }}
                  onBlur={() => setReviewText(String(value.reviewWindowDays))}
                  aria-label={t.otherDays}
                  className="form-input form-input-num h-10 text-end"
                />
              </span>
              {t.otherDays}
            </label>
          ) : null}
        </div>
        <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{t.reviewRule}</p>
      </div>


      <section aria-live="polite" className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-4">
        <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{t.agreement}</p>
        <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">{t.agreementNote}</p>
        <p dir="auto" className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-[var(--lp-text-sub)] font-medium">{agreement}</p>
        <ul className="mt-3 space-y-1.5">
          {issues.length === 0 ? (
            <li className="flex items-start gap-2 text-[14px] text-[var(--lp-dark)]">
              <span aria-hidden className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--lp-accent)_35%,transparent)] text-[var(--lp-accent-on-light)]">
                <Icon name="check" size={16} />
              </span>
              {t.ready}
            </li>
          ) : (
            issues.map((issue) => (
              <li key={issue.code === 'no-what' ? `no-what-${issue.part}` : issue.code} className="flex items-start gap-2 text-[14px] text-[var(--lp-dark)]">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--status-warning,#C98A1B)]" />
                {termsIssueText(issue, t)}
              </li>
            ))
          )}
        </ul>
      </section>
    </fieldset>
  );
}

/// Under a form's disabled button: the first thing the terms still need, so
/// the person knows why they cannot go on.
export function TermsBlockerNote({ terms }: { terms: TermsDraft }) {
  const { locale } = useLocale();
  const reason = termsBlocker(terms, TERMS_COPY[locale]);
  if (!reason) return null;
  return <p role="status" className="w-full text-[14px] font-medium text-[var(--lp-dark)]">{reason}</p>;
}
