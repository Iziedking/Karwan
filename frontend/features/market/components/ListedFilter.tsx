'use client';

import { useId, useState } from 'react';
import { buttonClasses } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { LISTED, MARKET_ORDERS, type Listed, type MarketOrder } from '../listedWindow';

/// The market's Listed button (view 96, Figma "Listed button"): when something
/// was listed and in what order. Once set, the button reads the choice. It
/// opens a sheet with the two choices, Clear and Show results.
export function ListedFilter({ listed, order, onChange }: {
  listed: Listed;
  order: MarketOrder;
  onChange: (next: { listed: Listed; order: MarketOrder }) => void;
}) {
  const t = useLocale().t.marketShop.listed;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ listed, order });
  const listedLabel: Record<Listed, string> = { any: t.any, '1h': t.hour, today: t.today, week: t.week, month: t.month };
  const orderLabel: Record<MarketOrder, string> = { newest: t.newest, oldest: t.oldest, closing: t.closing };
  const set = listed !== 'any' || order !== 'newest';
  const label = set
    ? [listed !== 'any' ? listedLabel[listed] : null, order !== 'newest' ? orderLabel[order] : null].filter(Boolean).join(' · ')
    : t.button;

  const openSheet = () => { setDraft({ listed, order }); setOpen(true); };
  const apply = (next: { listed: Listed; order: MarketOrder }) => { onChange(next); setOpen(false); };

  return (
    <>
      <button
        type="button"
        data-listed-filter
        aria-haspopup="dialog"
        aria-label={set ? `${t.button}: ${label}` : t.button}
        onClick={openSheet}
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border ps-3.5 pe-3 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]',
          set ? 'border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--ink-secondary)]',
        )}
      >
        <Icon name="clock" size={16} />
        <span>{label}</span>
        <Icon name="chevron-down" size={16} />
      </button>
      <ConfirmSheetShell open={open} labelledBy={`${id}-title`} busy={false} onClose={() => setOpen(false)}>
        <div className="p-5 sm:p-6" data-listed-sheet>
          <fieldset>
            <legend id={`${id}-title`} className="text-[17px] font-semibold text-[var(--ink)]">{t.title}</legend>
            <div className="mt-2">
              {LISTED.map((value) => (
                <Choice key={value} name={`${id}-listed`} label={listedLabel[value]} checked={draft.listed === value} onPick={() => setDraft((d) => ({ ...d, listed: value }))} />
              ))}
            </div>
          </fieldset>
          <div className="my-3 h-px bg-[var(--line)]" />
          <fieldset>
            <legend className="text-[17px] font-semibold text-[var(--ink)]">{t.order}</legend>
            <div className="mt-2">
              {MARKET_ORDERS.map((value) => (
                <Choice key={value} name={`${id}-order`} label={orderLabel[value]} checked={draft.order === value} onPick={() => setDraft((d) => ({ ...d, order: value }))} />
              ))}
            </div>
          </fieldset>
          <div className="mt-5 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => apply({ listed: 'any', order: 'newest' })}
              className="inline-flex min-h-11 items-center px-1 text-[15px] font-semibold text-[var(--ink)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
            >
              {t.reset}
            </button>
            <button type="button" onClick={() => apply(draft)} className={buttonClasses({ variant: 'primary' })}>
              {t.show}
            </button>
          </div>
        </div>
      </ConfirmSheetShell>
    </>
  );
}

function Choice({ name, label, checked, onPick }: { name: string; label: string; checked: boolean; onPick: () => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-[16px] font-medium text-[var(--ink)]">
      <span>{label}</span>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onPick}
        className="size-[22px] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-[var(--line-strong)] bg-[var(--surface)] checked:border-[7px] checked:border-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      />
    </label>
  );
}
