'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type AdminMatchingReviewDecision,
  type AdminMatchingReviewItem,
} from '@/core/api';
import {
  buildMatchingReviewRows,
  matchingReviewDecisionLabel,
  matchingReviewReasonLabel,
  MATCHING_REVIEW_DECISIONS,
} from '@/features/admin/matchingReviewPresentation';

type Draft = { decision: AdminMatchingReviewDecision; note: string };

const inputClass =
  'mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[13px] focus:border-white/40 outline-none';
const labelClass = 'mono text-[10px] uppercase tracking-[0.12em] text-white/40';

function reviewId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `matching-review:${crypto.randomUUID()}`;
  }
  return `matching-review:${Date.now()}`;
}

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}

function initialDraft(item: AdminMatchingReviewItem): Draft {
  return { decision: item.reasons.includes('semantic-review-pending') ? 'needs_more_evidence' : 'retain_legacy', note: '' };
}

export default function AdminMatchingPage() {
  const [queue, setQueue] = useState<AdminMatchingReviewItem[] | null>(null);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof api.adminMatchingReviews>>['reviews']>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.adminMatchingReviewQueue>>['summary'] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewer, setReviewer] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [queueResponse, reviewResponse] = await Promise.all([
        api.adminMatchingReviewQueue(100),
        api.adminMatchingReviews(100),
      ]);
      setQueue(queueResponse.reviewQueue);
      setSummary(queueResponse.summary);
      setReviews(reviewResponse.reviews);
      setErr(null);
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Could not load matching review evidence');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => buildMatchingReviewRows(queue ?? [], reviews), [queue, reviews]);

  function draftFor(item: AdminMatchingReviewItem): Draft {
    return drafts[item.observationKey] ?? initialDraft(item);
  }

  function updateDraft(item: AdminMatchingReviewItem, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [item.observationKey]: { ...draftFor(item), ...patch },
    }));
  }

  async function submit(item: AdminMatchingReviewItem) {
    const draft = draftFor(item);
    const name = reviewer.trim();
    if (!name || busyKey) return;
    setBusyKey(item.observationKey);
    setErr(null);
    setNotice(null);
    try {
      await api.adminSubmitMatchingReview({
        reviewId: reviewId(),
        observationKey: item.observationKey,
        decision: draft.decision,
        reviewer: name,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      });
      setNotice(`Recorded ${matchingReviewDecisionLabel(draft.decision)} for ${item.observationKey}.`);
      await load();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Could not record this review');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">[:MATCHING REVIEW:]</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Shadow disagreements</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[70ch]">
        Review evidence before any future winner cutover. These dispositions are immutable audit
        records only: legacy matching remains authoritative and no review can trigger a wallet,
        provider, notification, or financial action.
      </p>

      {err && <p className="mt-4 text-[12px] text-[#e0794f] border border-[#e0794f]/30 bg-[#e0794f]/10 rounded-lg px-3 py-2">{err}</p>}
      {notice && <p className="mt-4 text-[12px] text-white/70 border border-white/15 bg-white/5 rounded-lg px-3 py-2">{notice}</p>}

      <section className="mt-6 border border-white/10 rounded-xl p-5 bg-[#161616]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className={labelClass}>Review identity</p>
            <p className="mt-1 text-[12px] text-white/45">Stored with each disposition for accountability.</p>
          </div>
          <label className="block w-full sm:w-[320px]">
            <span className={labelClass}>Reviewer</span>
            <input
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              maxLength={200}
              placeholder="operator handle or email"
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {summary && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['Observed', summary.total],
            ['Diverged', summary.comparison.diverged],
            ['Pending review', rows.filter((row) => !row.review).length],
          ].map(([label, value]) => (
            <div key={label} className="border border-white/10 rounded-xl p-4 bg-[#161616]">
              <p className={labelClass}>{label}</p>
              <p className="mt-2 mono text-[22px] text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {queue === null && <p className="text-[13px] text-white/40">Loading review queue</p>}
        {queue !== null && rows.length === 0 && (
          <div className="border border-white/10 rounded-xl p-5 bg-[#161616]">
            <p className="text-[14px] font-semibold">No unresolved disagreements</p>
            <p className="mt-1 text-[12px] text-white/45">The queue is empty for the current bounded audit window.</p>
          </div>
        )}

        {rows.map((row) => {
          const draft = draftFor(row);
          return (
            <article key={row.observationKey} className="border border-white/10 rounded-xl p-5 bg-[#161616]">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className={labelClass}>{row.source} · mandate v{row.mandateVersion}</p>
                  <h2 className="mt-2 mono text-[13px] break-all text-white">{row.observationKey}</h2>
                  <p className="mt-1 text-[11px] text-white/35">Observed {when(row.observedAt)}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {row.reasons.map((reason) => (
                    <span key={reason} className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border border-[#AFC95B]/30 text-[#AFC95B]">
                      {matchingReviewReasonLabel(reason)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-[12px] text-white/55">
                <p><span className="text-white/35">Legacy winner:</span> <span className="mono text-white/75">{row.legacyWinnerId ?? 'none'}</span></p>
                <p><span className="text-white/35">Shadow winner:</span> <span className="mono text-white/75">{row.shadowWinnerId ?? 'none'}</span></p>
              </div>

              {row.review ? (
                <div className="mt-4 border border-white/10 rounded-lg px-3 py-3 bg-white/[0.03]">
                  <p className={labelClass}>Reviewed · {matchingReviewDecisionLabel(row.review.decision)}</p>
                  <p className="mt-1 text-[12px] text-white/60">{row.review.reviewer} · {when(row.review.createdAt)}</p>
                  {row.review.note && <p className="mt-2 text-[12px] text-white/75">{row.review.note}</p>}
                </div>
              ) : (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <fieldset>
                    <legend className={labelClass}>Disposition</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {MATCHING_REVIEW_DECISIONS.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          aria-pressed={draft.decision === choice.value}
                          onClick={() => updateDraft(row, { decision: choice.value })}
                          className={`min-h-11 rounded-lg border px-3 py-2 text-left text-[11px] font-semibold transition ${
                            draft.decision === choice.value
                              ? 'border-[#AFC95B]/45 bg-[#AFC95B]/10 text-[#c7dc82]'
                              : 'border-white/12 text-white/50 hover:border-white/25 hover:text-white/80'
                          }`}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="mt-3 block">
                    <span className={labelClass}>Note (optional)</span>
                    <textarea
                      value={draft.note}
                      onChange={(event) => updateDraft(row, { note: event.target.value })}
                      maxLength={500}
                      rows={3}
                      placeholder="What evidence supports this disposition?"
                      className={`${inputClass} resize-y`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void submit(row)}
                    disabled={!reviewer.trim() || busyKey !== null}
                    className="mt-3 mono text-[10px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-40"
                  >
                    {busyKey === row.observationKey ? 'Recording' : 'Record disposition'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
