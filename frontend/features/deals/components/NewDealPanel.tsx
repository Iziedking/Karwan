'use client';
import { useState } from 'react';
import { PostJobForm } from '@/features/buyer/components/PostJobForm';
import { DirectDealForm } from './DirectDealForm';

type Mode = 'managed' | 'direct';

const MODES: Array<{ value: Mode; label: string; blurb: string }> = [
  {
    value: 'managed',
    label: 'Find me a seller',
    blurb: 'Post a brief. Your agent runs the auction and negotiation, you wake up to a settled deal.',
  },
  {
    value: 'direct',
    label: 'I have a seller',
    blurb: 'You already agreed with a counterparty. Open an escrow naming their wallet, skip the auction.',
  },
];

export function NewDealPanel() {
  const [mode, setMode] = useState<Mode>('managed');
  const active = MODES.find((m) => m.value === mode)!;

  return (
    <div>
      <div className="grid grid-cols-2 rounded-lg p-1 gap-1 bg-[var(--color-surface-2)] border border-[var(--color-line)] mb-4">
        {MODES.map((m) => {
          const isActive = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`rounded-md px-3 py-2 text-left transition-all ${
                isActive
                  ? 'bg-[var(--color-surface)] shadow-[var(--shadow-card)]'
                  : 'hover:bg-[var(--color-surface)]/60'
              }`}
            >
              <span
                className={`text-[13px] font-semibold tracking-tight ${
                  isActive ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-dim)]'
                }`}
              >
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] text-[var(--color-ink-dim)] leading-relaxed mb-5">{active.blurb}</p>

      {mode === 'managed' ? <PostJobForm /> : <DirectDealForm />}
    </div>
  );
}
