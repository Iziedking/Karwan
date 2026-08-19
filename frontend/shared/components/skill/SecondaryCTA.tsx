import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

type SecondaryCTAProps = {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactNode;
  className?: string;
  onDark?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
};

/// SKILL.md §4.4. Secondary actions are quiet outlines on dark surfaces and
/// solid ink on light surfaces. They never compete with the one lime action.
export function SecondaryCTA({
  children,
  href,
  onClick,
  icon = '›',
  className,
  onDark = true,
  type = 'button',
  disabled,
}: SecondaryCTAProps) {
  const classes = cn(
    'group inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-[22px] py-[13px]',
    'font-mono text-[12px] font-semibold uppercase tracking-[0.06em]',
    'transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)]',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    onDark
      ? 'border border-white/30 text-[var(--ink-0)] hover:border-white/55 hover:bg-white/[0.06]'
      : 'border border-[var(--ink-inv-0)] bg-[var(--ink-inv-0)] text-[var(--ink-0)] hover:bg-transparent hover:text-[var(--ink-inv-0)]',
    disabled && 'cursor-not-allowed opacity-45',
    className,
  );
  const content = (
    <>
      <span>{children}</span>
      <span aria-hidden className="nudge-fwd text-[14px] leading-none">
        {icon}
      </span>
    </>
  );

  if (href) {
    const external = /^(?:https?:|mailto:|tel:)/.test(href);
    if (external) {
      return (
        <a href={href} className={classes}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  );
}
