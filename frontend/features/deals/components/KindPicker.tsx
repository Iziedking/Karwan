'use client';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { KindChoice } from '../kindChoices';

/// How do you want to pay? (view 44, K1): one list in two groups, only the
/// kinds that run today.
export function KindPicker({ choices, onPick, withWho }: { choices: { work: KindChoice[]; goods: KindChoice[] }; onPick: (kind: KindChoice) => void; withWho?: string }) {
  const t = useTranslations().requestFlow;
  const group = (label: string, kinds: KindChoice[]) => (
    <section aria-label={label}>
      <h2 className="text-[14px] font-semibold text-[var(--ink-secondary)]">{label}</h2>
      <ul className="mt-2 overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
        {kinds.map((kind) => (
          <li key={kind} className="border-b border-[var(--line)] last:border-b-0">
            <button
              type="button"
              onClick={() => onPick(kind)}
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-[var(--ink)]">{t.kinds[kind]}</span>
                <span className="mt-0.5 block text-[14px] text-[var(--ink-secondary)]">{t.kindLines[kind]}</span>
              </span>
              <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--ink-secondary)]" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div data-kind-picker className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{t.kindTitle}</h1>
        {/* A deal link names its person; every kind picked from here starts with them. */}
        {withWho ? <p data-kind-with className="mt-1 text-[15px] font-medium text-[var(--ink-secondary)]">{t.kindWith.replace('{who}', withWho)}</p> : null}
      </div>
      {group(t.forWork, choices.work)}
      {group(t.forGoods, choices.goods)}
    </div>
  );
}
