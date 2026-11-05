'use client';
import { useId } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export type WhoCanSeeChoice = 'market' | 'agents' | 'link';

/// Who can see what you post (view 53): everyone on the market, only agents,
/// or just one person you already agreed with (a deal, nothing posted).
export function WhoCanSee({
  side,
  value,
  onChange,
}: {
  side: 'request' | 'offer';
  value: WhoCanSeeChoice;
  onChange: (next: WhoCanSeeChoice) => void;
}) {
  const t = useTranslations().marketShop.whoCanSee;
  const name = useId();
  const options: Array<{ id: WhoCanSeeChoice; label: string; hint: string }> = [
    { id: 'market', label: t.market, hint: side === 'request' ? t.marketRequest : t.marketOffer },
    { id: 'agents', label: t.agents, hint: side === 'request' ? t.agentsRequest : t.agentsOffer },
    { id: 'link', label: t.link, hint: side === 'request' ? t.linkRequest : t.linkOffer },
  ];
  return (
    <fieldset data-who-can-see={value}>
      <legend className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.label}</legend>
      <div className="mt-2 divide-y divide-[var(--lp-border-light)] rounded-[16px] border border-[var(--lp-border-light)]">
        {options.map((o) => (
          <label key={o.id} className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3">
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-[var(--lp-dark)]">{o.label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-[var(--lp-text-sub)]">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/// What the choice sends to the server: nothing for the market (the default).
export function visibilityOf(choice: WhoCanSeeChoice): { visibility?: 'agents' } {
  return choice === 'agents' ? { visibility: 'agents' } : {};
}
