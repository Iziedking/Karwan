'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminDeliveryReviewView } from '@/core/api';

/// Review a delivery link the scanner flagged (architecture view 21). The link
/// is shown as text, never as a link: open it in an isolated browser. A
/// suspicious link clears with one decision; a malicious one needs the support
/// token and the admin token, one decision each.
export function DeliveryReviewPanel({ jobId }: { jobId: string }) {
  const [view, setView] = useState<AdminDeliveryReviewView | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await api.adminDeliveryGet(jobId));
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Could not read this deal.');
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: 'safe' | 'unsafe') {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.adminDeliveryReview(jobId, decision, reason);
      setReason('');
      setNote(r.cleared
        ? 'Cleared. The buyer can open the link and both people were told.'
        : r.review.decision === 'pending-approval'
          ? 'Recorded. A link rated malicious also needs the other credential to approve.'
          : 'Kept blocked. The seller was told to send a new link.');
      await load();
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

  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4" aria-label={`Delivery review for ${view.jobId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-white">Flagged delivery</p>
        <p className="text-[13px] text-white/60">{view.amountUsdc} USDC · delivery {view.deliveryRevision}</p>
      </div>

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

      {view.closed ? (
        <p className="text-[13px] text-white/60">This deal is closed.</p>
      ) : !held ? (
        <p className="text-[13px] text-white/60">The current delivery is not held, so there is nothing to review.</p>
      ) : decided ? null : (
        <div className="space-y-2">
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
              Link is safe, clear it
            </button>
            <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void decide('unsafe')} className="min-h-10 rounded-lg border border-white/20 px-4 text-[13px] font-bold text-white disabled:opacity-50">
              Keep it blocked
            </button>
          </div>
        </div>
      )}
      {note ? <p role="status" className="text-[13px] text-white/80">{note}</p> : null}
    </section>
  );
}
