'use client';

import { Hint } from '@/shared/components/Hint';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { guideCopy } from '@/shared/i18n/messages/guide';
import { useGuideSetting } from '@/features/guide/useGuideSetting';

/// Show the guide on pages (view 57). On puts Aman beside the page; off leaves
/// it to the menu and Ctrl+K. An account on "a small face in the top bar" reads
/// as on, with that choice said under it.
export function GuideSwitchRow() {
  const { locale } = useLocale();
  const copy = guideCopy[locale];
  const { guide, set } = useGuideSetting();
  const on = guide !== 'off';
  return (
    <div className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-start text-[15px]">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium text-[var(--ink)]">
          {copy.showGuide}
          <Hint>{copy.showGuideInfo}</Hint>
        </span>
        {guide === 'face' ? <span className="block text-[14px] font-medium text-[var(--ink-secondary)]">{copy.menu.hideSub}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={copy.showGuide}
        data-guide-switch
        onClick={() => void set(on ? 'off' : 'on')}
        className="relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2"
        style={{ background: on ? 'var(--karwan-green)' : 'var(--color-line-strong)' }}
      >
        <span aria-hidden className="absolute top-0.5 size-5 rounded-full bg-[var(--canvas)] shadow-sm transition-[inset-inline-start] duration-200 motion-reduce:transition-none" style={{ insetInlineStart: on ? 22 : 2 }} />
      </button>
    </div>
  );
}
