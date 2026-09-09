'use client';

import type { ReactNode } from 'react';

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/10 pb-7 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-[760px]">
        <p className="mono text-[9px] font-bold uppercase tracking-[0.17em] text-[#AFC95B]">[:{eyebrow}:]</p>
        <h1 className="mt-3 font-sans text-[clamp(28px,4vw,46px)] font-black leading-none tracking-[-0.04em]">{title}</h1>
        <p className="mt-4 max-w-[68ch] text-[13px] leading-6 text-white/48">{description}</p>
        {meta ? <p className="mt-3 mono text-[9px] uppercase tracking-[0.14em] text-white/28">{meta}</p> : null}
      </div>
      {action ? <div className="self-start xl:self-auto">{action}</div> : null}
    </header>
  );
}
