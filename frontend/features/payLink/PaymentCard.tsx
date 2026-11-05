'use client';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { PersonRecord } from '@/shared/components/PersonRecord';
import { fill } from '@/features/deals/workspace/presentation';
import { PayLinkQr } from './ShareLink';

export type PaymentCardState = 'open' | 'paid' | 'expired' | 'cancelled';

/// The one object of a payment request (view 50): what the requester shares,
/// what the payer opens, and what reads Paid for both. One neutral card; the
/// amount is its loudest line.
export function PaymentCard({ recipient, amount, purpose, state, expiresAt, paidAt, url }: {
  recipient: string;
  amount: string | null;
  purpose?: string | null;
  state: PaymentCardState;
  expiresAt?: string | number | null;
  paidAt?: string | number | null;
  url?: string | null;
}) {
  const copy = useTranslations().payLink;
  const pay = copy.pay;
  const { locale } = useLocale();
  const day = (at: string | number) => new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const status = state === 'paid' ? pay.paidBadge : state === 'expired' ? copy.create.statusExpired : state === 'cancelled' ? copy.create.statusCancelled : null;
  const shortUrl = url ? url.replace(/^https?:\/\//, '') : null;

  return (
    <article data-payment-card={state} className="rounded-[24px] border border-[var(--line-strong)] bg-[var(--raised)] px-6 py-[22px]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold text-[var(--ink)]">Karwan</p>
        {status ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--ink)]">{status}</span>
        ) : (
          <p className="text-[13px] font-medium text-[var(--ink-secondary)]">{pay.tag}</p>
        )}
      </div>
      <div className="mt-[22px]">
        <PersonRecord address={recipient} size={40} />
      </div>
      <p dir="ltr" className="mt-[22px] flex items-baseline gap-2 text-start rtl:justify-end">
        <span className="text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--ink)]">{amount ?? '0'}</span>
        <span className="text-[19px] font-semibold text-[var(--ink-secondary)]">USDC</span>
      </p>
      {purpose ? <p className="mt-2 text-[15px] text-[var(--ink-secondary)]">{fill(pay.forTemplate, { purpose })}</p> : null}
      <div className="mt-5 border-t border-[var(--line)] pt-[18px]">
        {state === 'open' && url ? (
          <div className="flex items-center gap-4">
            <PayLinkQr value={url} label={copy.create.qrAlt} size={88} />
            <div className="min-w-0 space-y-1">
              <p className="text-[14px] font-medium text-[var(--ink)]">{pay.cardScan}</p>
              <p dir="ltr" className="truncate text-[13px] text-[var(--ink-secondary)]">{shortUrl}</p>
              {expiresAt ? <p className="text-[13px] text-[var(--ink-secondary)]">{fill(pay.expires, { date: day(expiresAt) })}</p> : null}
            </div>
          </div>
        ) : state === 'paid' ? (
          <p className="text-[14px] font-medium text-[var(--ink)]">{paidAt ? fill(pay.cardPaidOn, { date: day(paidAt) }) : pay.paidAlready}</p>
        ) : state === 'open' ? (
          <p className="text-[14px] text-[var(--ink-secondary)]">{expiresAt ? fill(pay.expires, { date: day(expiresAt) }) : pay.tag}</p>
        ) : (
          <p className="text-[14px] text-[var(--ink-secondary)]">{state === 'expired' ? pay.expired : pay.cancelled}</p>
        )}
      </div>
    </article>
  );
}
