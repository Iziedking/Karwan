/// Control classes shared by the money and search sheets, so the one primary
/// action and its alternatives look the same everywhere.
export const PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors duration-200 hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2';
export const SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
export const CHIP =
  'inline-flex min-h-11 items-center rounded-full border border-[var(--lp-outline-strong)] px-3.5 text-[13px] font-semibold text-[var(--lp-dark)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
export const FIELD =
  'block w-full min-h-12 rounded-[10px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] px-3.5 text-[15px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
export const LINK =
  'inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
export const QUIET =
  'inline-flex min-h-11 items-center px-2 text-[14px] font-medium text-[var(--lp-text-sub)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
/// A line that says something did not go through: a critical rule at the
/// start, the words in body ink so contrast holds in both themes.
export const ALERT = 'border-s-2 border-[var(--color-critical)] ps-3 text-[14px] leading-relaxed text-[var(--lp-dark)]';
