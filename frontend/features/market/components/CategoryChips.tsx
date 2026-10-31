'use client';

import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { CATEGORY_IDS, type CategoryId } from '../marketModel';

/// The market's categories (Figma Category chip): All first, one picked at a
/// time. A row that scrolls sideways on a phone and wraps on a wide screen.
export function CategoryChips({
  value,
  onChange,
  withAll = true,
}: {
  value: CategoryId | 'all' | null;
  onChange: (next: CategoryId | 'all') => void;
  withAll?: boolean;
}) {
  const t = useLocale().t.marketShop;
  const ids: Array<CategoryId | 'all'> = withAll ? ['all', ...CATEGORY_IDS] : [...CATEGORY_IDS];
  return (
    <div role="group" aria-label={t.categoriesLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {ids.map((id) => {
        const pressed = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]',
              pressed
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]'
                : 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--ink)] hover:border-[var(--ink-secondary)]',
            )}
          >
            {id === 'all' ? t.all : t.categories[id]}
          </button>
        );
      })}
    </div>
  );
}
