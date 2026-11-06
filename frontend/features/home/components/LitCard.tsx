import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// Icons for the Home cards, drawn like the rest of the app (24 grid, 1.8 stroke).
const PATHS = {
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 3v4M17 5h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  request: <path d="M17 7 7 17M15 17H7V9" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  send: <><path d="M21 3 10 14" /><path d="M21 3 14.5 21l-4.5-7-7-4.5z" /></>,
  list: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></>,
} as const;

export type CardIcon = keyof typeof PATHS;

export function CardGlyph({ name, size = 18, className }: { name: CardIcon; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {PATHS[name]}
    </svg>
  );
}

/// A Home card lit from the top in the accent, with its mark beside the title
/// (owner, 6 Nov 2026: the assistant card, version 1). The light is the one
/// colour on it; the actions stay neutral pills.
export function LitCard({ icon, badge, title, body, titleId, guide, className, children }: {
  icon?: CardIcon;
  /** Takes the place of the icon badge, such as a progress ring. */
  badge?: ReactNode;
  title: string;
  body: string;
  titleId: string;
  guide?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-lit-card
      data-guide={guide}
      aria-labelledby={titleId}
      className={cn('flex flex-col rounded-[24px] border border-[var(--lp-border-light)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--lp-accent)_9%,var(--lp-card))_0%,var(--lp-card)_58%)] p-5 sm:p-6', className)}
    >
      <div className="flex items-center gap-3">
        {badge ?? (
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[color-mix(in_srgb,var(--lp-accent)_16%,transparent)] text-[var(--lp-accent-on-light)]">
            <CardGlyph name={icon ?? 'spark'} size={22} />
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--lp-dark)]">{title}</h2>
          <p className="mt-0.5 text-[14px] leading-snug text-[var(--lp-text-sub)]">{body}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/// One action on a lit card: a neutral pill with its icon.
export const CARD_PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--lp-dark)_7%,transparent)] bg-[var(--raised)] ps-3 pe-4 text-[14px] font-medium text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';
