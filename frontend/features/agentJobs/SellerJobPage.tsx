'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AgentJobView } from '@/core/api';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { fill } from '@/features/deals/workspace/presentation';
import { localDay } from '@/features/work/workModel';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY, SECONDARY } from '@/shared/ui/controls';

/// A deal an outside agent funded for a verified person (view 15), as its
/// seller sees it: what they get, by when, and the one step that is theirs.
export function SellerJobPage({ jobRef }: { jobRef: string }) {
  const t = useTranslations().agentJobs;
  const { locale } = useLocale();
  const [job, setJob] = useState<AgentJobView | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<'deliver' | 'dispute' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.agentJob(jobRef).then((r) => setJob(r.job)).catch((err) => setMissing(err instanceof ApiError && (err.status === 404 || err.status === 401)));
  }, [jobRef]);
  useEffect(() => {
    load();
    const poll = window.setInterval(load, 20_000);
    return () => window.clearInterval(poll);
  }, [load]);

  if (missing) return <div className="mx-auto max-w-[760px] px-4 pt-8"><p className="text-[15px] text-[var(--ink-secondary)]">{t.errors.failed}</p></div>;
  if (!job) return null;

  const day = (ms: number) => localDay(ms, locale);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = sheet === 'deliver' ? await api.agentJobDelivered(job.ref, text.trim()) : await api.agentJobDispute(job.ref, text.trim());
      setJob(r.job);
      setSheet(null);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.errors.failed);
    } finally {
      setBusy(false);
    }
  };
  const canDispute = job.status === 'rejected' && job.disputeBy !== null && Date.now() < job.disputeBy;
  const field = (label: string, hint?: string) => (
    <div className="mt-6">
      <label htmlFor="job-text" className="text-[15px] font-semibold text-[var(--lp-ink)]">{label}</label>
      <textarea id="job-text" value={text} maxLength={1000} rows={3} onChange={(e) => setText(e.target.value)} className={`mt-2 py-3 ${FIELD}`} />
      {hint ? <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">{hint}</p> : null}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6">
      <Link href="/agent-jobs" className="text-[14px] text-[var(--ink-secondary)] underline underline-offset-4">{t.seller.list}</Link>
      <h1 className="mt-4 text-[24px] font-semibold text-[var(--lp-ink)]">{t.seller.title}</h1>
      <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">{t.seller.badge}</p>
      <p className="mt-6 text-[14px] text-[var(--ink-secondary)]">{t.seller.youGet}</p>
      <p className="text-[40px] font-semibold tabular-nums leading-none text-[var(--lp-ink)]">{job.amountUsdc} USDC</p>
      <dl className="mt-6 divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)] text-[15px]">
        <div className="py-3"><dd className="text-[var(--lp-ink)]">{job.work}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-[var(--ink-secondary)]">{t.seller.deadline}</dt><dd className="tabular-nums text-[var(--lp-ink)]">{day(job.deadline)}</dd></div>
        <div className="py-3"><dd className="font-semibold text-[var(--lp-ink)]">{t.seller.status[job.status]}</dd></div>
      </dl>

      {job.status === 'funded' ? (
        <>
          {field(t.seller.noteLabel, t.seller.noteHint)}
          <button type="button" disabled={!text.trim()} onClick={() => setSheet('deliver')} className={`mt-5 ${PRIMARY}`}>{t.seller.deliver}</button>
        </>
      ) : null}
      {job.status === 'submitted' && job.reviewEndsAt ? (
        <p className="mt-6 text-[15px] text-[var(--ink-secondary)]">{fill(t.seller.reviewEnds, { date: day(job.reviewEndsAt) })}</p>
      ) : null}
      {job.status === 'rejected' && job.unhappyNote ? (
        <div className="mt-6">
          <p className="text-[14px] text-[var(--ink-secondary)]">{t.seller.unhappy}</p>
          <p className="mt-1 text-[15px] text-[var(--lp-ink)]">{job.unhappyNote}</p>
          {canDispute ? (
            <>
              <p className="mt-3 text-[14px] text-[var(--ink-secondary)]">{fill(t.seller.disputeBy, { date: day(job.disputeBy!) })}</p>
              {field(t.seller.clauseLabel)}
              <button type="button" disabled={!text.trim()} onClick={() => setSheet('dispute')} className={`mt-5 ${SECONDARY}`}>{t.seller.dispute}</button>
            </>
          ) : null}
        </div>
      ) : null}
      {error && !sheet ? <p role="alert" className={`mt-4 ${ALERT}`}>{error}</p> : null}

      <ConfirmSheet
        open={sheet !== null}
        title={sheet === 'deliver' ? t.seller.deliver : t.seller.dispute}
        consequence={sheet === 'deliver' ? t.seller.deliverConsequence : t.seller.disputeConsequence}
        irreversible
        confirmLabel={sheet === 'deliver' ? t.seller.deliver : t.seller.dispute}
        busy={busy}
        error={error}
        onConfirm={() => {
          if (!busy) void send();
        }}
        onClose={() => {
          if (!busy) setSheet(null);
        }}
      >
        {null}
      </ConfirmSheet>
    </div>
  );
}

/// Every deal outside agents funded with this seller, newest first.
export function SellerJobsList() {
  const t = useTranslations().agentJobs;
  const { locale } = useLocale();
  const [jobs, setJobs] = useState<AgentJobView[] | null>(null);
  useEffect(() => {
    api.agentJobsMine().then((r) => setJobs(r.jobs)).catch(() => setJobs([]));
  }, []);
  if (!jobs) return null;
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6">
      <h1 className="text-[24px] font-semibold text-[var(--lp-ink)]">{t.seller.list}</h1>
      {jobs.length === 0 ? (
        <p className="mt-4 text-[15px] text-[var(--ink-secondary)]">{t.seller.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
          {jobs.map((j) => (
            <li key={j.ref}>
              <Link href={`/agent-jobs/${j.ref}`} className="flex min-h-14 items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-[var(--lp-ink)]">{j.work}</span>
                  <span className="block text-[14px] text-[var(--ink-secondary)]">{t.seller.status[j.status]} · {localDay(j.deadline, locale)}</span>
                </span>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-ink)]">{j.amountUsdc} USDC</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
