'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { buttonClasses } from '@/shared/components/Button';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { findPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { findKey } from './FindPage';
import { BuyersCard } from './BuyersCard';
import { fillFind } from './foundModel';
import { PersonRow, PersonSheet, PhotoStack } from './FoundPeople';

/// The people a find turned up, as a card in the assistant (view 72): who
/// fits best, a stack of the others' photos, and the whole list one tap away.
export function FindCard({ id, href, onNavigate }: { id: string; href: string; onNavigate: () => void }) {
  const { locale } = useLocale();
  const t = findPeopleCopy[locale as keyof typeof findPeopleCopy] ?? findPeopleCopy.en;
  const router = useRouter();
  const find = useQuery({ queryKey: findKey(id), queryFn: () => api.findView(id).then((r) => r.find), staleTime: 30_000, retry: 1 });
  const [open, setOpen] = useState(false);
  const go = () => {
    onNavigate();
    router.push(href);
  };
  const f = find.data;
  const n = f?.rows.length ?? 0;
  const best = f?.rows[0] ?? null;

  return (
    <section data-find-card className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-1">
      {!f ? (
        <div className="flex items-center justify-between gap-3 px-3.5 py-3.5">
          <p className="text-[14px] text-[var(--ink-secondary)]">{find.isPending ? t.loading : t.failed}</p>
          <button type="button" onClick={go} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t.seeOne}</button>
        </div>
      ) : f.side === 'seller' ? (
        <BuyersCard find={f} t={t} onOpen={go} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 px-3.5 pb-1.5 pt-3.5">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{f.need}</p>
              <p className="mt-0.5 text-[13px] text-[var(--ink-secondary)]">{n === 1 ? t.cardFoundOne : fillFind(t.cardFound, { n })}</p>
            </div>
            {n > 1 ? <PhotoStack people={f.rows.slice(0, 4)} size={28} ring="ring-[var(--surface)]" /> : null}
          </div>
          {best ? <PersonRow person={best} index={0} t={t} onOpen={() => setOpen(true)} /> : null}
          <div className="px-2.5 pb-2.5 pt-1">
            <button type="button" onClick={go} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>
              {n === 1 ? t.seeOne : fillFind(t.seeAll, { n })}
            </button>
          </div>
          <PersonSheet person={open ? best : null} t={t} onClose={() => setOpen(false)} />
        </>
      )}
    </section>
  );
}
