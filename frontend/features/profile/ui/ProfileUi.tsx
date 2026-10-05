'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';

/// Every profile page: one plain title, an optional note behind an info mark,
/// and the content at the same width and edge.
export function ProfileFrame({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <main className="product-surface min-h-[calc(100vh-72px)] px-4 pb-16 pt-6 sm:px-6">
      <div className="mx-auto max-w-[640px]">
        <h1 className="flex items-center gap-2 text-[28px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">
          {title}
          {hint ? <Hint side="bottom">{hint}</Hint> : null}
        </h1>
        <div className="mt-6 space-y-7">{children}</div>
      </div>
    </main>
  );
}

export function RowGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title ? <h2 className="mb-2 px-1 text-[13px] font-semibold text-[var(--lp-text-sub)]">{title}</h2> : null}
      <div className="divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
        {children}
      </div>
    </section>
  );
}

const rowBase = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-start text-[15px]';
const interactive = 'transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]';

/// A fact or a way in: label on the left, its value (or a control) on the
/// right. With `href` or `onClick` the whole row opens it. `soon` shows a row
/// that is not built yet, never clickable.
export function Row({ label, value, href, onClick, soon, children }: {
  label: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  soon?: string;
  children?: ReactNode;
}) {
  if (soon) {
    return (
      <div className={rowBase}>
        <span className="min-w-0 flex-1 font-medium text-[var(--lp-text-sub)]">{label}</span>
        <span className="shrink-0 rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[12px] font-semibold text-[var(--lp-text-sub)]">{soon}</span>
      </div>
    );
  }
  const content = (
    <>
      <span className={value != null ? 'max-w-[55%] shrink-0 break-words font-medium text-[var(--lp-dark)]' : 'min-w-0 flex-1 font-medium text-[var(--lp-dark)]'}>{label}</span>
      {value != null ? <span className="line-clamp-2 min-w-0 flex-1 break-words text-end text-[14px] tabular-nums text-[var(--lp-text-sub)]">{value}</span> : null}
      {children}
      {href || onClick ? <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--lp-text-sub)]" /> : null}
    </>
  );
  if (href) return <Link href={href} className={`${rowBase} ${interactive}`}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${rowBase} ${interactive}`}>{content}</button>;
  return <div className={rowBase}>{content}</div>;
}
