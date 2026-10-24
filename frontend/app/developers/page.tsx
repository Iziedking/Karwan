'use client';

import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DocsP } from '@/features/docs/components/Prose';
import { PageTitle } from '@/features/developers/components/RecordSourcePages';
import { DEV_GROUPS, devHref, devPageLabel } from '@/features/developers/sections';

/// The front page of the developer docs: what can be built on Karwan today,
/// each group with its pages.
export default function DevelopersPage() {
  const m = useTranslations();
  const t = m.developers.nav;
  return (
    <>
      <PageTitle eyebrow={t.groups.start} title={t.overviewTitle} />
      <DocsP>{t.overviewIntro}</DocsP>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {DEV_GROUPS.filter((g) => g.key !== 'start').map((group) => (
          <section key={group.key} className="rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
            <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.groups[group.key]}</h2>
            <ul className="mt-3 flex flex-col">
              {group.pages.map((slug) => (
                <li key={slug}>
                  <Link href={devHref(slug)} className="flex min-h-11 items-center justify-between gap-3 border-t border-[var(--lp-border-light)] text-[15px] font-medium text-[var(--lp-dark)] hover:text-[var(--lp-text-sub)]">
                    {devPageLabel(m, slug)}
                    <span aria-hidden className="rtl-flip text-[var(--lp-text-sub)]">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
