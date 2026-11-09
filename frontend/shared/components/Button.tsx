import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// `primary` is the one green button on a screen (view 48). `secondary` is the
/// surface button with a hairline; `outline` is the same look under its old name.
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'critical' | 'tonal';
/// The mark before the label: a lock on a button that moves money, plus and
/// send on quick actions (owner, 9 Nov 2026, Figma 218:570).
export type ButtonLead = 'lock' | 'plus' | 'send';
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
  // The quiet pair for quick actions such as Add money and Send.
  tonal: 'bg-[var(--ash)] text-[var(--ink)] hover:opacity-90',
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
  lead?: ButtonLead;
  /// A round arrow at the end: this goes on to the next step.
  go?: boolean;
  /// The move went through: the lead turns into a check.
  done?: boolean;
}

const LEAD_PATHS: Record<ButtonLead | 'check', ReactNode> = {
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M7 17 17 7M9 7h8v8" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export function LeadIcon({ name, size }: { name: ButtonLead | 'check'; size: number }) {
  return (
    <svg data-button-lead={name} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      {LEAD_PATHS[name]}
    </svg>
  );
}

/// The round go-on mark: ink disc, green arrow, mirrored in Arabic.
function GoMark() {
  return (
    <span data-button-go aria-hidden className="-me-2.5 ms-auto grid size-9 shrink-0 place-items-center rounded-full bg-[var(--on-action)] text-[var(--action)]">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
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
  { variant = 'primary', size = 'md', loading = false, loadingLabel, lead, go = false, done = false, disabled, className, children, ...rest },
  ref,
) {
  const iconSize = size === 'lg' ? 20 : 16;
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, loading, className: cn(go && !loading && 'justify-between', className) })}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : done ? <LeadIcon name="check" size={iconSize} /> : lead ? <LeadIcon name={lead} size={iconSize} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
      {go && !loading && !done ? <GoMark /> : null}
    </button>
  );
});
