'use client';

import { useId, useState } from 'react';
import { openHelp } from '@/shared/assistant/openHelp';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { CARD_PILL, CardGlyph, LitCard, type CardIcon } from './LitCard';

const CHIP_ICONS: readonly CardIcon[] = ['tag', 'request', 'shield'];

/// The assistant on Home: a box to type in and three things it can do straight
/// away. What is sent opens Help with it already asked (owner, 6 Nov 2026),
/// so the person stays on Home.
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
    <LitCard icon="spark" title={t.title} body={t.body} titleId={`${id}-title`}>
      <form
        data-ask-card
        className="mt-auto pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <label htmlFor={`${id}-input`} className="sr-only">{t.label}</label>
        <div className="flex min-h-[52px] items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lp-dark)_10%,transparent)] bg-[var(--lp-light)] py-1.5 pe-1.5 ps-4 focus-within:ring-2 focus-within:ring-[var(--lp-accent)]">
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
        {t.chips.map((chip, i) => (
          <button key={chip} type="button" onClick={() => ask(chip)} className={CARD_PILL}>
            <CardGlyph name={CHIP_ICONS[i] ?? 'spark'} size={16} className="shrink-0 text-[var(--lp-text-sub)]" />
            {chip}
          </button>
        ))}
      </div>
    </LitCard>
  );
}
