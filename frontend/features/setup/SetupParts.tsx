'use client';

import { motion } from 'motion/react';
import { cn } from '@/shared/utils/cn';
import { ease } from '@/shared/motion/tokens';

/// A choice in the setup conversation: the whole card is the button, and a
/// picked one fills with the accent while its tick draws in.
export function ChoiceCard({ label, note, on, multi, reduce, onPick }: {
  label: string;
  note: string;
  on: boolean;
  multi: boolean;
  reduce: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      onClick={onPick}
      className={cn(
        'flex min-h-[68px] w-full items-center gap-4 rounded-[16px] border px-[18px] py-3 text-start transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        on ? 'border-[var(--lp-accent)] bg-[var(--offer-surface)]' : 'border-[var(--lp-outline-strong)] bg-[var(--lp-card)] hover:bg-[var(--lp-light)]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-[var(--lp-dark)]">{label}</span>
        <span className="mt-0.5 block text-[14px] font-medium text-[var(--lp-text-sub)]">{note}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'grid size-[26px] shrink-0 place-items-center border transition-colors duration-[180ms]',
          multi ? 'rounded-[8px]' : 'rounded-full',
          on ? 'border-[var(--lp-accent)] bg-[var(--lp-accent)] text-[var(--accent-ink)]' : 'border-[var(--lp-outline-strong)]',
        )}
      >
        {on ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.18, ease: ease.out }}
            />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

/// One question answered in the person's own words, with examples to tap.
export function TextQuestion({ id, label, help, example, examples, value, onChange }: {
  id: string;
  label: string;
  help: string;
  example: string;
  examples: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <h1 id={`${id}-title`} className="text-[30px] font-bold leading-tight tracking-[-0.03em] text-[var(--lp-dark)]">{label}</h1>
      <p className="mt-2 text-[16px] font-medium text-[var(--lp-text-sub)]">{help}</p>
      <input
        id={id}
        aria-labelledby={`${id}-title`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={example}
        dir="auto"
        className="mt-6 block min-h-14 w-full rounded-[14px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] px-[18px] text-[17px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => onChange(x)}
            className="min-h-11 rounded-full border border-[var(--lp-outline-strong)] px-3.5 text-[14px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}

/// "Here's your Karwan": each line arrives in turn, 60 ms apart.
export function SummaryLines({ lines, reduce }: { lines: string[]; reduce: boolean }) {
  return (
    <motion.ul
      className="mt-6 divide-y divide-[var(--lp-border-light)] rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.12 } } }}
    >
      {lines.map((line) => (
        <motion.li
          key={line}
          className="flex items-start gap-3 py-3"
          variants={{ hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0.12 : 0.26, ease: ease.out } } }}
        >
          <span aria-hidden className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[var(--accent-ink)]">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span dir="auto" className="text-[16px] leading-normal text-[var(--lp-dark)]">{line}</span>
        </motion.li>
      ))}
    </motion.ul>
  );
}
