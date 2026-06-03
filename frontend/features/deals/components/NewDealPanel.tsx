'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PostJobForm } from '@/features/buyer/components/PostJobForm';
import { ActivationGate } from '@/shared/components/ActivationGate';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DirectDealForm } from './DirectDealForm';

type Mode = 'managed' | 'direct';

export function NewDealPanel() {
  const t = useTranslations().dealPanel;
  const MODES: Array<{ value: Mode; label: string; blurb: string }> = [
    { value: 'managed', label: t.managedLabel, blurb: t.managedBlurb },
    { value: 'direct', label: t.directLabel, blurb: t.directBlurb },
  ];
  // When the user arrives here via a "Make offer" link from a listing detail
  // page (/buyer?seller=0x...&amount=...&terms=...), default to the direct
  // mode so the pre-filled fields are visible without a tab click.
  const search = useSearchParams();
  const initialMode: Mode = search.get('seller') ? 'direct' : 'managed';
  const [mode, setMode] = useState<Mode>(initialMode);
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
