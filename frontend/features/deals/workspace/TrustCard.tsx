'use client';
import type { TrustCardView } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, formatUsdcAmount, trustFactParts } from './presentation';

export function TrustCard({ card, onOpenPassport }: { card: TrustCardView; onOpenPassport: () => void }) {
  const copy = useTranslations().dealWorkspace;
  const { locale } = useLocale();
  const roleLabel = card.role === 'seller' ? copy.trust.asSeller : copy.trust.asBuyer;
  return (
    <section aria-labelledby="deal-trust" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="deal-trust" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.trust.title}</h2>
        <span className="text-[13px] text-[var(--lp-text-sub)]">{roleLabel}</span>
      </div>
      {card.name ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={onOpenPassport} className="inline-flex min-h-11 items-center text-[17px] font-semibold text-[var(--lp-dark)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2">
            {card.name}
          </button>
          {card.verifiedBusiness ? <span className="text-[13px] font-medium text-[var(--color-positive)]"><span aria-hidden>✓</span> {copy.trust.verifiedBusiness}</span> : null}
          {card.verifiedPerson ? (
            <span className="text-[13px] font-medium text-[var(--color-positive)]">
              <span aria-hidden>✓</span> {copy.trust.verifiedPerson}
              <span className="sr-only">. {copy.trust.verifiedPersonDetail}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      {card.isNew ? (
        <p className="text-[14px] text-[var(--lp-text-sub)]">{copy.trust.newAccount}</p>
      ) : (
        <p className="text-[14px] tabular-nums text-[var(--lp-dark)]">{trustFactParts(card, copy, locale).join(' · ')}</p>
      )}
      {card.stakeUsdc ? (
        <p className="text-[14px] tabular-nums text-[var(--lp-dark)]">{fill(copy.trust.stakeTemplate, { amount: formatUsdcAmount(card.stakeUsdc, locale) })}</p>
      ) : null}
      {card.provenAccounts.length > 0 ? (
        <p className="text-[13px] text-[var(--lp-text-sub)]">
          {copy.trust.proven}: {card.provenAccounts.map((account, i) => (
            <span key={i}>
              {account === 'x' ? 'X' : account}<span aria-hidden> ✓</span>
              {i < card.provenAccounts.length - 1 && '  '}
            </span>
          ))}
        </p>
      ) : null}
      <p className="text-[13px] text-[var(--lp-text-sub)]">{copy.trust.notChecked}</p>
    </section>
  );
}
