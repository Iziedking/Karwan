'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';
import { Button, buttonClasses } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { splitRequestText } from '@/features/discovery/model';
import { deliverByUnixFromDate, offerDefaults, offerErrorKey, type Offer } from '../model';
import { Icon } from '@/shared/components/Icon';

type View = Awaited<ReturnType<typeof api.offers>>;

const NOTE_MAX = 280;

function shortDate(unix: number, locale: string): string {
  return new Date(unix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/// A request seen by someone who did not post it: what is asked, and the
/// seller's way in. Returns null when the request is not open to offers, so the
/// caller can fall back to its own closed or private view.
export function OfferPanel({ jobId, fallback }: { jobId: string; fallback: React.ReactNode }) {
  const t = useTranslations().offers;
  const { locale } = useLocale();
  const auth = useAuth();
  const [view, setView] = useState<View | null | 'failed'>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.offers(jobId));
    } catch {
      setView('failed');
    }
  }, [jobId]);

  useEffect(() => {
    if (auth.isLoading) return;
    void load();
  }, [load, auth.isLoading, auth.address]);

  if (view === null) return null;
  if (view === 'failed' || !view.request || view.role === 'buyer') return <>{fallback}</>;

  const { title, body } = splitRequestText(view.request.briefText);
  const mine = view.offers[0];
  const countLabel =
    view.count === 0 ? t.countNone : view.count === 1 ? t.countOne : t.countMany.replace('{n}', String(view.count));

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
      <p className="text-[13px] font-medium" style={{ color: 'var(--color-request)' }}>
        {t.requestLabel}
      </p>
      <h1 dir="auto" className="mt-2 text-[28px] font-medium leading-tight tracking-[-0.01em] text-[var(--lp-dark)] sm:text-[36px]">
        {title}
      </h1>
      {body ? <p dir="auto" className="mt-3 text-[16px] leading-relaxed text-[var(--lp-text-sub)]">{body}</p> : null}

      <dl className="mt-8 divide-y divide-[var(--lp-border-light)] rounded-[20px] bg-[var(--lp-card)] px-6">
        {view.poster ? (
          <div className="flex items-center justify-between gap-4 py-4">
            <dt className="text-[15px] text-[var(--lp-text-sub)]">{t.postedBy}</dt>
            <dd className="min-w-0">
              <Link
                href={`/credit-passport/${view.poster.address}`}
                className="inline-flex min-h-11 items-center gap-1.5 truncate text-[15px] font-medium text-[var(--lp-dark)] underline underline-offset-4 hover:text-[var(--lp-accent-on-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                {view.poster.handle ? `@${view.poster.handle}` : view.poster.name ?? `${view.poster.address.slice(0, 6)}…${view.poster.address.slice(-4)}`}
                <span aria-hidden className="rtl-flip">→</span>
              </Link>
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-[15px] text-[var(--lp-text-sub)]">{t.budget}</dt>
          <dd className="text-[15px] font-medium tabular-nums text-[var(--lp-dark)]">
            {formatUsdc(view.request.budgetUsdc)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-[15px] text-[var(--lp-text-sub)]">{t.due}</dt>
          <dd className="text-[15px] text-[var(--lp-dark)]">{shortDate(view.request.deadlineUnix, locale)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-[15px] text-[var(--lp-text-sub)]">{t.offersLabel}</dt>
          <dd className="text-[15px] text-[var(--lp-dark)]">{countLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-[15px] text-[var(--lp-text-sub)]">{t.moneyLabel}</dt>
          <dd className="text-[15px] text-[var(--lp-dark)]">{t.moneyHeld}</dd>
        </div>
      </dl>

      <div className="mt-8">
        {view.role === 'visitor' ? (
          <Link href={`/start?next=/jobs/${jobId}`} className={buttonClasses({ size: 'lg', className: 'w-full rounded-full' })}>
            {t.signIn}
          </Link>
        ) : mine ? (
          <SentOffer jobId={jobId} offer={mine} onChange={load} />
        ) : (
          <MakeOffer jobId={jobId} budgetUsdc={view.request.budgetUsdc} deadlineUnix={view.request.deadlineUnix} onSent={load} />
        )}
      </div>
    </main>
  );
}

function SentOffer({ jobId, offer, onChange }: { jobId: string; offer: Offer; onChange: () => Promise<void> }) {
  const t = useTranslations().offers;
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-[20px] bg-[var(--lp-card)] p-6">
      <p className="text-[17px] font-medium text-[var(--lp-dark)]">{t.sent}</p>
      <p className="mt-1 text-[14px] tabular-nums text-[var(--lp-text-sub)]">
        {t.sentDetail.replace('{price}', formatUsdc(offer.priceUsdc, { withSuffix: false })).replace('{date}', shortDate(offer.deliverByUnix, locale))}
      </p>
      <Button
        variant="ghost"
        className="mt-4 rounded-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.withdrawOffer(jobId, offer.id);
            await onChange();
          } catch (err) {
            setError(t.errors[offerErrorKey(err instanceof ApiError ? err.code ?? '' : '')]);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.withdraw}
      </Button>
      {error ? <p role="alert" className="mt-2 text-[14px] text-[var(--color-critical)]">{error}</p> : null}
    </div>
  );
}

function MakeOffer({
  jobId,
  budgetUsdc,
  deadlineUnix,
  onSent,
}: {
  jobId: string;
  budgetUsdc: string;
  deadlineUnix: number;
  onSent: () => Promise<void>;
}) {
  const t = useTranslations().offers;
  const titleId = useId();
  const priceId = useId();
  const dateId = useId();
  const noteId = useId();
  const priceRef = useRef<HTMLInputElement | null>(null);
  const defaults = offerDefaults(budgetUsdc, deadlineUnix);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(defaults.priceUsdc);
  const [date, setDate] = useState(defaults.deliverByDate);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: ReturnType<typeof offerErrorKey> } | null>(null);
  const noteLength = [...note].length;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.createOffer(jobId, { priceUsdc: price.trim(), deliverByUnix: deliverByUnixFromDate(date), note });
      setOpen(false);
      await onSent();
    } catch (err) {
      setError({ key: offerErrorKey(err instanceof ApiError ? err.code ?? '' : '') });
    } finally {
      setBusy(false);
    }
  }

  const field =
    'mt-1.5 block w-full rounded-[14px] bg-[var(--color-surface-2)] px-4 py-3.5 text-[15px] text-[var(--lp-dark)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  return (
    <>
      <Button size="lg" className="w-full rounded-full" onClick={() => setOpen(true)}>
        {t.makeOffer}
      </Button>
      <ConfirmSheetShell open={open} labelledBy={titleId} busy={busy} onClose={() => setOpen(false)} initialFocus={priceRef}>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <h2 id={titleId} className="text-[22px] font-medium text-[var(--lp-dark)]">
            {t.sheetTitle}
          </h2>
          <div>
            <label htmlFor={priceId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">
              {t.price}
            </label>
            <input
              id={priceId}
              ref={priceRef}
              inputMode="decimal"
              autoComplete="off"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`${field} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor={dateId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">
              {t.deliverBy}
            </label>
            <input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={noteId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">
              {t.note}
            </label>
            <textarea
              id={noteId}
              rows={3}
              value={note}
              placeholder={t.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
              className={`${field} resize-none`}
            />
            {noteLength >= 250 ? (
              <p className="mt-1 text-end text-[12px] tabular-nums text-[var(--lp-text-sub)]">
                {t.noteCount.replace('{n}', String(noteLength))}
              </p>
            ) : null}
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.explainer}</p>
          {error ? (
            <p role="alert" className="text-[14px] text-[var(--color-critical)]">
              {t.errors[error.key]}
              {error.key === 'activate' ? (
                <>
                  {' '}
                  <Link href="/onboarding" className="underline">
                    {t.activateLink}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full rounded-full" loading={busy} disabled={noteLength > NOTE_MAX}>
            {busy ? t.sending : <>{t.send}<Icon name="send" size={16} directional /></>}
          </Button>
        </form>
      </ConfirmSheetShell>
    </>
  );
}
