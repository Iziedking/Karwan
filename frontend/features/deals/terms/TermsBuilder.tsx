'use client';

import { useState } from 'react';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { MAX_PARTS, cleanLines, composeTerms, evenSplit, termsIssues, type TermsDraft, type TermsPart } from './composeTerms';
import { TERMS_COPY } from './termsCopy';

const REVIEW_CHOICES = [1, 3, 7, 14] as const;
export const MAX_REVIEW_DAYS = 90;

export const DEFAULT_TERMS: TermsDraft = {
  conditions: [''],
  proof: 'link',
  parts: [{ pct: 100, what: '' }],
  reviewWindowDays: 3,
};

const chip =
  'inline-flex min-h-10 items-center rounded-full border px-3.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]';
const chipOn = 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]';
const chipOff = 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]';

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
  const [moreOpen, setMoreOpen] = useState(cleanLines(value.conditions).length > 0);
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

  function editCondition(index: number, text: string) {
    const next = [...value.conditions];
    next[index] = text;
    set({ conditions: next });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <p className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">
        {t.title}
        <Hint side="bottom">{t.lead}</Hint>
      </p>

      <div>
        <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{t.kind}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <span className="rounded-[16px] border border-[var(--lp-accent)] bg-[var(--lp-card)] px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--lp-accent)]">
            <span className="flex items-center justify-between gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
              {t.service}
              <span className="grid size-5 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-band-dark)]">
                <Icon name="check" size={16} />
              </span>
            </span>
            <span className="mt-0.5 block text-[13px] text-[var(--lp-text-sub)]">{t.serviceHint}</span>
          </span>
          {[
            { label: t.goods, hint: t.goodsHint },
            { label: t.both, hint: t.bothHint },
          ].map((option) => (
            <span
              key={option.label}
              role="button"
              aria-disabled="true"
              tabIndex={0}
              aria-label={`${option.label}, ${t.soon}`}
              className="group cursor-not-allowed rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3.5 py-3 opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
            >
              <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{option.label}</span>
              <span aria-hidden className="mt-0.5 block text-[13px] text-[var(--lp-text-sub)] group-hover:hidden group-focus-visible:hidden">
                {option.hint}
              </span>
              <span aria-hidden className="mt-0.5 hidden text-[13px] font-semibold text-[var(--lp-dark)] group-hover:block group-focus-visible:block">
                {t.soon}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.parts}</p>
          {value.parts.length > 2 ? (
            <button type="button" onClick={() => set({ parts: value.parts.map((part, i) => ({ ...part, pct: evenSplit(value.parts.length)[i]! })) })} className="min-h-11 text-[13px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
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
                    <span className="whitespace-nowrap text-[13px] tabular-nums text-[var(--lp-text-sub)]">{((priceUsdc * part.pct) / 100).toFixed(2)} USDC</span>
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
                  <span aria-hidden className="text-[14px] text-[var(--lp-text-sub)]">%</span>
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
          {value.parts.length === 1 ? null : <p className={cn('text-[13px] font-semibold tabular-nums', total === 100 ? 'text-[var(--lp-accent-on-light)]' : 'text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]')}>
            {(total === 100 ? t.total : t.needs100).replace('{sum}', String(total))}
          </p>}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
          {t.review}
          <Hint>{t.reviewHint}</Hint>
        </p>
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
            <label className="inline-flex items-center gap-2 text-[14px] text-[var(--lp-text-sub)]">
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
      </div>

      <details open={moreOpen} onToggle={(event) => setMoreOpen(event.currentTarget.open)} className="border-y border-[var(--lp-border-light)]">
        <summary className="flex min-h-11 cursor-pointer items-center gap-3 py-3 text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {t.moreTerms}<span aria-hidden className="ms-auto">{moreOpen ? '−' : '+'}</span>
        </summary>
        <div className="pb-5">
          <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
            {t.conditions}
            <Hint>{t.conditionsHint}</Hint>
          </p>
          <ol className="space-y-2">
            {value.conditions.map((line, index) => (
              <li key={index} className="flex items-center gap-2 rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] py-1 ps-3.5 pe-1">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--lp-accent)]" />
                <input
                  value={line}
                  onChange={(e) => editCondition(index, e.target.value)}
                  placeholder={t.conditionPlaceholder}
                  aria-label={`${t.conditions} ${index + 1}`}
                  maxLength={160}
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = value.conditions.filter((_, i) => i !== index);
                    set({ conditions: next.length ? next : [''] });
                  }}
                  aria-label={`${t.removeLine} ${index + 1}`}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => set({ conditions: [...value.conditions, ''] })}
            disabled={value.conditions.length >= 12}
            className="mt-2 inline-flex min-h-11 items-center rounded-[14px] border border-dashed border-[var(--lp-outline-strong)] px-3.5 text-[14px] font-medium text-[var(--lp-dark)] disabled:opacity-40"
          >
            {t.addCondition}
          </button>
        </div>
      </details>

      <section aria-live="polite" className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-4">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--lp-dark)]">
          {t.agreement}
          <Hint>{t.agreementNote}</Hint>
        </p>
        <p dir="auto" className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-[var(--lp-text-sub)]">{agreement}</p>
        <ul className="mt-3 space-y-1.5">
          {issues.length === 0 ? (
            <li className="flex items-start gap-2 text-[13px] text-[var(--lp-dark)]">
              <span aria-hidden className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--lp-accent)_35%,transparent)] text-[var(--lp-accent-on-light)]">
                <Icon name="check" size={16} />
              </span>
              {t.ready}
            </li>
          ) : (
            issues.map((issue) => (
              <li key={issue.code === 'no-what' ? `no-what-${issue.part}` : issue.code} className="flex items-start gap-2 text-[13px] text-[var(--lp-dark)]">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--status-warning,#C98A1B)]" />
                {issue.code === 'no-what'
                  ? t.noWhat.replace('{n}', String(issue.part))
                  : issue.code === 'split'
                    ? t.split.replace('{sum}', String(issue.total))
                    : t.vague.replace('{item}', issue.item)}
              </li>
            ))
          )}
        </ul>
      </section>
    </fieldset>
  );
}
