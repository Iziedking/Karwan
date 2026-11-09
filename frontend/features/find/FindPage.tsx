'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { PriceIn } from '@/features/money/components/Price';
import { buttonClasses } from '@/shared/components/Button';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { findPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { endsText, titleOf } from './foundModel';
import { PeopleList, PersonSheet } from './FoundPeople';

export const findKey = (id: string) => ['find', id] as const;

/// One find (view 72): the people the agent found, best first. Private to
/// the person who asked; a tap opens the person.
export function FindPage({ id }: { id: string }) {
  const { locale } = useLocale();
  const t = findPeopleCopy[locale as keyof typeof findPeopleCopy] ?? findPeopleCopy.en;
  const find = useQuery({ queryKey: findKey(id), queryFn: () => api.findView(id).then((r) => r.find), staleTime: 30_000, retry: 1 });
  const [open, setOpen] = useState<number | null>(null);
  const f = find.data;

  return (
    <div data-find-page className="mx-auto w-full max-w-[560px] px-6 pb-16 pt-3">
      {find.isPending ? (
        <p role="status" className="mt-8 text-[15px] text-[var(--ink-secondary)]">{t.loading}</p>
      ) : !f ? (
        <div className="mt-8">
          <p className="text-[15px] text-[var(--ink-secondary)]">{find.error && !/not found|404/i.test(String(find.error)) ? t.failed : t.notFound}</p>
          {find.error && !/not found|404/i.test(String(find.error)) ? (
            <button type="button" onClick={() => void find.refetch()} className={buttonClasses({ variant: 'secondary', size: 'md', className: 'mt-4' })}>{t.retry}</button>
          ) : null}
        </div>
      ) : (
        <>
          <header className="mt-2">
            <p className="text-[13px] text-[var(--ink-muted)]">{t.privateToYou} · {endsText(f, t, locale)}</p>
            <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{titleOf(f, t)}</h1>
            <p className="mt-1.5 text-[13px] text-[var(--ink-secondary)]">
              <span className="text-[var(--ink)]">{f.need}</span> · <PriceIn template={t.about} usdc={Number(f.budgetUsdc)} /> · {t.kinds[f.kind]}
            </p>
          </header>
          <div className="mt-5">
            <PeopleList people={f.rows} t={t} onOpen={setOpen} />
          </div>
          <PersonSheet person={open !== null ? (f.rows[open] ?? null) : null} t={t} onClose={() => setOpen(null)} />
        </>
      )}
    </div>
  );
}
