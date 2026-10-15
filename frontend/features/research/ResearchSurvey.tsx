'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import {
  CHECKS,
  PAYER,
  ROLES,
  SHARE,
  SIGNALS,
  emptyResearchDraft,
  researchIssues,
  researchPayload,
  type ResearchDraft,
  type ResearchField,
} from './researchForm';

type SendState = 'idle' | 'sending' | 'sent' | 'failed' | 'limited';

/// Five plain questions on how people decide who to trust online. Everything
/// is on one page; nothing is asked of the visitor beyond the answers.
export function ResearchSurvey() {
  const t = useTranslations().research;
  const { locale } = useLocale();
  const [draft, setDraft] = useState<ResearchDraft>(emptyResearchDraft);
  const [showIssues, setShowIssues] = useState(false);
  const [state, setState] = useState<SendState>('idle');
  const formRef = useRef<HTMLFormElement>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  const issues = researchIssues(draft);
  const issueFor = (field: ResearchField) => (showIssues && issues[field] ? (issues[field] === 'pickOne' ? t.pickOne : t.required) : null);
  const set = <K extends keyof ResearchDraft>(key: K, value: ResearchDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleCheck = (check: (typeof CHECKS)[number]) =>
    setDraft((d) => ({ ...d, checks: d.checks.includes(check) ? d.checks.filter((c) => c !== check) : [...d.checks, check] }));

  useEffect(() => {
    if (state === 'sent') thanksRef.current?.focus();
  }, [state]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowIssues(true);
    const first = (Object.keys(issues) as ResearchField[])[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setState('sending');
    try {
      await api.submitResearch(researchPayload(draft, locale));
      setState('sent');
    } catch (err) {
      setState(err instanceof ApiError && err.status === 429 ? 'limited' : 'failed');
    }
  }

  if (state === 'sent') {
    return (
      <section className="mx-auto w-full max-w-[640px] px-4 py-16 sm:py-24">
        <h1 ref={thanksRef} tabIndex={-1} className="text-[32px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)] focus:outline-none">{t.thanksTitle}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-[var(--lp-text-sub)]">{t.thanksBody}</p>
        <Link href="/" className="mt-8 inline-flex min-h-12 items-center rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] focus-visible:ring-offset-2">
          {t.home}
        </Link>
      </section>
    );
  }

  const blocked = showIssues && Object.keys(issues).length > 0;
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="mx-auto w-full max-w-[640px] px-4 py-10 sm:py-16">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{t.kicker}</p>
      <h1 className="mt-3 text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] text-[var(--lp-dark)] sm:text-[40px]">{t.title}</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-[var(--lp-text-sub)]">{t.lead}</p>

      <div className="mt-8 space-y-4">
        <Question field="role" n={1} heading={t.q1} error={issueFor('role')} step={t.step}>
          {ROLES.map((r) => (
            <Choice key={r} type="radio" name="role" checked={draft.role === r} onChange={() => set('role', r)}>{t.roles[r]}</Choice>
          ))}
        </Question>

        <Question field="checks" n={2} heading={t.q2} hint={t.pickAll} error={issueFor('checks')} step={t.step}>
          {CHECKS.map((c) => (
            <Choice key={c} type="checkbox" name="checks" checked={draft.checks.includes(c)} onChange={() => toggleCheck(c)}>{t.checks[c]}</Choice>
          ))}
          {draft.checks.includes('other') ? (
            <label className="mt-2 block">
              <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.otherLabel}</span>
              <input
                value={draft.otherText}
                onChange={(e) => set('otherText', e.target.value)}
                maxLength={140}
                className="mt-1 min-h-12 w-full rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 text-[16px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              />
            </label>
          ) : null}
        </Question>

        <Question field="trustMost" n={3} heading={t.q3} error={issueFor('trustMost') ?? issueFor('easiestFake')} step={t.step}>
          <Pills label={t.trustLabel} name="trustMost" value={draft.trustMost} onPick={(v) => set('trustMost', v)} options={SIGNALS.map((s) => [s, t.signals[s]])} />
          <Pills label={t.fakeLabel} name="easiestFake" field="easiestFake" value={draft.easiestFake} onPick={(v) => set('easiestFake', v)} options={SIGNALS.map((s) => [s, t.signals[s]])} />
        </Question>

        <Question field="share" n={4} heading={t.q4} error={issueFor('share')} step={t.step}>
          {SHARE.map((s) => (
            <Choice key={s} type="radio" name="share" checked={draft.share === s} onChange={() => set('share', s)}>{t.share[s]}</Choice>
          ))}
        </Question>

        <Question field="payer" n={5} heading={t.q5} error={issueFor('payer')} step={t.step} note={t.payerNote}>
          {PAYER.map((p) => (
            <Choice key={p} type="radio" name="payer" checked={draft.payer === p} onChange={() => set('payer', p)}>{t.payer[p]}</Choice>
          ))}
        </Question>

        <div className="rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <label className="block">
            <span className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.contactTitle}</span>
            <span className="ms-2 text-[14px] text-[var(--lp-text-sub)]">{t.optional}</span>
            <input
              value={draft.contact}
              onChange={(e) => set('contact', e.target.value)}
              maxLength={120}
              autoComplete="email"
              placeholder={t.contactPlaceholder}
              className="mt-3 min-h-12 w-full rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 text-[16px] text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            />
          </label>
          <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{t.contactNote}</p>
        </div>

        {/* For bots only: people never see or reach this field. */}
        <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
          <input name="website" tabIndex={-1} autoComplete="off" value={draft.website} onChange={(e) => set('website', e.target.value)} />
        </div>
      </div>

      <p role="alert" className="mt-5 min-h-[1.5em] text-[14px] font-medium text-[color-mix(in_srgb,var(--lp-dark)_70%,var(--neg))]">
        {blocked ? t.fixAbove : state === 'failed' ? t.failed : state === 'limited' ? t.tooMany : ''}
      </p>
      <button
        type="submit"
        disabled={state === 'sending'}
        aria-busy={state === 'sending'}
        className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 text-[16px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] focus-visible:ring-offset-2"
      >
        {state === 'sending' ? t.sending : t.send}
      </button>
    </form>
  );
}

function Question({ field, n, step, heading, hint, note, error, children }: {
  field: ResearchField;
  n: number;
  step: string;
  heading: string;
  hint?: string;
  note?: string;
  error: string | null;
  children: ReactNode;
}) {
  const errorId = useId();
  return (
    <fieldset
      data-field={field}
      tabIndex={-1}
      aria-describedby={error ? errorId : undefined}
      className={cn(
        'rounded-[18px] border bg-[var(--lp-card)] p-5 focus:outline-none',
        error ? 'border-[color-mix(in_srgb,var(--lp-dark)_40%,var(--neg))]' : 'border-[var(--lp-border-light)]',
      )}
    >
      <legend className="sr-only">{heading}</legend>
      <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">
        {step.replace('{n}', String(n))}
        {hint ? ` · ${hint}` : ''}
      </p>
      <p aria-hidden className="mt-1 text-[18px] font-semibold leading-snug text-[var(--lp-dark)]">{heading}</p>
      {error ? <p id={errorId} className="mt-2 text-[14px] font-medium text-[color-mix(in_srgb,var(--lp-dark)_70%,var(--neg))]">{error}</p> : null}
      <div className="mt-4 space-y-2">{children}</div>
      {note ? <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">{note}</p> : null}
    </fieldset>
  );
}

function Choice({ type, name, checked, onChange, children }: { type: 'radio' | 'checkbox'; name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-2 text-[16px] text-[var(--lp-dark)] transition-colors',
        'focus-within:ring-2 focus-within:ring-[var(--lp-accent)]',
        checked ? 'border-[var(--lp-dark)] bg-[var(--lp-light)]' : 'border-[var(--lp-border-light)] hover:bg-[var(--lp-light)]',
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="size-5 shrink-0 accent-[var(--lp-dark)]" />
      <span>{children}</span>
    </label>
  );
}

function Pills<T extends string>({ label, name, field, value, onPick, options }: {
  label: string;
  name: string;
  field?: ResearchField;
  value: T | undefined;
  onPick: (v: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-field={field} tabIndex={field ? -1 : undefined} className="focus:outline-none">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <label
            key={v}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[15px] text-[var(--lp-dark)] transition-colors focus-within:ring-2 focus-within:ring-[var(--lp-accent)]',
              value === v ? 'border-[var(--lp-dark)] bg-[var(--lp-light)] font-semibold' : 'border-[var(--lp-border-light)] hover:bg-[var(--lp-light)]',
            )}
          >
            <input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} className="sr-only" />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}
