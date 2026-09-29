'use client';
import { useCallback, useEffect, useId, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { Button } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { budgetDifference, offerErrorKey, orderOffers, type Offer } from '../model';

function sellerName(address: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function shortDate(unix: number, locale: string): string {
  return new Date(unix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/// The offers sellers sent on the buyer's own request, cheapest first. Renders
/// nothing until there is at least one, so a request without offers looks as
/// it always did.
export function BuyerOffers({ jobId, budgetUsdc }: { jobId: string; budgetUsdc: string }) {
  const t = useTranslations().offers;
  const { locale } = useLocale();
  const auth = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [chosen, setChosen] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof offerErrorKey> | null>(null);
  const [accepted, setAccepted] = useState(false);
  const titleId = useId();

  const load = useCallback(async () => {
    try {
      const view = await api.offers(jobId);
      setOffers(view.role === 'buyer' ? orderOffers(view.offers) : []);
    } catch {
      setOffers([]);
    }
  }, [jobId]);

  useEffect(() => {
    if (auth.isLoading) return;
    void load();
  }, [load, auth.isLoading, auth.address]);

  if (accepted) {
    return (
      <section className="mx-auto w-full max-w-[720px] px-4 pt-8">
        <p role="status" className="rounded-[20px] bg-[var(--lp-card)] p-6 text-[16px] text-[var(--lp-dark)]">
          {t.accepted}
        </p>
      </section>
    );
  }
  if (offers.length === 0) return null;

  async function accept(offer: Offer) {
    setBusy(true);
    setError(null);
    try {
      await api.acceptOffer(jobId, offer.id);
      setChosen(null);
      setAccepted(true);
    } catch (err) {
      setError(offerErrorKey(err instanceof ApiError ? err.code ?? '' : ''));
    } finally {
      setBusy(false);
    }
  }

  const top = offers[0]!;
  const diff = chosen ? budgetDifference(chosen.priceUsdc, budgetUsdc) : null;

  return (
    <section aria-labelledby={`${titleId}-list`} className="mx-auto w-full max-w-[720px] px-4 pt-8">
      <h2 id={`${titleId}-list`} className="text-[28px] font-medium text-[var(--lp-dark)]">
        {offers.length === 1 ? t.countOne : t.listTitle.replace('{n}', String(offers.length))}
      </h2>
      <ul className="mt-5 space-y-3">
        {offers.map((offer) => (
          <li key={offer.id} className="rounded-[20px] bg-[var(--lp-card)] p-6">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[16px] font-medium text-[var(--lp-dark)]">{sellerName(offer.sellerUser)}</span>
                {/^0x[a-fA-F0-9]{40}$/.test(offer.sellerUser) ? <ReputationBadge address={offer.sellerUser} size="sm" /> : null}
              </span>
              <span className="shrink-0 text-[16px] font-medium tabular-nums text-[var(--lp-dark)]">
                {formatUsdc(offer.priceUsdc)}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[var(--lp-text-sub)]">
              {t.deliverByOn.replace('{date}', shortDate(offer.deliverByUnix, locale))}
            </p>
            {offer.note ? <p dir="auto" className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{offer.note}</p> : null}
            {offer.id !== top.id ? (
              <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => setChosen(offer)}>
                {t.acceptShort}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <Button size="lg" className="mt-5 w-full rounded-full" onClick={() => setChosen(top)}>
        {t.accept.replace('{seller}', sellerName(top.sellerUser)).replace('{price}', formatUsdc(top.priceUsdc, { withSuffix: false }))}
      </Button>
      <p className="mt-3 text-center text-[13px] text-[var(--lp-text-sub)]">{t.agentLine}</p>

      <ConfirmSheetShell open={!!chosen} labelledBy={titleId} busy={busy} onClose={() => { setChosen(null); setError(null); }}>
        {chosen ? (
          <div className="space-y-5">
            <h2 id={titleId} className="text-[22px] font-medium text-[var(--lp-dark)]">
              {t.confirmTitle}
            </h2>
            {/* The amount that leaves the wallet, fee included, is the loudest number. */}
            <p className="text-[36px] font-medium leading-none tabular-nums text-[var(--lp-dark)]">
              {formatUsdc(chosen.fundedUsdc ?? chosen.priceUsdc)}
            </p>
            {chosen.fundedUsdc && chosen.fundedUsdc !== chosen.priceUsdc ? (
              <p className="text-[14px] tabular-nums text-[var(--lp-text-sub)]">
                {t.includesFee.replace('{price}', formatUsdc(chosen.priceUsdc, { withSuffix: false }))}
              </p>
            ) : null}
            <p className="text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
              {t.confirmBody.replace('{price}', formatUsdc(chosen.fundedUsdc ?? chosen.priceUsdc, { withSuffix: false }))}
            </p>
            {diff ? <p className="text-[14px] text-[var(--color-warning)]">{t.aboveBudget.replace('{diff}', diff)}</p> : null}
            {error ? (
              <p role="alert" className="text-[14px] text-[var(--color-critical)]">
                {t.errors[error]}
              </p>
            ) : null}
            <Button size="lg" className="w-full rounded-full" loading={busy} onClick={() => void accept(chosen)}>
              {t.accept.replace('{seller}', sellerName(chosen.sellerUser)).replace('{price}', formatUsdc(chosen.priceUsdc, { withSuffix: false }))}
            </Button>
            <Button variant="ghost" className="w-full rounded-full" disabled={busy} onClick={() => { setChosen(null); setError(null); }}>
              {t.cancel}
            </Button>
          </div>
        ) : null}
      </ConfirmSheetShell>
    </section>
  );
}
