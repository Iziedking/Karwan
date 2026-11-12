'use client';

import type { ReactNode } from 'react';

/// An older desk page's header in the view 79 look. The eyebrow is kept as a
/// prop for the callers but no longer shown: the sidebar already names the page.
export function AdminPageHeader({
  title,
  description,
  meta,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 pb-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-[760px]">
        <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em] text-[var(--d-text)]">{title}</h1>
        <p className="mt-1.5 max-w-[68ch] text-[13px] text-[var(--d-text-2)]">{description}</p>
        {meta ? <p className="mt-1.5 text-[12px] text-[var(--d-text-3)]">{meta}</p> : null}
      </div>
      {action ? <div className="self-start xl:self-auto">{action}</div> : null}
    </header>
  );
}
