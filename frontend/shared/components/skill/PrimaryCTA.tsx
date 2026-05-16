'use client';
import { motion } from 'motion/react';
import type { ReactNode, MouseEventHandler } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/cn';
import { dur, ease } from '@/shared/motion/tokens';

/// SKILL.md §4.3 — primary lime pill CTA. The ONE accent per view (skill §1.3).
/// Background --accent, text --accent-ink, 10px radius, 14y/22x padding, mono
/// uppercase, trailing icon at 14px with 8px gap. Hover squashes 1.02→1 and
/// the icon nudges 2px in its direction. Press scales 0.98.
///
/// Icon defaults to ↓ for "scroll-to" anchors and → for navigation. Override
/// with the `icon` prop.

export function PrimaryCTA({
  children,
  href,
  onClick,
  icon = '↓',
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
  const baseClass = cn(
    'group relative inline-flex items-center gap-2 px-[22px] py-[14px] font-mono text-[12px] font-semibold uppercase tracking-[0.06em]',
    'transition-colors duration-[var(--dur-micro)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0)]',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  );
  const baseStyle: React.CSSProperties = {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    borderRadius: 10,
    boxShadow: '0 6px 18px rgba(216,255,61,0.18)',
  };
  const content = (
    <>
      <span>{children}</span>
      <span
        aria-hidden
        className="inline-flex transition-transform duration-[var(--dur-fast)] group-hover:translate-x-[2px] group-hover:translate-y-[2px]"
        style={{ fontSize: 14, lineHeight: 1 }}
      >
        {icon}
      </span>
    </>
  );
  // motion.button so the press squash uses spring; hovers handled by CSS for
  // performance. The whileTap shrink lands in 120ms (under reduced-motion the
  // CSS vars halve the perceived duration).
  if (href) {
    return (
      <motion.span
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: dur.micro, ease: ease.out }}
        style={{ display: 'inline-block' }}
      >
        <Link href={href} className={baseClass} style={baseStyle}>
          {content}
        </Link>
      </motion.span>
    );
  }
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: dur.micro, ease: ease.out }}
      className={baseClass}
      style={baseStyle}
    >
      {content}
    </motion.button>
  );
}
