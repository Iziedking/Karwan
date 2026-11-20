'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { dealRecordCopy } from '@/shared/i18n/messages/dealRecord';
import { formatDealDate } from '../workspace/presentation';
import { Sheet, primaryButton, quietButton } from '../workspace/Sheet';
import { recordRows } from './recordRows';
import { RecordRowsList } from './RecordRowsList';

/// A finished deal's signed record on its page (view 94, Figma 382:571): five
/// rows from what the deal did, and Share, which opens a sheet with this side's
/// link and Stop sharing (382:607). Until the sweep writes it, one line says
/// it is on its way.
export function DealRecord({ jobId }: { jobId: string }) {
  const { locale } = useLocale();
  const t = dealRecordCopy[locale];
  const queryClient = useQueryClient();
  const key = ['deal-record', jobId];
  const query = useQuery({ queryKey: key, queryFn: () => api.dealRecord(jobId), retry: false, staleTime: 60_000 });
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const own = query.data?.record ? query.data : null;

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const made = await api.shareDealRecord(jobId);
      setLink(made.link);
      void queryClient.invalidateQueries({ queryKey: key });
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await api.stopSharingDealRecord(jobId);
      setLink(null);
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: key });
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (query.isPending) return null;

  return (
    <section id="deal-record" aria-labelledby="deal-record-title" data-deal-record className="mt-6 scroll-mt-24 rounded-[24px] bg-[var(--lp-card)] p-5">
      <div className="flex items-center gap-2">
        <h2 id="deal-record-title" className="text-[18px] font-bold text-[var(--lp-dark)]">{t.title}</h2>
        <Hint side="bottom">{t.intro}</Hint>
      </div>
      {own ? (
        <>
          <p className="mt-0.5 text-[13px] font-medium tracking-wide text-[var(--lp-text-sub)]">{own.record.reference}</p>
          <div className="mt-4">
            <RecordRowsList rows={recordRows(own.record, own.side, own.writtenAt, t, (ms) => formatDealDate(ms, locale))} t={t} />
          </div>
          {error && !link ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
          <button
            type="button"
            onClick={() => { void share(); }}
            disabled={busy}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--lp-outline-strong)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {t.share}
          </button>
        </>
      ) : (
        <p className="mt-2 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.writing}</p>
      )}
      <Sheet open={!!link} title={t.sheetTitle} busy={busy} onClose={() => { setLink(null); setCopied(false); setError(null); }}>
        <p className="text-[15px] text-[var(--lp-text-sub)]">{t.sheetLine}</p>
        <p data-share-link dir="ltr" className="mt-4 break-all rounded-[14px] bg-[var(--lp-light)] px-3.5 py-3 text-[14px] font-medium text-[var(--lp-dark)]">{link}</p>
        {error ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
        <div className="mt-4 space-y-2">
          <button type="button" onClick={() => { void copy(); }} className={primaryButton}>{copied ? t.copied : t.copy}</button>
          <button type="button" onClick={() => { void stop(); }} disabled={busy} className={quietButton}>{t.stop}</button>
        </div>
      </Sheet>
    </section>
  );
}
