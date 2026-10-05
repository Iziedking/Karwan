'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useReputation } from '../hooks/useReputation';
import { reasonLabels } from '../sealed';
import { TIER_HUE, TIER_LABEL } from '../tierColors';
import { CreditPassport } from './CreditPassport';

export function PublicPassport({ address }: { address: string }) {
  const t = useTranslations();
  const sr = t.sealedRecord;
  const { locale } = useLocale();
  const { data, sealed, fetchState } = useReputation(address);

  // Records not sealed on this backend yet: show the existing passport.
  if (data) return <CreditPassport address={address} />;
  if (fetchState === 'error') {
    return <p className="mx-auto max-w-[720px] px-4 py-10 text-[15px] text-[var(--lp-text-sub)]">{sr.unavailable}</p>;
  }
  if (!sealed) return <div aria-busy className="mx-auto max-w-[720px] px-4 py-10" />;

  const name = sealed.displayName || (sealed.tag ? `@${sealed.tag}` : sr.unnamed);
  const since = sealed.memberSince
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(sealed.memberSince))
    : null;

  return (
    <article className="mx-auto max-w-[720px] px-4 py-10">
      <h1 className="text-[28px] font-semibold text-[var(--lp-dark)]">{name}</h1>
      {sealed.tag && sealed.displayName ? (
        <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">@{sealed.tag}</p>
      ) : null}
      <p className="mt-4 inline-flex items-center gap-2 text-[15px] font-medium text-[var(--lp-dark)]">
        <span aria-hidden className="size-2 rounded-full" style={{ background: TIER_HUE[sealed.tier] }} />
        <span className="text-[var(--lp-text-sub)]">{sr.tier}</span> {TIER_LABEL[sealed.tier]}
      </p>
      <section aria-labelledby="passport-record" className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
        <h2 id="passport-record" className="text-[17px] font-semibold text-[var(--lp-dark)]">{sr.record}</h2>
        <ul className="mt-3 divide-y divide-[var(--lp-border-light)]">
          {reasonLabels(sealed.reasons, sr).map((label) => (
            <li key={label} className="py-3 text-[15px] text-[var(--lp-dark)]">{label}</li>
          ))}
        </ul>
        {since ? <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{t.passport.since.replace('{date}', since)}</p> : null}
      </section>
      <div className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
        <Link
          href={`/buyer?seller=${address}`}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-6 text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          {sr.startDeal}
        </Link>
        <p className="mt-4 text-[13px] text-[var(--lp-text-sub)]">{sr.noNumbers}</p>
      </div>
    </article>
  );
}
