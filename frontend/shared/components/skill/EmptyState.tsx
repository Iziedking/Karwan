import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { BracketTag } from './BracketTag';

/// Product empty state. It states what is absent, what the user can do next,
/// and nothing more. No decorative illustration and no invented activity.
export function EmptyState({
  tag,
  title,
  body,
  action,
  onDark = true,
  className,
}: {
  tag: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn('border-y py-12 sm:py-16', className)}
      style={{ borderColor: onDark ? 'var(--rule-dark)' : 'var(--rule-light)' }}
    >
      <BracketTag variant="muted" onDark={onDark}>
        {tag}
      </BracketTag>
      <h2
        className={cn(
          'mt-4 max-w-[18ch] font-sans text-[clamp(24px,4vw,40px)] font-bold uppercase leading-[1.02] tracking-[-0.025em]',
          onDark ? 'text-[var(--ink-0)]' : 'text-[var(--ink-inv-0)]',
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className="mt-4 max-w-[58ch] text-[15px] leading-6"
          style={{ color: onDark ? 'var(--ink-2)' : 'var(--ink-inv-2)' }}
        >
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
