'use client';
import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Band, FullBleed } from '@/shared/components/Bands';
import { Icon } from '@/shared/components/Icon';

/// What /financier shows until NEXT_PUBLIC_SME_TRADES_ENABLED is set: what is
/// coming, said plainly, and one way on to the written plan. No desk link,
/// because there is no desk yet.
export function SmeTradesComingSoon() {
  const t = useTranslations().financeSoon;
  const rows = [
    { title: t.factoringTitle, body: t.factoringBody },
    { title: t.poTitle, body: t.poBody },
  ];
  return (
    <div className="product-surface">
      <FullBleed>
        <Band tone="light" compact>
          <div className="max-w-[640px] pt-2 sm:pt-3">
            <h1 className="text-[36px] font-medium leading-[1.1] tracking-[-0.015em] text-[var(--ink)] sm:text-[40px]">
              {t.title}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-secondary)] font-medium">{t.when}</p>

            <ul className="mt-6 divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
              {rows.map((row) => (
                <li key={row.title} className="px-4 py-4">
                  <h2 className="text-[15px] font-semibold text-[var(--lp-dark)]">{row.title}</h2>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{row.body}</p>
                </li>
              ))}
            </ul>

            <Link
              href="/docs/roadmap"
              className="mt-6 inline-flex min-h-12 items-center gap-1.5 rounded-full bg-[var(--tint)] px-5 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--tint)_92%,var(--ink))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
            >
              {t.roadmap}
              <Icon name="chevron-right" size={16} directional className="shrink-0" />
            </Link>
          </div>
        </Band>
      </FullBleed>
    </div>
  );
}
