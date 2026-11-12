'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Hint } from '@/shared/components/Hint';
import { Icon } from '@/shared/components/Icon';
import { usePathname } from 'next/navigation';
import { ProductBackLink } from '@/shared/components/ProductBackLink';
import { useAuth } from '@/shared/hooks/useAuth';

/// Every profile page: one plain title, an optional note behind an info mark,
/// and the content at the same width and edge.
export function ProfileFrame({ title, hint, backHref, hero = false, children }: { title: ReactNode; hint?: ReactNode; backHref?: string; hero?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  return (
    <div className="product-surface min-h-[calc(100vh-72px)] px-4 pb-16 pt-6 sm:px-6">
      <div className="mx-auto max-w-[640px]">
        {/* Back sits on this column, beside what it leaves, not at the page edge. */}
        <div data-own-back className="mb-3 empty:hidden">
          <ProductBackLink pathname={pathname} isAuthenticated={isAuthenticated} fallbackHref={backHref} />
        </div>
        <h1 className={hero ? 'flex items-center gap-2 py-1 text-[20px] font-semibold tracking-[-0.02em] text-[var(--ink)]' : 'flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]'}>
          {title}
          {hint ? <Hint side="bottom">{hint}</Hint> : null}
        </h1>
        <div className="mt-6 space-y-7">{children}</div>
      </div>
    </div>
  );
}

export function RowGroup({ title, hint, action, children }: { title?: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {title ? (
        <div className="mb-1 flex min-h-11 items-center justify-between gap-3 pe-2 ps-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">
            {title}
            {hint ? <Hint>{hint}</Hint> : null}
          </h2>
          {action}
        </div>
      ) : null}
      <div className="divide-y divide-[var(--line)] overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
        {children}
      </div>
    </section>
  );
}

const rowBase = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-start text-[15px]';
const interactive = 'transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]';

/// A fact or a way in: label on the left, its value (or a control) on the
/// right. With `href` or `onClick` the whole row opens it. `soon` shows a row
/// that is not built yet, never clickable.
export function Row({ label, value, href, onClick, soon, full = false, inline = false, children }: {
  label: ReactNode;
  /// Label and a compact control on one line, never wrapped under each other.
  inline?: boolean;
  value?: ReactNode;
  /// Show the whole value, wrapping, instead of two lines then cut.
  full?: boolean;
  href?: string;
  onClick?: () => void;
  soon?: string;
  children?: ReactNode;
}) {
  if (soon) {
    return (
      <div className={rowBase}>
        <span className="min-w-0 flex-1 font-medium text-[var(--ink-secondary)]">{label}</span>
        <span className="shrink-0 rounded-full bg-[var(--raised)] px-2.5 py-1 text-[14px] font-semibold text-[var(--ink-secondary)]">{soon}</span>
      </div>
    );
  }
  // A row with its own controls: the label and value keep one line, and the
  // controls drop under them when a phone has no room for both.
  if (children != null && !href && !onClick && inline) {
    return (
      <div className={rowBase}>
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">{label}</span>
        <span className="flex shrink-0 items-center">{children}</span>
      </div>
    );
  }
  if (children != null && !href && !onClick) {
    return (
      <div className={`${rowBase} flex-wrap py-2.5`}>
        <span className="flex min-w-0 flex-1 basis-[11rem] items-baseline justify-between gap-3">
          <span className="min-w-0 break-words font-medium text-[var(--ink)]">{label}</span>
          {value != null ? <span className="shrink-0 whitespace-nowrap text-end text-[14px] tabular-nums text-[var(--ink-secondary)] font-medium">{value}</span> : null}
        </span>
        <span className="ms-auto flex min-w-0 max-w-full flex-wrap justify-end gap-2">{children}</span>
      </div>
    );
  }
  // A long answer (what you offer, your description) reads under its label,
  // not squeezed against the right edge.
  if (full && value != null && !onClick && children == null) {
    const stacked = (
      <>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium text-[var(--ink)]">{label}</span>
          <span className="break-words text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{value}</span>
        </span>
        {href ? <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--ink-secondary)]" /> : null}
      </>
    );
    const cls = 'flex w-full items-center gap-3 px-4 py-3 text-start text-[15px]';
    return href ? <Link href={href} className={`${cls} ${interactive}`}>{stacked}</Link> : <div className={cls}>{stacked}</div>;
  }
  const content = (
    <>
      <span className={value != null ? 'max-w-[55%] shrink-0 break-words font-medium text-[var(--ink)]' : 'min-w-0 flex-1 font-medium text-[var(--ink)]'}>{label}</span>
      {value != null ? <span className={`${full ? '' : 'line-clamp-2 '}min-w-0 flex-1 break-words text-end text-[14px] tabular-nums text-[var(--ink-secondary)] font-medium`}>{value}</span> : null}
      {children}
      {href || onClick ? <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--ink-secondary)]" /> : null}
    </>
  );
  if (href) return <Link href={href} className={`${rowBase} ${interactive}`}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${rowBase} ${interactive}`}>{content}</button>;
  return <div className={rowBase}>{content}</div>;
}

/// A setting that is on or off: the label and one plain line under it on the
/// left, the switch at the end. The whole row toggles it.
export function ToggleRow({ label, note, checked, onChange }: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`${rowBase} ${interactive}`}>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--ink)]">{label}</span>
        {note ? <span className="block text-[14px] font-medium text-[var(--ink-secondary)]">{note}</span> : null}
      </span>
      <span aria-hidden className="relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200" style={{ background: checked ? 'var(--karwan-green)' : 'var(--color-line-strong)' }}>
        <span className="absolute top-0.5 size-5 rounded-full bg-[var(--canvas)] shadow-sm transition-[inset-inline-start] duration-200 motion-reduce:transition-none" style={{ insetInlineStart: checked ? 22 : 2 }} />
      </span>
    </button>
  );
}
