'use client';

import { useId, useState } from 'react';
import { openHelp } from '@/shared/assistant/openHelp';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The assistant on Home: a box to type in and two things it can do straight
/// away. What is sent opens the assistant with it already asked.
export function AskCard() {
  const t = useTranslations().startFlow.home.ask;
  const id = useId();
  const [text, setText] = useState('');
  const ask = (words: string) => {
    const clean = words.trim();
    if (!clean) return;
    openHelp(clean, { send: true });
    setText('');
  };
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6">
      <h2 id={`${id}-title`} className="text-[19px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</h2>
      <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{t.body}</p>
      <form
        className="mt-auto pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <label htmlFor={`${id}-input`} className="sr-only">{t.label}</label>
        <div className="flex min-h-[52px] items-center gap-2 rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-light)] py-1.5 pe-1.5 ps-4 focus-within:ring-2 focus-within:ring-[var(--lp-accent)]">
          <input
            id={`${id}-input`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.placeholder}
            dir="auto"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-sub)]"
          />
          <button type="submit" aria-label={t.send} disabled={!text.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)] transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
            {/* The Enter-key mark, as everywhere the assistant takes a message. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100"><path d="M20 5v8H6" /><path d="m10 9-4 4 4 4" /></svg>
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {t.chips.map((chip) => (
          <button key={chip} type="button" onClick={() => ask(chip)} className="min-h-11 rounded-full border border-[var(--lp-border-light)] px-3.5 text-[14px] font-semibold text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">
            {chip}
          </button>
        ))}
      </div>
    </section>
  );
}
