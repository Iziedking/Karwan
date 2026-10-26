'use client';
import { useState } from 'react';
import { api, type DirectDeal } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { deliveryCard } from './deliveryCard';
import { fill, formatDealDate } from './presentation';

const outlineButton =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const heading = 'text-[13px] font-semibold text-[var(--lp-text-sub)]';

/// Delivery photos are served with the viewer's session, so each opens full size
/// in a new tab from the same link.
function PhotoRow({ urls, alt }: { urls: string[]; alt: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, index) => (
        <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-[12px] border border-[var(--lp-border-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <img src={url} alt={fill(alt, { n: index + 1 })} loading="lazy" className="size-20 object-cover" />
        </a>
      ))}
    </div>
  );
}

/// Everything delivered on the deal in one place: what to open, where the goods
/// are, what Karwan checked, and the deliveries before this one.
export function DeliveryCard({ deal, viewerIsBuyer, caller, onChanged }: {
  deal: DirectDeal;
  viewerIsBuyer: boolean;
  caller: string | null;
  onChanged: () => void;
}) {
  const t = useTranslations().deliveryCard;
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = deliveryCard(deal, viewerIsBuyer);
  if (!card) return null;
  const date = (ms: number) => formatDealDate(ms, locale);
  const checks = [
    ...(card.links.length ? [t.linksReal] : []),
    ...(card.shipment ? [fill(t.trackingFitsTemplate, { carrier: card.shipment.carrierName })] : []),
    ...(card.match ? [t.match[card.match.verdict]] : []),
  ];

  async function copyNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the number stays on screen to copy by hand */
    }
  }

  async function confirmArrival() {
    if (!caller) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmGoodsArrived(deal.jobId, caller);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delivery-title" className="space-y-5 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="delivery-title" className="text-[16px] font-semibold text-[var(--lp-dark)]">{t.title}</h2>
        {card.milestone ? (
          <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{fill(t.milestoneTemplate, { n: card.milestone.number, total: card.milestone.total })}</span>
        ) : null}
      </header>

      {card.held || card.note || card.links.length || card.photos.length ? (
        <div className="space-y-2.5">
          <p className={heading}>{t.delivered}</p>
          {card.held ? <p className="text-[14px] leading-relaxed text-[var(--lp-dark)]">{t.held}</p> : null}
          {card.note ? <p dir="auto" className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{card.note}</p> : null}
          {card.links.length ? (
            <div className="flex flex-wrap gap-2">
              {card.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener" className={outlineButton}>
                  <Icon name="link" size={16} />
                  {fill(t.openTemplate, { host: link.host })}
                </a>
              ))}
            </div>
          ) : null}
          {card.photos.length ? <PhotoRow urls={card.photos} alt={t.photoAltTemplate} /> : null}
        </div>
      ) : null}

      {card.handedOverAt ? (
        <div className="space-y-1.5">
          <p className={heading}>{t.whereItIs}</p>
          <p className="flex items-center gap-2 text-[15px] text-[var(--lp-dark)]">
            <Icon name="check" size={16} className="text-[var(--color-positive)]" />
            {fill(t.handedOverTemplate, { date: date(card.handedOverAt) })}
          </p>
        </div>
      ) : null}

      {card.shipment ? (
        <div className="space-y-2.5">
          <p className={heading}>{t.whereItIs}</p>
          <p className="text-[15px] text-[var(--lp-dark)]">
            <span className="font-semibold">{card.shipment.carrierName}</span>
            <span className="text-[var(--lp-text-sub)]"> · {t.trackingNumber} </span>
            <span className="font-mono">{card.shipment.trackingNumber}</span>
          </p>
          <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">
            {fill(t.sentTemplate, { date: date(card.shipment.dispatchedAt) })}
            {card.shipment.arrivedAt ? ` · ${fill(t.arrivedTemplate, { date: date(card.shipment.arrivedAt) })}` : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {card.shipment.trackingUrl ? (
              <a href={card.shipment.trackingUrl} target="_blank" rel="noreferrer noopener" className={outlineButton}>
                <Icon name="package" size={16} />
                {t.track}
              </a>
            ) : null}
            <button type="button" onClick={() => void copyNumber(card.shipment!.trackingNumber)} className={outlineButton}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
              {copied ? t.copied : t.copy}
            </button>
          </div>
          {card.canConfirmArrival && caller ? (
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => void confirmArrival()}
                disabled={busy}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
              >
                {t.confirmArrival}
              </button>
              <p className="text-center text-[13px] font-medium text-[var(--lp-text-sub)]">{t.confirmArrivalNote}</p>
              {error ? <p role="alert" className="text-center text-[13px] text-[var(--neg)]">{error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {checks.length ? (
        <div className="space-y-2">
          <p className={heading}>{t.checked}</p>
          <ul className="space-y-1.5">
            {checks.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[14px] text-[var(--lp-dark)]">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-[var(--color-positive)]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {card.match?.reason ? <p dir="auto" className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{card.match.reason}</p> : null}
        </div>
      ) : null}

      {card.documents.length ? (
        <div className="space-y-2">
          <p className={heading}>{t.documents}</p>
          <ul className="space-y-1.5">
            {card.documents.map((doc, index) => (
              <li key={`${doc.kind}-${index}`} className="flex items-center gap-2 text-[14px] text-[var(--lp-dark)]">
                <Icon name="file-text" size={16} className="shrink-0 text-[var(--lp-text-sub)]" />
                <span>{doc.label || t.docKinds[doc.kind]}</span>
                {doc.anchoredAt ? <span className="text-[var(--lp-text-sub)]">· {date(doc.anchoredAt)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.earlier.length ? (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-[var(--lp-dark)]">
            {t.earlier}
            <Icon name="chevron-right" size={16} directional className="text-[var(--lp-text-sub)] transition-transform group-open:rotate-90" />
          </summary>
          <ul className="mt-2 space-y-3">
            {card.earlier.map((entry) => (
              <li key={entry.revision} className="space-y-1.5 border-t border-[var(--lp-border-light)] pt-3">
                <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">
                  {entry.milestoneNumber ? `${fill(t.milestoneTemplate, { n: entry.milestoneNumber, total: card.milestone?.total ?? entry.milestoneNumber })} · ` : null}
                  {fill(t.sentTemplate, { date: date(entry.submittedAt) })}
                </p>
                {entry.held ? <p className="text-[14px] text-[var(--lp-dark)]">{t.heldShort}</p> : null}
                {entry.trackingNumber ? <p className="font-mono text-[14px] text-[var(--lp-dark)]">{entry.trackingNumber}</p> : null}
                {entry.photos.length ? <PhotoRow urls={entry.photos} alt={t.photoAltTemplate} /> : null}
                {entry.links.length ? (
                  <div className="flex flex-wrap gap-2">
                    {entry.links.map((link) => (
                      <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener" className={outlineButton}>
                        <Icon name="link" size={16} />
                        {fill(t.openTemplate, { host: link.host })}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
