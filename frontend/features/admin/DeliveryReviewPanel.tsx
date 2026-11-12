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
  const [workReason, setWorkReason] = useState('');
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

  async function clearWork() {
    setBusy(true);
    setNote(null);
    try {
      await api.adminClearWorkMismatch(jobId, workReason);
      setWorkReason('');
      setNote('Cleared. The work reads as matching for this delivery, the buyer review starts now and the deal chat says so.');
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
    return <div className="rounded-lg border border-[var(--d-line)] p-3 text-[13px] text-[var(--d-text-2)]">{note ?? 'Reading the deal...'}</div>;
  }
  const held = view.verificationStatus === 'suspicious' || view.verificationStatus === 'malicious';
  const review = view.review;
  const decided = review && review.decision !== 'pending-approval';
  const recordOnly = view.scope === 'record-only';
  const hold = view.matchHold;
  const work = view.workMismatch;

  return (
    <section className="space-y-3 rounded-lg border border-[var(--d-line)] p-4" aria-label={`Review for ${view.jobId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-[var(--d-text)]">{held ? 'Flagged delivery' : work ? 'Work does not match' : hold ? 'Held match' : 'Flagged delivery'}</p>
        <p className="text-[13px] text-[var(--d-text-2)]">{view.amountUsdc} USDC · delivery {view.revision}{view.revision !== view.deliveryRevision ? ` of ${view.deliveryRevision}` : ''}{view.closed ? ' · deal closed' : ''}</p>
      </div>

      {hold && (
        <div className="space-y-2 rounded-lg border border-[var(--d-line)] p-3">
          <p className="text-[13px] font-semibold text-[var(--d-text)]">Match held for a look</p>
          <p className="text-[13px] text-[var(--d-text-2)]">The hold moved no money and blocks no release. Clear it once you have looked.</p>
          <ul className="list-disc ps-5 text-[13px] text-[var(--d-text)]">
            {hold.reasons.map((r, i) => (
              <li key={i}>{r.text} <span className="text-[var(--d-text-2)]">(for the {r.audience === 'both' ? 'two of them' : r.audience})</span></li>
            ))}
          </ul>
          {!view.closed && (
            <div className="space-y-2">
              <label htmlFor={`hold-${view.jobId}`} className="block text-[13px] text-[var(--d-text-2)]">What you checked and what you found</label>
              <textarea
                id={`hold-${view.jobId}`}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-[var(--d-line)] bg-[var(--d-bg)] px-3 py-2 text-[13px] text-[var(--d-text)] outline-none focus:border-[var(--d-line-2)]"
              />
              <button type="button" disabled={busy || holdReason.trim().length < 10} onClick={() => void clearHold()} className="min-h-10 rounded-lg bg-[var(--d-lime)] px-4 text-[13px] font-bold text-[#0D0E10] disabled:opacity-50">
                Clear the hold
              </button>
            </div>
          )}
        </div>
      )}

      {work && (
        <div className="space-y-2 rounded-lg border border-[var(--d-line)] p-3">
          <p className="text-[13px] font-semibold text-[var(--d-text)]">The work check found a gap with the request</p>
          <p className="text-[13px] text-[var(--d-text-2)]">The release is paused until the seller delivers again, the buyer accepts it after their own review, or you clear it. Clearing pays nothing; the buyer review window starts then.</p>
          <p className="text-[13px] text-[var(--d-text)]">{work.reason}</p>
          <label htmlFor={`work-${view.jobId}`} className="block text-[13px] text-[var(--d-text-2)]">What you checked and what you found</label>
          <textarea
            id={`work-${view.jobId}`}
            value={workReason}
            onChange={(e) => setWorkReason(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-lg border border-[var(--d-line)] bg-[var(--d-bg)] px-3 py-2 text-[13px] text-[var(--d-text)] outline-none focus:border-[var(--d-line-2)]"
          />
          <button type="button" data-work-clear disabled={busy || workReason.trim().length < 10} onClick={() => void clearWork()} className="min-h-10 rounded-lg bg-[var(--d-lime)] px-4 text-[13px] font-bold text-[#0D0E10] disabled:opacity-50">
            Work matches, clear it
          </button>
        </div>
      )}

      {view.deliveries.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-[var(--d-text-2)]">Delivery</span>
          {view.deliveries.map((d) => (
            <button
              key={d.revision}
              type="button"
              onClick={() => setRevision(d.current ? undefined : d.revision)}
              className={`min-h-8 rounded-lg border px-3 ${d.revision === view.revision ? 'border-[var(--d-line-2)] text-[var(--d-text)]' : 'border-[var(--d-line)] text-[var(--d-text-2)] hover:text-[var(--d-text)]'}`}
            >
              {d.revision}{d.current ? ' (current)' : ''}{d.reviewed ? ` · ${d.reviewed}` : ''}
            </button>
          ))}
        </div>
      )}

      <dl className="space-y-2 text-[13px]">
        <div>
          <dt className="text-[var(--d-text-2)]">Link (open it in an isolated browser)</dt>
          <dd className="mt-1 flex items-start gap-2">
            <code className="min-w-0 flex-1 select-text break-all rounded-lg bg-[var(--d-hover)] px-2 py-1.5 text-[var(--d-text)]">{view.deliveryProof ?? 'No link'}</code>
            {view.deliveryProof ? (
              <button type="button" onClick={() => void copyLink(view.deliveryProof!)} className="min-h-9 rounded-lg border border-[var(--d-line)] px-3 text-[12px] text-[var(--d-text)] hover:text-[var(--d-text)]">
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--d-text-2)]">Scanner</dt>
          <dd className={view.verificationStatus === 'malicious' ? 'font-semibold text-[var(--d-red)]' : 'text-[var(--d-text)]'}>
            {view.verificationStatus ?? 'not scanned'}{view.verificationReasons.length ? `: ${view.verificationReasons.join(', ')}` : ''}
          </dd>
        </div>
        {review ? (
          <div>
            <dt className="text-[var(--d-text-2)]">Review</dt>
            <dd className="mt-1 space-y-1">
              {review.steps.map((step) => (
                <p key={step.at} className="text-[var(--d-text)]">
                  {step.role} said {step.decision} · {new Date(step.at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC: {step.reason}
                </p>
              ))}
              <p className="font-semibold text-[var(--d-text)]">
                {review.decision === 'pending-approval' ? 'Waiting for the other credential.' : `Final: ${review.decision}.`}
              </p>
            </dd>
          </div>
        ) : null}
      </dl>

      {!held ? (
        <p className="text-[13px] text-[var(--d-text-2)]">{hold ? 'The delivery link is not held.' : 'The current delivery is not held, so there is nothing to review.'}</p>
      ) : decided ? null : (
        <div className="space-y-2">
          {recordOnly && (
            <p className="text-[13px] text-[var(--d-text-2)]">
              {view.closed ? 'This deal is closed.' : 'This delivery was replaced.'} A decision here corrects the record only: clearing takes the offence off the seller and changes nothing for the money.
            </p>
          )}
          <label htmlFor={`review-${view.jobId}`} className="block text-[13px] text-[var(--d-text-2)]">What you checked and what you found</label>
          <textarea
            id={`review-${view.jobId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-[var(--d-line)] bg-[var(--d-bg)] px-3 py-2 text-[13px] text-[var(--d-text)] outline-none focus:border-[var(--d-line-2)]"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void decide('safe')} className="min-h-10 rounded-lg bg-[var(--d-lime)] px-4 text-[13px] font-bold text-[#0D0E10] disabled:opacity-50">
              {recordOnly ? 'Link was safe, correct the record' : 'Link is safe, clear it'}
            </button>
            <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void decide('unsafe')} className="min-h-10 rounded-lg border border-[var(--d-line)] px-4 text-[13px] font-bold text-[var(--d-text)] disabled:opacity-50">
              {recordOnly ? 'Link was unsafe, keep the record' : 'Keep it blocked'}
            </button>
          </div>
        </div>
      )}
      {note ? <p role="status" className="text-[13px] text-[var(--d-text)]">{note}</p> : null}
    </section>
  );
}
