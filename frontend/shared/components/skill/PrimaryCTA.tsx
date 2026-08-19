'use client';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode, MouseEventHandler } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';

/// SKILL.md §4.3. Primary lime pill CTA. The ONE accent per view (skill §1.3).
/// Background --accent, text --accent-ink, 10px radius, 14y/22x padding, mono
/// uppercase, trailing icon at 14px with 8px gap. Hover deepens the lime and
/// nudges the icon 2px in its direction. Press scales 0.98.
///
/// Icon defaults to ↓ for "scroll-to" anchors and → for navigation. Override
/// with the `icon` prop.

export function PrimaryCTA({
  children,
  href,
  onClick,
  icon = '›',
  className,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const baseClass = cn(
    'group relative inline-flex items-center gap-2 px-[22px] py-[14px] font-mono text-[12px] font-semibold uppercase tracking-[0.06em]',
    'transition-colors duration-[var(--dur-micro)] hover:bg-[var(--accent-deep)]',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  );
  const baseStyle: React.CSSProperties = {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    borderRadius: 10,
    outlineColor: 'var(--accent)',
    outlineOffset: 2,
  };
  const content = (
    <>
      <span>{children}</span>
      <span
        aria-hidden
        className="nudge-fwd inline-flex transition-transform duration-[var(--dur-fast)]"
        style={{ fontSize: 14, lineHeight: 1 }}
      >
        {icon}
      </span>
    </>
  );
  // Press feedback is the only transform. Reduced-motion users get the color
  // transition without scale.
  if (href) {
    const external = /^(?:https?:|mailto:|tel:)/.test(href);
    return (
      <motion.span
        whileTap={reduced ? undefined : { scale: 0.98 }}
        transition={{ duration: reduced ? 0 : dur.micro, ease: ease.out }}
        style={{ display: 'inline-block' }}
      >
        {external ? (
          <a href={href} className={baseClass} style={baseStyle}>
            {content}
          </a>
        ) : (
          <Link href={href} className={baseClass} style={baseStyle}>
            {content}
          </Link>
        )}
      </motion.span>
    );
  }
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled || reduced ? undefined : { scale: 0.98 }}
      transition={{ duration: reduced ? 0 : dur.micro, ease: ease.out }}
      className={baseClass}
      style={baseStyle}
    >
      {content}
    </motion.button>
  );
}
