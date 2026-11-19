'use client';
import type { ReactNode } from 'react';
import type { DirectDeal } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { DealRoute } from '../DealRoute';
import { pictureFor } from './kindPictureModel';
import { fill, formatDealDate } from './presentation';

/// What sits under the title block for each kind of deal (view 92). Goods sent
/// read like a parcel tracker and one job shows the delivery itself; every other
/// kind keeps the plain steps until its own picture is built. The steps stay at
/// the top of every picture, and moves stay in the move bar.
export function KindPicture({ deal, viewerIsBuyer, name }: { deal: DirectDeal; viewerIsBuyer: boolean; name: string }) {
  const messages = useTranslations();
  const t = messages.dealPage.picture;
  const dc = messages.deliveryCard;
  const { locale } = useLocale();
  const date = (ms: number) => formatDealDate(ms, locale);
  const picture = pictureFor(deal, viewerIsBuyer);

  if (picture.kind === 'steps') {
    return <div data-picture="steps"><DealRoute deal={deal} vertical /></div>;
  }

  const lines: ReactNode[] = [];
  const line = (key: string, text: string) => lines.push(<p key={key} className="text-[14px] text-[var(--ink-secondary)]">{text}</p>);

  if (picture.kind === 'parcel') {
    if (picture.hint === 'waitShip') line('hint', fill(t.waitShip, { name }));
    if (picture.hint === 'addTracking' && picture.dueAt) line('hint', fill(t.addTracking, { date: date(picture.dueAt) }));
    if (picture.hint === 'tapArrived') line('hint', t.tapArrived);
    if (picture.hint === 'arrived' && picture.arrivedAt) line('hint', fill(dc.arrivedTemplate, { date: date(picture.arrivedAt) }));
    if (!viewerIsBuyer && picture.payAt && picture.hint !== 'addTracking') line('pay', fill(t.paidOn, { date: date(picture.payAt), name }));
    return (
      <div data-picture="parcel" className="space-y-4">
        <DealRoute deal={deal} />
        {picture.trackingNumber ? (
          <dl className="divide-y divide-[var(--line)] rounded-[14px] border border-[var(--line)] bg-[var(--raised)] px-4">
            {picture.carrierName ? (
              <div className="flex min-h-11 items-center justify-between gap-3 text-[14px]">
                <dt className="text-[var(--ink-secondary)]">{t.carrier}</dt>
                <dd className="font-medium text-[var(--ink)]">{picture.carrierName}</dd>
              </div>
            ) : null}
            <div data-tracking className="flex min-h-11 items-center justify-between gap-3 text-[14px]">
              <dt className="shrink-0 text-[var(--ink-secondary)]">{dc.trackingNumber}</dt>
              <dd className="min-w-0 text-end">
                {picture.trackingUrl ? (
                  <a
                    href={picture.trackingUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={dc.track}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] font-mono text-[13px] font-medium text-[var(--ink)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                  >
                    <span dir="ltr" className="truncate">{picture.trackingNumber}</span>
                    <Icon name="link" size={16} className="size-3.5 shrink-0" />
                  </a>
                ) : (
                  <span dir="ltr" className="block truncate font-mono text-[13px] font-medium text-[var(--ink)]">{picture.trackingNumber}</span>
                )}
              </dd>
            </div>
          </dl>
        ) : null}
        {lines.length ? <div className="space-y-1">{lines}</div> : null}
      </div>
    );
  }

  if (picture.hint === 'waitDelivery' && picture.dueAt) line('hint', fill(t.waitDelivery, { date: date(picture.dueAt) }));
  if (picture.hint === 'deliverBy' && picture.dueAt) line('hint', fill(t.deliverBy, { date: date(picture.dueAt) }));
  if (picture.hint === 'check') line('hint', fill(t.check, { name }));
  if (picture.hint === 'waitCheck') line('hint', fill(t.waitCheck, { name }));
  if (!viewerIsBuyer && picture.payAt) line('pay', fill(t.paidOn, { date: date(picture.payAt), name }));
  const first = picture.links[0];
  return (
    <div data-picture="delivery" className="space-y-4">
      <DealRoute deal={deal} />
      {picture.deliveredAt ? (
        <div data-delivered className="space-y-2 rounded-[14px] border border-[var(--line)] bg-[var(--raised)] p-4">
          {picture.held ? (
            <p className="text-[14px] font-medium text-[var(--ink)]">{dc.heldShort}</p>
          ) : first ? (
            <a
              href={first.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-11 items-center gap-3 rounded-[10px] text-[15px] font-medium text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--ash)] text-[var(--ink-secondary)]">
                <Icon name="file-text" size={20} />
              </span>
              <span className="min-w-0 flex-1 truncate">{fill(dc.openTemplate, { host: first.host })}</span>
              <Icon name="link" size={16} className="shrink-0 text-[var(--ink-secondary)]" />
            </a>
          ) : null}
          {!picture.held && picture.note ? <p dir="auto" className="line-clamp-2 text-[14px] text-[var(--ink-secondary)]">{picture.note}</p> : null}
          <p className="text-[13px] text-[var(--ink-muted)]">
            {fill(t.deliveredOn, { date: date(picture.deliveredAt) })}
            {picture.photos ? ` · ${fill(t.photos, { count: picture.photos })}` : ''}
          </p>
          {picture.verdict ? (
            <p data-verdict={picture.verdict} className="flex items-start gap-2 border-t border-[var(--line)] pt-3 text-[14px] text-[var(--ink)]">
              <Icon name="shield-check" size={16} className="mt-0.5 shrink-0 text-[var(--ink-secondary)]" />
              <span>{dc.match[picture.verdict]}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {lines.length ? <div className="space-y-1">{lines}</div> : null}
    </div>
  );
}
