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
  inline = false,
}: {
  value: CategoryId | 'all' | null;
  onChange: (next: CategoryId | 'all') => void;
  withAll?: boolean;
  /// Beside another control (view 96): the row scrolls inside its own box
  /// instead of running to the screen edge.
  inline?: boolean;
}) {
  const t = useLocale().t.marketShop;
  const ids: Array<CategoryId | 'all'> = withAll ? ['all', ...CATEGORY_IDS] : [...CATEGORY_IDS];
  return (
    <div role="group" aria-label={t.categoriesLabel} className={cn('flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden', inline ? '' : '-mx-4 px-4 sm:mx-0 sm:px-0')}>
      {ids.map((id) => {
        const pressed = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]',
              pressed
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--ink-secondary)]',
            )}
          >
            {id === 'all' ? t.all : t.categories[id]}
          </button>
        );
      })}
    </div>
  );
}
