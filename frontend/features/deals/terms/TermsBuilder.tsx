'use client';

import { useId, useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { cleanLines, composeTerms, termsIssues, type Covers, type TermsDraft } from './composeTerms';
import { TERMS_COPY } from './termsCopy';

const REVIEW_CHOICES = [1, 3, 7, 14] as const;
export const MAX_REVIEW_DAYS = 90;

const PRESETS = [
  { key: 'half', pcts: [50, 50] },
  { key: 'thirty', pcts: [30, 70] },
] as const;

const presetParts = (pcts: readonly number[]) =>
  pcts.map((pct, i) => ({ pct, covers: i === 0 ? ({ kind: 'start' } as Covers) : ({ kind: 'all' } as Covers) }));

const matchesPreset = (draft: TermsDraft, pcts: readonly number[]) =>
  draft.parts.length === pcts.length &&
  draft.parts.every((part, i) => part.pct === pcts[i] && part.covers.kind === (i === 0 ? 'start' : 'all'));

export const DEFAULT_TERMS: TermsDraft = {
  items: [''],
  conditions: [''],
  proof: 'link',
  parts: [
    { pct: 50, covers: { kind: 'start' } },
    { pct: 50, covers: { kind: 'all' } },
  ],
  reviewWindowDays: 3,
};

const chip =
  'inline-flex min-h-10 items-center rounded-full border px-3.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]';
const chipOn = 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]';
const chipOff = 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]';

/// Terms both sides sign, asked as the parts that make a deal checkable.
/// Parent forms own the value and send `composeTerms(...)` as the agreement.
export function TermsBuilder({
  value,
  onChange,
  priceUsdc,
  dueLabel,
  minParts = 2,
  maxParts = 5,
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
  const id = useId();
  const [customReview, setCustomReview] = useState(!REVIEW_CHOICES.includes(value.reviewWindowDays as (typeof REVIEW_CHOICES)[number]));
  const [reviewText, setReviewText] = useState(String(value.reviewWindowDays));
  const [customSplit, setCustomSplit] = useState(!PRESETS.some((preset) => matchesPreset(value, preset.pcts)));
  const [moreOpen, setMoreOpen] = useState(cleanLines(value.conditions).length > 0);
  const set = (patch: Partial<TermsDraft>) => onChange({ ...value, ...patch });
  const items = cleanLines(value.items);
  const total = value.parts.reduce((sum, part) => sum + (Number.isFinite(part.pct) ? part.pct : 0), 0);
  const issues = termsIssues(value);
  const agreement = composeTerms(value, { priceUsdc, dueLabel }, t.text);

  function editLine(list: 'items' | 'conditions', index: number, text: string) {
    const next = [...value[list]];
    next[index] = text;
    // An item that a part pays for keeps that link when its text is edited.
    if (list === 'items') {
      const before = value.items[index]?.trim();
      set({
        items: next,
        parts: value.parts.map((part) =>
          part.covers.kind === 'item' && part.covers.item === before ? { ...part, covers: { kind: 'item', item: text.trim() } } : part,
        ),
      });
      return;
    }
    set({ [list]: next } as Partial<TermsDraft>);
  }

  function removeLine(list: 'items' | 'conditions', index: number) {
    const removed = value[list][index]?.trim();
    const next = value[list].filter((_, i) => i !== index);
    if (list === 'items') {
      set({
        items: next.length ? next : [''],
        parts: value.parts.map((part) =>
          part.covers.kind === 'item' && part.covers.item === removed ? { ...part, covers: { kind: 'all' } } : part,
        ),
      });
      return;
    }
    set({ conditions: next.length ? next : [''] } as Partial<TermsDraft>);
  }

  function setPart(index: number, patch: { pct?: number; covers?: Covers }) {
    const parts = value.parts.map((part, i) => (i === index ? { ...part, ...patch } : part));
    if (patch.pct !== undefined && parts.length === 2 && patch.pct >= 1) {
      parts[1 - index] = { ...parts[1 - index]!, pct: 100 - patch.pct };
    }
    set({ parts });
  }

  function addPart() {
    if (value.parts.length >= maxParts) return;
    const last = value.parts[value.parts.length - 1]!;
    const give = Math.floor(last.pct / 2);
    const parts = [...value.parts];
    parts[parts.length - 1] = { ...last, pct: last.pct - give };
    parts.splice(parts.length - 1, 0, { pct: give, covers: { kind: 'all' } });
    set({ parts });
  }

  function removePart(index: number) {
    if (value.parts.length <= minParts) return;
    const gone = value.parts[index]!;
    const parts = value.parts.filter((_, i) => i !== index);
    parts[parts.length - 1] = { ...parts[parts.length - 1]!, pct: parts[parts.length - 1]!.pct + gone.pct };
    set({ parts });
  }

  const lineList = (list: 'items' | 'conditions') => (
    <div>
      <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{list === 'items' ? t.items : t.conditions}</p>
      <ol className="space-y-2">
        {value[list].map((line, index) => (
          <li key={index} className="flex items-center gap-2 rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] py-1 ps-3.5 pe-1">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--lp-accent)]" />
            <input
              value={line}
              onChange={(e) => editLine(list, index, e.target.value)}
              placeholder={list === 'items' ? t.itemPlaceholder : t.conditionPlaceholder}
              aria-label={`${list === 'items' ? t.items : t.conditions} ${index + 1}`}
              maxLength={160}
              className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
            />
            <button
              type="button"
              onClick={() => removeLine(list, index)}
              aria-label={`${t.removeLine} ${index + 1}`}
              className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
            >
              <span aria-hidden className="text-[18px] leading-none">×</span>
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => set({ [list]: [...value[list], ''] } as Partial<TermsDraft>)}
        disabled={value[list].length >= 12}
        className="mt-2 inline-flex min-h-11 items-center rounded-[14px] border border-dashed border-[var(--lp-outline-strong)] px-3.5 text-[14px] font-medium text-[var(--lp-dark)] disabled:opacity-40"
      >
        {list === 'items' ? t.addItem : t.addCondition}
      </button>
      <p className="mt-1.5 text-[13px] text-[var(--lp-text-sub)]">{list === 'items' ? t.itemsHint : t.conditionsHint}</p>
    </div>
  );

  const coversChoices: Array<{ key: string; label: string; covers: Covers }> = [
    { key: 'start', label: t.start, covers: { kind: 'start' } },
    ...items.map((item) => ({ key: `item:${item}`, label: item, covers: { kind: 'item', item } as Covers })),
    { key: 'all', label: t.all, covers: { kind: 'all' } },
  ];
  const coversKey = (covers: Covers) => (covers.kind === 'item' ? `item:${covers.item}` : covers.kind);

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <div>
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</p>
        <p className="mt-1 text-[14px] leading-6 text-[var(--lp-text-sub)]">{t.lead}</p>
      </div>

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

      {lineList('items')}

      <div>
        <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{t.parts}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const on = !customSplit && matchesPreset(value, preset.pcts);
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCustomSplit(false);
                  set({ parts: presetParts(preset.pcts) });
                }}
                className={cn(chip, on ? chipOn : chipOff)}
              >
                {preset.key === 'half' ? t.payHalf : t.payThirty}
              </button>
            );
          })}
          <button type="button" aria-pressed={customSplit} onClick={() => setCustomSplit(true)} className={cn(chip, customSplit ? chipOn : chipOff)}>
            {t.payCustom}
          </button>
        </div>
        {customSplit ? (
          <>
            <ol className="mt-3 space-y-2">
              {value.parts.map((part, index) => (
                <li key={index} className="rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.part.replace('{n}', String(index + 1))}</span>
                      {priceUsdc && priceUsdc > 0 ? (
                        <span className="whitespace-nowrap text-[13px] tabular-nums text-[var(--lp-text-sub)]">{((priceUsdc * part.pct) / 100).toFixed(2)} USDC</span>
                      ) : null}
                    </span>
                    <span className="flex w-24 shrink-0 items-center gap-1.5">
                      <input
                        inputMode="numeric"
                        value={String(part.pct)}
                        onChange={(e) => setPart(index, { pct: Math.min(99, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                        aria-label={`${t.part.replace('{n}', String(index + 1))} %`}
                        className="form-input form-input-num h-10 text-end"
                      />
                      <span aria-hidden className="text-[14px] text-[var(--lp-text-sub)]">%</span>
                    </span>
                    {value.parts.length > minParts ? (
                      <button
                        type="button"
                        onClick={() => removePart(index)}
                        aria-label={`${t.removeLine} ${t.part.replace('{n}', String(index + 1))}`}
                        className="grid size-10 place-items-center rounded-full text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
                      >
                        <span aria-hidden className="text-[18px] leading-none">×</span>
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-labelledby={`${id}-pays-${index}`}>
                    <span id={`${id}-pays-${index}`} className="me-1 text-[13px] text-[var(--lp-text-sub)]">{t.paysFor}</span>
                    {coversChoices.map((choice) => (
                      <button
                        key={choice.key}
                        type="button"
                        aria-pressed={coversKey(part.covers) === choice.key}
                        onClick={() => setPart(index, { covers: choice.covers })}
                        className={cn(chip, 'min-h-9 max-w-[16rem] truncate px-3 text-[13px]', coversKey(part.covers) === choice.key ? chipOn : chipOff)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
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
              <p className={cn('text-[13px] font-semibold tabular-nums', total === 100 ? 'text-[var(--lp-accent-on-light)]' : 'text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]')}>
                {(total === 100 ? t.total : t.needs100).replace('{sum}', String(total))}
              </p>
            </div>
          </>
        ) : null}
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
        <p className="mt-1.5 text-[13px] text-[var(--lp-text-sub)]">{t.reviewHint}</p>
      </div>

      <details open={moreOpen} onToggle={(event) => setMoreOpen(event.currentTarget.open)} className="border-y border-[var(--lp-border-light)]">
        <summary className="flex min-h-11 cursor-pointer items-center gap-3 py-3 text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
          {t.moreTerms}<span aria-hidden className="ms-auto">{moreOpen ? '−' : '+'}</span>
        </summary>
        <div className="pb-5">{lineList('conditions')}</div>
      </details>

      <section aria-live="polite" className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{t.agreement}</p>
          <p className="text-[13px] text-[var(--lp-text-sub)]">{t.agreementNote}</p>
        </div>
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
              <li key={issue.code} className="flex items-start gap-2 text-[13px] text-[var(--lp-dark)]">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--status-warning,#C98A1B)]" />
                {issue.code === 'no-items'
                  ? t.noItems
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
