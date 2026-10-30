'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminDeliveryReviewView } from '@/core/api';

/// Review what the security agent held on one deal (architecture view 21): a
/// delivery link the scanner flagged, shown as text, never as a link (open it
/// in an isolated browser), and a match hold. A suspicious link clears with
/// one decision; a malicious one needs the support token and the admin token,
/// one decision each. An earlier delivery, or any delivery of a closed deal,
/// is reviewed for the record only: the offence comes off, the money is
/// untouched. A match hold moved no money, so one decision clears it.
export function DeliveryReviewPanel({ jobId, onChanged }: { jobId: string; onChanged?: () => void }) {
  const [view, setView] = useState<AdminDeliveryReviewView | null>(null);
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await api.adminDeliveryGet(jobId, revision));
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Could not read this deal.');
    }
  }, [jobId, revision]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: 'safe' | 'unsafe') {
    if (!view) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api.adminDeliveryReview(jobId, decision, reason, view.scope === 'record-only' ? view.revision : undefined);
      setReason('');
      setNote(r.scope === 'record-only'
        ? r.cleared
          ? 'Recorded as safe. The offence is off the seller; nothing changed for the money.'
          : r.review.decision === 'pending-approval'
            ? 'Recorded. A link rated malicious also needs the other credential.'
            : 'Recorded as unsafe. Nothing else changed.'
        : r.cleared
          ? 'Cleared. The buyer can open the link and both people were told.'
          : r.review.decision === 'pending-approval'
            ? 'Recorded. A link rated malicious also needs the other credential to approve.'
            : 'Kept blocked. The seller was told to send a new link.');
      await load();
      onChanged?.();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  async function clearHold() {
    setBusy(true);
    setNote(null);
    try {
      await api.adminClearMatchHold(jobId, holdReason);
      setHoldReason('');
      setNote('Hold cleared. The card is gone for both people and the deal chat says so.');
      await load();
      onChanged?.();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* the link stays selectable */
    }
  }

  if (!view) {
    return <div className="rounded-xl border border-white/10 p-3 text-[13px] text-white/60">{note ?? 'Reading the deal...'}</div>;
  }
  const held = view.verificationStatus === 'suspicious' || view.verificationStatus === 'malicious';
  const review = view.review;
  const decided = review && review.decision !== 'pending-approval';
  const recordOnly = view.scope === 'record-only';
  const hold = view.matchHold;

  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4" aria-label={`Review for ${view.jobId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-white">{hold && !held ? 'Held match' : 'Flagged delivery'}</p>
        <p className="text-[13px] text-white/60">{view.amountUsdc} USDC · delivery {view.revision}{view.revision !== view.deliveryRevision ? ` of ${view.deliveryRevision}` : ''}{view.closed ? ' · deal closed' : ''}</p>
      </div>

      {hold && (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <p className="text-[13px] font-semibold text-white">Match held for a look</p>
          <p className="text-[13px] text-white/60">The hold moved no money and blocks no release. Clear it once you have looked.</p>
          <ul className="list-disc ps-5 text-[13px] text-white/80">
            {hold.reasons.map((r, i) => (
              <li key={i}>{r.text} <span className="text-white/40">(for the {r.audience === 'both' ? 'two of them' : r.audience})</span></li>
            ))}
          </ul>
          {!view.closed && (
            <div className="space-y-2">
              <label htmlFor={`hold-${view.jobId}`} className="block text-[13px] text-white/60">What you checked and what you found</label>
              <textarea
                id={`hold-${view.jobId}`}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-white/15 bg-[#0e0e0e] px-3 py-2 text-[13px] text-white outline-none focus:border-white/40"
              />
              <button type="button" disabled={busy || holdReason.trim().length < 10} onClick={() => void clearHold()} className="min-h-10 rounded-lg bg-[#AFC95B] px-4 text-[13px] font-bold text-[#10171D] disabled:opacity-50">
                Clear the hold
              </button>
            </div>
          )}
        </div>
      )}

      {view.deliveries.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-white/50">Delivery</span>
          {view.deliveries.map((d) => (
            <button
              key={d.revision}
              type="button"
              onClick={() => setRevision(d.current ? undefined : d.revision)}
              className={`min-h-8 rounded-lg border px-3 ${d.revision === view.revision ? 'border-white/60 text-white' : 'border-white/15 text-white/60 hover:text-white'}`}
            >
              {d.revision}{d.current ? ' (current)' : ''}{d.reviewed ? ` · ${d.reviewed}` : ''}
            </button>
          ))}
        </div>
      )}

      <dl className="space-y-2 text-[13px]">
        <div>
          <dt className="text-white/50">Link (open it in an isolated browser)</dt>
          <dd className="mt-1 flex items-start gap-2">
            <code className="min-w-0 flex-1 select-text break-all rounded-lg bg-white/[0.06] px-2 py-1.5 text-white">{view.deliveryProof ?? 'No link'}</code>
            {view.deliveryProof ? (
              <button type="button" onClick={() => void copyLink(view.deliveryProof!)} className="min-h-9 rounded-lg border border-white/15 px-3 text-[12px] text-white/80 hover:text-white">
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-white/50">Scanner</dt>
          <dd className={view.verificationStatus === 'malicious' ? 'font-semibold text-[#e0794f]' : 'text-white'}>
            {view.verificationStatus ?? 'not scanned'}{view.verificationReasons.length ? `: ${view.verificationReasons.join(', ')}` : ''}
          </dd>
        </div>
        {review ? (
          <div>
            <dt className="text-white/50">Review</dt>
            <dd className="mt-1 space-y-1">
              {review.steps.map((step) => (
                <p key={step.at} className="text-white/80">
                  {step.role} said {step.decision} · {new Date(step.at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC: {step.reason}
                </p>
              ))}
              <p className="font-semibold text-white">
                {review.decision === 'pending-approval' ? 'Waiting for the other credential.' : `Final: ${review.decision}.`}
              </p>
            </dd>
          </div>
        ) : null}
      </dl>

      {!held ? (
        <p className="text-[13px] text-white/60">{hold ? 'The delivery link is not held.' : 'The current delivery is not held, so there is nothing to review.'}</p>
      ) : decided ? null : (
        <div className="space-y-2">
          {recordOnly && (
            <p className="text-[13px] text-white/60">
              {view.closed ? 'This deal is closed.' : 'This delivery was replaced.'} A decision here corrects the record only: clearing takes the offence off the seller and changes nothing for the money.
            </p>
          )}
          <label htmlFor={`review-${view.jobId}`} className="block text-[13px] text-white/60">What you checked and what you found</label>
          <textarea
            id={`review-${view.jobId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-white/15 bg-[#0e0e0e] px-3 py-2 text-[13px] text-white outline-none focus:border-white/40"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void decide('safe')} className="min-h-10 rounded-lg bg-[#AFC95B] px-4 text-[13px] font-bold text-[#10171D] disabled:opacity-50">
              {recordOnly ? 'Link was safe, correct the record' : 'Link is safe, clear it'}
            </button>
            <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void decide('unsafe')} className="min-h-10 rounded-lg border border-white/20 px-4 text-[13px] font-bold text-white disabled:opacity-50">
              {recordOnly ? 'Link was unsafe, keep the record' : 'Keep it blocked'}
            </button>
          </div>
        </div>
      )}
      {note ? <p role="status" className="text-[13px] text-white/80">{note}</p> : null}
    </section>
  );
}
