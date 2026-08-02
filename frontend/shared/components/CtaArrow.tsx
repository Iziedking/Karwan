import { cn } from '@/shared/utils/cn';

/// The arrow on an inline call to action.
///
/// A bare `→` glyph reads as punctuation. This gives it a chip: a small square
/// that fills lime on hover, borrowing the corner language from CTAPill (three
/// rounded corners, one cut to 2px) so an inline link and a button look like
/// they come from the same product.
///
/// Meant for TEXT links. Do not put it inside CTAPill: the pill is already the
/// affordance, and a bordered chip inside a filled button reads as two buttons.
///
/// The hover state is driven by the PARENT link via `group-hover`, so the whole
/// row lights up together rather than only when the pointer is over the 20px
/// chip itself. Wrap the link in `group`.
export function CtaArrow({
  className,
  tone = 'light',
}: {
  className?: string;
  /// Which band it sits on. Decides the resting ink, not the hover, which is
  /// always lime.
  tone?: 'light' | 'dark';
}) {
  const ink = tone === 'dark' ? 'white' : 'var(--lp-dark)';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center shrink-0 w-5 h-5 align-middle',
        // Border and background are the only animated properties. Animating
        // layout here would nudge the label every time a pointer crossed it.
        'transition-[background-color,border-color] duration-[180ms] ease-out',
        'border group-hover:border-transparent',
        'group-hover:bg-[var(--lp-accent)]',
        className,
      )}
      style={{
        borderColor: `color-mix(in oklab, ${ink} 20%, transparent)`,
        color: ink,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 2,
      }}
    >
      <svg
        viewBox="0 0 10 10"
        className={cn(
          'w-2.5 h-2.5',
          // The 2px nudge, and the colour swap once the chip is lime.
          'transition-transform duration-[180ms] ease-out',
          'group-hover:translate-x-[2px] group-hover:text-[var(--lp-band-dark)]',
          // Arabic reads right to left, so the arrow has to point the other way.
          // Arbitrary-variant syntax rather than the `rtl:` variant, which this
          // config does not enable. The nudge below flips with it.
          '[[dir=rtl]_&]:-scale-x-100',
          'motion-reduce:transition-none motion-reduce:group-hover:translate-x-0',
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="square"
      >
        <path d="M1 5h7M5.2 1.8 8.4 5 5.2 8.2" />
      </svg>
    </span>
  );
}

/// Strip a trailing arrow glyph from a translated CTA string.
///
/// Several CTA strings carry their arrow inline (`'Post an offer →'`, and `←`
/// in Arabic). Where the chip renders the arrow instead, the text would
/// otherwise show two. Stripping at render rather than editing the strings
/// keeps the same copy working in the places that still want a plain inline
/// arrow, notably inside CTAPill.
export function withoutTrailingArrow(label: string): string {
  return label.replace(/[\s ]*[→←↗↘⟶]\s*$/u, '');
}
