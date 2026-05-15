'use client';
import { useState } from 'react';
import { PostJobForm } from '@/features/buyer/components/PostJobForm';
import { ActivationGate } from '@/shared/components/ActivationGate';
import { DirectDealForm } from './DirectDealForm';

type Mode = 'managed' | 'direct';

const MODES: Array<{ value: Mode; label: string; blurb: string }> = [
  {
    value: 'managed',
    label: 'Find me a seller',
    blurb:
      'Post a brief. Your agent runs the auction. You wake up to a settled deal.',
  },
  {
    value: 'direct',
    label: 'I have a seller',
    blurb:
      'You already agreed with a counterparty. Open an escrow naming their wallet, skip the auction.',
  },
];

export function NewDealPanel() {
  const [mode, setMode] = useState<Mode>('managed');
  const active = MODES.find((m) => m.value === mode)!;

  return (
    <div className="space-y-7">
      <div>
        <div
          className="inline-flex p-1 gap-1"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          {MODES.map((m) => {
            const isActive = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className="px-4 py-2 mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-[background-color,color,box-shadow] duration-200"
                style={{
                  background: isActive ? 'var(--lp-dark)' : 'transparent',
                  color: isActive ? 'var(--lp-accent)' : 'var(--lp-text-sub)',
                  borderTopLeftRadius: 9,
                  borderTopRightRadius: 9,
                  borderBottomLeftRadius: 9,
                  borderBottomRightRadius: 2,
                  boxShadow: isActive ? '0 2px 0 rgba(0,0,0,0.18)' : 'none',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          {active.blurb}
        </p>
      </div>

      <ActivationGate>
        {mode === 'managed' ? <PostJobForm /> : <DirectDealForm />}
      </ActivationGate>
    </div>
  );
}
