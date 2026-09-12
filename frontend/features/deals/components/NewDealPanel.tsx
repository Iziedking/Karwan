'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BriefComposer } from '@/features/buyer/components/BriefComposer';
import { ActivationGate } from '@/shared/components/ActivationGate';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DirectDealComposer } from './DirectDealComposer';

type Mode = 'managed' | 'direct';

export function NewDealPanel() {
  const a11y = useTranslations().a11y;
  const t = useTranslations().dealPanel;
  const c = useTranslations().dealCreation;
  const MODES: Array<{ value: Mode; label: string; blurb: string }> = [
    { value: 'managed', label: t.managedLabel, blurb: c.requestNext },
    { value: 'direct', label: t.directLabel, blurb: c.directFlow },
  ];
  // When the user arrives here via a "Make offer" link from a listing detail
  // page (/buyer?seller=0x...&amount=...&terms=...), default to the direct
  // mode so the pre-filled fields are visible without a tab click. ?mode=direct
  // does the same without a counterparty, which is what a "Direct deal" call to
  // action links to.
  const search = useSearchParams();
  const initialMode: Mode =
    search.get('seller') || search.get('sellerEmail') || search.get('mode') === 'direct' ? 'direct' : 'managed';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [visited, setVisited] = useState<Record<Mode, boolean>>({ managed: initialMode === 'managed', direct: initialMode === 'direct' });
  const active = MODES.find((m) => m.value === mode)!;

  return (
    <div className="space-y-7" id="deal-composer">
      <div>
        <div
          role="group"
          aria-label={a11y.dealType}
          className="grid grid-cols-2 gap-1 p-1"
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
                aria-pressed={isActive}
                onClick={() => { setMode(m.value); setVisited(previous => ({ ...previous, [m.value]: true })); }}
                className="min-h-11 px-4 py-2 text-[14px] font-semibold transition-[background-color,color,box-shadow] duration-200"
                style={{
                  background: isActive ? 'var(--lp-control-active-bg)' : 'transparent',
                  color: isActive ? 'var(--lp-control-active-ink)' : 'var(--lp-text-sub)',
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
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[64ch]">
          {active.blurb}
        </p>
      </div>

      <ActivationGate>
        {visited.managed ? <div hidden={mode !== 'managed'}><BriefComposer /></div> : null}
        {visited.direct ? <div hidden={mode !== 'direct'}><DirectDealComposer /></div> : null}
      </ActivationGate>
    </div>
  );
}
