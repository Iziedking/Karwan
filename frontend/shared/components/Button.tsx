import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'critical';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Tokens, not hex. `primary` inverts ink/surface so it reads correctly in both
// the light and dark themes, which the old hardcoded #0c0e10 buttons did not.
const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] font-mono font-semibold uppercase tracking-[0.06em] ' +
  'transition-[opacity,background-color,border-color,color,transform] duration-[var(--dur-fast)] active:scale-[0.98] motion-reduce:active:scale-100 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-deep)]',
  outline:
    'border border-[var(--color-line-strong)] text-[var(--color-ink)] ' +
    'hover:bg-[var(--color-surface-2)] hover:border-[var(--color-ink-dim)]',
  ghost: 'text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
  critical:
    'border border-[var(--color-critical)] text-[var(--color-critical)] ' +
    'hover:bg-[var(--color-critical-soft)]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-[10px]',
  md: 'px-4 py-2.5 text-[11px]',
  lg: 'px-5 py-3 text-[12px]',
};

/// The shared class string. Use this to style a Link or anchor as a button
/// without duplicating the design.
export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  return cn(
    BASE,
    VARIANTS[opts?.variant ?? 'primary'],
    SIZES[opts?.size ?? 'md'],
    opts?.className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      className="animate-spin motion-reduce:animate-none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/// The single button primitive. A `loading` button is also disabled and shows
/// a spinner. Icon-only buttons must still pass an `aria-label`.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});
