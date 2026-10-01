'use client';
import { useState } from 'react';
import { ApiError, api, type DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from './presentation';
import type { Problem } from './problems';
import { Sheet, fieldLabel, primaryButton, quietButton } from './Sheet';

const DAY_S = 86_400;

/// One deal move with its busy state and the error in plain words. The sheet
/// closes and the deal refreshes when the move lands.
function useMove(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(move: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await move();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function MoveError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
  ) : null;
}

const textArea = 'form-input mt-1.5 block min-h-[96px] font-normal';

type SheetProps = { open: boolean; deal: DirectDeal; caller: string; name: string; onClose: () => void; onDone: () => void };

export function DeliverSheet({ open, deal, caller, onClose, onDone }: SheetProps) {
  const s = useTranslations().dealWorkspace.simple;
  const [proof, setProof] = useState('');
  const move = useMove(onDone);
  return (
    <Sheet open={open} title={s.deliverTitle} onClose={onClose} busy={move.busy}>
      <label className={fieldLabel}>
        {s.proofLabel}
        <textarea value={proof} onChange={(e) => setProof(e.target.value)} dir="auto" maxLength={2000} className={textArea} />
      </label>
      <MoveError error={move.error} />
      <div className="mt-6">
        <button
          type="button"
          disabled={move.busy || !proof.trim()}
          onClick={() => void move.run(() => api.markDelivered(deal.jobId, caller, proof.trim()))}
          className={primaryButton}
        >
          {s.deliverSubmit}
        </button>
      </div>
    </Sheet>
  );
}

export function AnswerTimeSheet({ open, deal, caller, name, onClose, onDone }: SheetProps) {
  const s = useTranslations().dealWorkspace.simple;
  const move = useMove(onDone);
  const ext = deal.extensionRequest;
  const days = ext ? Math.max(1, Math.round(ext.additionalSeconds / DAY_S)) : 0;
  const answer = (decision: 'approved' | 'declined') =>
    void move.run(() => api.respondExtension({ jobId: deal.jobId, caller, decision }));
  return (
    <Sheet open={open} title={s.answerTimeTitle} onClose={onClose} busy={move.busy}>
      <p className="text-[15px] text-[var(--lp-dark)]">{fill(s.answerTimeTemplate, { name, n: days })}</p>
      {ext?.reason ? <p dir="auto" className="mt-3 rounded-[12px] bg-[var(--lp-light)] px-3 py-2 text-[15px] text-[var(--lp-dark)]">{ext.reason}</p> : null}
      <MoveError error={move.error} />
      <div className="mt-6 grid gap-2">
        <button type="button" disabled={move.busy} onClick={() => answer('approved')} className={primaryButton}>{s.giveTime}</button>
        <button type="button" disabled={move.busy} onClick={() => answer('declined')} className={quietButton}>{s.keepDeadline}</button>
      </div>
    </Sheet>
  );
}

export function AnswerCancelSheet({ open, deal, caller, name, onClose, onDone }: SheetProps) {
  const s = useTranslations().dealWorkspace.simple;
  const move = useMove(onDone);
  return (
    <Sheet open={open} title={s.answerCancelTitle} onClose={onClose} busy={move.busy}>
      <p className="text-[15px] text-[var(--lp-dark)]">{fill(s.answerCancelTemplate, { name })}</p>
      {deal.cancellationProposal?.reason ? (
        <p dir="auto" className="mt-3 rounded-[12px] bg-[var(--lp-light)] px-3 py-2 text-[15px] text-[var(--lp-dark)]">{deal.cancellationProposal.reason}</p>
      ) : null}
      <MoveError error={move.error} />
      <div className="mt-6 grid gap-2">
        <button type="button" disabled={move.busy} onClick={() => void move.run(() => api.acceptCancelDirectDeal(deal.jobId, caller))} className={primaryButton}>
          {s.agreeCancel}
        </button>
        <button type="button" disabled={move.busy} onClick={() => void move.run(() => api.declineCancelDirectDeal(deal.jobId, caller))} className={quietButton}>
          {s.keepDeal}
        </button>
      </div>
    </Sheet>
  );
}

export function TurnDownSheet({ open, deal, caller, onClose, onDone }: SheetProps) {
  const s = useTranslations().dealWorkspace.simple;
  const copy = useTranslations().directDealDetail.actionPanel.awaitingAcceptance;
  const [note, setNote] = useState('');
  const move = useMove(onDone);
  return (
    <Sheet open={open} title={s.turnDown} onClose={onClose} busy={move.busy}>
      <label className={fieldLabel}>
        {copy.declineLabel}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} dir="auto" placeholder={copy.declinePlaceholder} className={textArea} />
      </label>
      <MoveError error={move.error} />
      <div className="mt-6">
        <button
          type="button"
          disabled={move.busy || !note.trim()}
          onClick={() => void move.run(() => api.declineDirectDeal(deal.jobId, { caller, note: note.trim() }))}
          className={primaryButton}
        >
          {copy.declineSend}
        </button>
      </div>
    </Sheet>
  );
}

/// The ways out this viewer has at this point. One option opens straight on
/// its form; several are listed first.
export function ProblemSheet({ open, deal, caller, name, options, onClose, onDone }: SheetProps & { options: Problem[] }) {
  const copy = useTranslations().dealWorkspace;
  const s = copy.simple;
  const [chosen, setChosen] = useState<Problem | null>(null);
  const [text, setText] = useState('');
  const [days, setDays] = useState('3');
  const move = useMove(() => {
    setChosen(null);
    setText('');
    onDone();
  });
  const current = options.length === 1 ? options[0]! : chosen;
  const titles: Record<Problem, string> = {
    cancel: copy.cancelDeal.title,
    moreTime: s.moreTimeTitle,
    reclaim: s.reclaimTitle,
    dispute: s.disputeTitle,
    propose: s.proposeTitle,
  };
  const close = () => {
    setChosen(null);
    onClose();
  };
  const dayCount = Number(days);
  const daysValid = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 30;

  return (
    <Sheet open={open} title={current ? titles[current] : s.problem} onClose={close} busy={move.busy}>
      {!current ? (
        <ul className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => setChosen(option)}
                className="flex min-h-14 w-full items-center justify-between text-start text-[15px] font-medium text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {titles[option]}
                <span aria-hidden className="text-[var(--lp-text-sub)] rtl:rotate-180">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : current === 'cancel' ? (
        <>
          <p className="text-[15px] text-[var(--lp-dark)]">{copy.cancelDeal.consequence}</p>
          <MoveError error={move.error} />
          <div className="mt-6">
            <button type="button" data-testid="deal-confirm" disabled={move.busy} onClick={() => void move.run(() => api.cancelDirectDeal(deal.jobId, caller))} className={quietButton}>
              {copy.cancelDeal.cta}
            </button>
          </div>
        </>
      ) : current === 'reclaim' ? (
        <>
          <p className="text-[15px] text-[var(--lp-dark)]">{s.reclaimBody}</p>
          <MoveError error={move.error} />
          <div className="mt-6">
            <button type="button" disabled={move.busy} onClick={() => void move.run(() => api.cancelDirectDeal(deal.jobId, caller))} className={primaryButton}>
              {s.reclaimTitle}
            </button>
          </div>
        </>
      ) : current === 'moreTime' ? (
        <>
          <label className={fieldLabel}>
            {s.daysLabel}
            <span className="mt-1.5 block w-24">
              <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} className="form-input form-input-num" />
            </span>
          </label>
          <label className={`${fieldLabel} mt-4`}>
            {s.reasonLabel}
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} dir="auto" className={textArea} />
          </label>
          <MoveError error={move.error} />
          <div className="mt-6">
            <button
              type="button"
              disabled={move.busy || !daysValid}
              onClick={() => void move.run(() => api.requestExtension({ jobId: deal.jobId, caller, additionalSeconds: dayCount * DAY_S, reason: text.trim() || undefined }))}
              className={primaryButton}
            >
              {s.moreTimeSubmit}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[15px] text-[var(--lp-dark)]">{current === 'dispute' ? s.disputeBody : fill(s.proposeBodyTemplate, { name })}</p>
          <label className={`${fieldLabel} mt-4`}>
            {current === 'dispute' ? s.whatWentWrong : s.reasonLabel}
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={400} dir="auto" className={textArea} />
          </label>
          <MoveError error={move.error} />
          <div className="mt-6">
            <button
              type="button"
              disabled={move.busy || text.trim().length < (current === 'dispute' ? 1 : 3)}
              onClick={() =>
                void move.run(() =>
                  current === 'dispute'
                    ? api.appealDeal(deal.jobId, caller, text.trim())
                    : api.proposeCancelDirectDeal(deal.jobId, caller, text.trim(), 'mutual'),
                )
              }
              className={current === 'dispute' ? quietButton : primaryButton}
            >
              {current === 'dispute' ? s.disputeSubmit : s.proposeSubmit}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
