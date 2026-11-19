'use client';

import { useLocale } from '@/shared/i18n/LocaleProvider';
import { guideCopy } from '@/shared/i18n/messages/guide';
import { useGuideSetting } from '@/features/guide/useGuideSetting';
import { SwitchTrack } from '@/features/profile/ui/ProfileUi';

/// Aman's help on pages (view 57, 19 Nov). On: Aman explains a part of a page
/// now and then. Off keeps the face in the header, which still opens the
/// assistant. An account that turned the face off too reads as off here.
export function GuideSwitchRow() {
  const { locale } = useLocale();
  const copy = guideCopy[locale].guides;
  const { guide, set, loaded } = useGuideSetting();
  const on = guide === 'on';
  return (
    <div data-guide="settings-guide" className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-start text-[15px]">
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--ink)]">{copy.helpRow}</span>
        {loaded && !on ? <span data-guide-off-note className="block text-[14px] font-medium text-[var(--ink-secondary)]">{copy.helpOffNote}</span> : null}
      </span>
      {!loaded ? <span aria-busy="true"><SwitchTrack checked={false} pending /></span> : <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={copy.helpRow}
        data-guide-switch
        onClick={() => void set(on ? 'face' : 'on')}
        className="relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2"
        style={{ background: on ? 'var(--karwan-green)' : 'var(--color-line-strong)' }}
      >
        <span aria-hidden className="absolute top-0.5 size-5 rounded-full bg-[var(--canvas)] shadow-sm transition-[inset-inline-start] duration-200 motion-reduce:transition-none" style={{ insetInlineStart: on ? 22 : 2 }} />
      </button>}
    </div>
  );
}
