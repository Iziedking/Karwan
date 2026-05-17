'use client';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// Theme-aware chip used for connector states (X handle, Telegram handle,
/// linked third-party accounts). Sits on either light or dark bands without
/// needing a tone prop because all colors derive from currentColor via
/// `color-mix`. The parent's text color drives everything.
///
/// Variants:
///   - `linked`: solid chip, full opacity border + ink
///   - `idle`: outlined, lower-contrast border for "not connected" states
///   - `accent`: lime fill for emphasis (rare, only the active CTA per skill)
export function ConnectorPill({
  children,
  variant = 'linked',
  onClick,
  href,
  target,
  rel,
  title,
  disabled,
  className,
}: {
  children: ReactNode;
  variant?: 'linked' | 'idle' | 'accent';
  onClick?: () => void;
  href?: string;
  target?: string;
  rel?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  const baseClass = cn(
    'inline-flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] leading-none whitespace-nowrap transition-[border-color,background] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
    disabled && 'opacity-60 cursor-not-allowed',
    className,
  );

  const linkedStyle: CSSProperties = {
    color: variant === 'accent' ? 'var(--accent-ink)' : 'inherit',
    background:
      variant === 'accent'
        ? 'var(--accent)'
        : 'color-mix(in srgb, currentColor 4%, transparent)',
    borderTop: `1px solid ${
      variant === 'accent'
        ? 'transparent'
        : variant === 'linked'
          ? 'color-mix(in srgb, currentColor 22%, transparent)'
          : 'color-mix(in srgb, currentColor 14%, transparent)'
    }`,
    borderLeft: `1px solid ${
      variant === 'accent'
        ? 'transparent'
        : variant === 'linked'
          ? 'color-mix(in srgb, currentColor 22%, transparent)'
          : 'color-mix(in srgb, currentColor 14%, transparent)'
    }`,
    borderRight: `1px solid ${
      variant === 'accent'
        ? 'transparent'
        : variant === 'linked'
          ? 'color-mix(in srgb, currentColor 22%, transparent)'
          : 'color-mix(in srgb, currentColor 14%, transparent)'
    }`,
    borderBottom: `1px solid ${
      variant === 'accent'
        ? 'transparent'
        : variant === 'linked'
          ? 'color-mix(in srgb, currentColor 22%, transparent)'
          : 'color-mix(in srgb, currentColor 14%, transparent)'
    }`,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 2,
  };

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        title={title}
        className={baseClass}
        style={linkedStyle}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={baseClass}
      style={linkedStyle}
    >
      {children}
    </button>
  );
}

/// Subtle hover badge (e.g. "LINKED", "UNLINK") meant to ride alongside the
/// pill. Inherits color via currentColor so it adapts to light or dark.
export function ConnectorBadge({
  children,
  variant = 'muted',
}: {
  children: ReactNode;
  variant?: 'muted' | 'pos';
}) {
  const color =
    variant === 'pos'
      ? 'var(--accent)'
      : 'color-mix(in srgb, currentColor 55%, transparent)';
  return (
    <span
      className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-[3px] leading-none"
      style={{
        color,
        background:
          variant === 'pos'
            ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
            : 'color-mix(in srgb, currentColor 8%, transparent)',
        border:
          variant === 'pos'
            ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
            : '1px solid color-mix(in srgb, currentColor 14%, transparent)',
        borderRadius: 3,
      }}
    >
      {children}
    </span>
  );
}
