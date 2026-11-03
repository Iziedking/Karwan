import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// `primary` is the one green button on a screen (view 48). `secondary` is the
/// surface button with a hairline; `outline` is the same look under its old name.
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'critical';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2.5 rounded-[var(--radius-button)] font-sans font-semibold ' +
  'transition-[opacity,background-color,border-color,color,transform] duration-[var(--dur-press)] ease-[var(--ease-ui)] active:scale-[0.98] motion-reduce:active:scale-100 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]';

const SECONDARY =
  'border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--raised)]';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--action)] text-[var(--on-action)] hover:opacity-90',
  secondary: SECONDARY,
  outline: SECONDARY,
  ghost: 'text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:bg-[var(--raised)]',
  critical:
    'border border-[var(--color-critical)] text-[var(--color-critical)] ' +
    'hover:bg-[var(--color-critical-soft)]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-[14px]',
  md: 'px-4 py-2.5 text-[14px]',
  lg: 'min-h-[52px] px-5 text-[15px]',
};

/// The shared class string. Use this to style a Link or anchor as a button
/// without duplicating the design.
export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  loading?: boolean;
}): string {
  return cn(
    BASE,
    VARIANTS[opts?.variant ?? 'primary'],
    SIZES[opts?.size ?? 'md'],
    // A loading button keeps its colour and size: it is busy, not unavailable.
    opts?.loading ? 'cursor-progress active:scale-100' : 'disabled:cursor-not-allowed disabled:opacity-40',
    opts?.className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /// What is happening while it loads, such as "Releasing 600 USDC".
  loadingLabel?: ReactNode;
}

/// The turning mark (Figma Spinner). It keeps turning under reduced motion,
/// because it is the only sign that money is moving.
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="shrink-0 animate-spin" aria-hidden>
      <path d="M18 10a8 8 0 1 1-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/// The single button primitive. A loading button is disabled, keeps its place
/// and size, shows the spinner and says what is happening. Icon-only buttons
/// must still pass an `aria-label`.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, loadingLabel, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, loading, className })}
      {...rest}
    >
      {loading && <Spinner size={size === 'lg' ? 20 : 16} />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});
