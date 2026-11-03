import React, { type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export interface Fact {
  label: ReactNode;
  value: ReactNode;
  /// A stable key when the label is not plain text.
  id?: string;
}

/// Label on the start side, value on the end side, a hairline between rows
/// (Figma Row/Fact). Inside a card, wrap it in `px-5 py-1`. Facts only: no
/// helper line under a row.
export function FactRows({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-[var(--line)]', className)} data-fact-rows>
      {facts.map((fact, i) => (
        <div key={fact.id ?? (typeof fact.label === 'string' ? fact.label : i)} className="flex items-baseline justify-between gap-4 py-3 text-[13px] leading-[1.4]">
          <dt className="shrink-0 text-[var(--ink-secondary)]">{fact.label}</dt>
          <dd className="min-w-0 text-end font-medium text-[var(--ink)] [overflow-wrap:anywhere]">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
