'use client';
import { useEffect, useState } from 'react';
import { ApiError, api, type DirectDeal } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from './presentation';
import type { Problem } from './problems';
import { MAX_DELIVERY_PHOTOS, deliveryNeedsPhoto, deliveryNeedsShipment, deliveryReady, type Shipment } from './delivery';
import { resizePhoto } from '@/features/listings/photos';
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

type Carrier = { slug: string; name: string; needsUrl: boolean };

/// Goods and mixed orders state who carries them and under what reference, so
/// the buyer can follow the shipment; a service hands over its proof.
export function DeliverSheet({ open, deal, caller, onClose, onDone }: SheetProps) {
  const s = useTranslations().dealWorkspace.simple;
  const placeholder = useTranslations().pageBits.dealDetail.containerRefPlaceholder;
  const f = useTranslations().deliveryCard.form;
  const ships = deliveryNeedsShipment(deal.tradeType);
  const photoRequired = deliveryNeedsPhoto(deal);
  const [mode, setMode] = useState<'courier' | 'person'>('courier');
  const [code, setCode] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const [proof, setProof] = useState('');
  const [shipment, setShipment] = useState<Shipment>({ carrier: '', trackingNumber: '', trackingUrl: '' });
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const move = useMove(onDone);
  const carrier = carriers.find((c) => c.slug === shipment.carrier);

  useEffect(() => {
    if (!open || !ships || carriers.length) return;
    let live = true;
    api.listCarriers().then((r) => { if (live) setCarriers(r.carriers); }).catch(() => {});
    return () => { live = false; };
  }, [open, ships, carriers.length]);

  const inPerson = ships && mode === 'person';
  const submit = () =>
    void move.run(() =>
      api.markDelivered(
        deal.jobId,
        caller,
        proof.trim() || undefined,
        ships && !inPerson
          ? {
              carrier: shipment.carrier,
              trackingNumber: shipment.trackingNumber.trim(),
              ...(shipment.trackingUrl.trim() ? { trackingUrl: shipment.trackingUrl.trim() } : {}),
            }
          : undefined,
        { handoverCode: inPerson ? code.trim() : undefined, photos },
      ),
    );

  async function addPhotos(files: FileList | null) {
    setPhotoError(false);
    const picked = Array.from(files ?? []).slice(0, MAX_DELIVERY_PHOTOS - photos.length);
    const added: string[] = [];
    for (const file of picked) {
      try {
        added.push(await resizePhoto(file));
      } catch {
        setPhotoError(true);
      }
    }
    setPhotos((current) => [...current, ...added].slice(0, MAX_DELIVERY_PHOTOS));
  }

  const choice = (on: boolean) =>
    `min-h-11 rounded-full border px-4 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
      on ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]' : 'border-[var(--lp-border-light)] text-[var(--lp-dark)]'
    }`;

  return (
    <Sheet open={open} title={ships ? s.shipTitle : s.deliverTitle} onClose={onClose} busy={move.busy}>
      {ships ? (
        <fieldset className="mb-4">
          <legend className={fieldLabel}>{f.how}</legend>
          <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={mode === 'courier'} onClick={() => setMode('courier')} className={choice(mode === 'courier')}>
              {f.byCourier}
            </button>
            <button type="button" role="radio" aria-checked={mode === 'person'} onClick={() => setMode('person')} className={choice(mode === 'person')}>
              {f.inPerson}
            </button>
          </div>
        </fieldset>
      ) : null}
      {inPerson ? (
        <>
          <label className={`${fieldLabel} block`}>
            {f.codeLabel}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              className="form-input mt-1.5 block font-mono text-[20px] tracking-[0.3em]"
            />
            <span className="mt-1.5 block text-[14px] font-normal text-[var(--lp-text-sub)]">{f.codeNote}</span>
          </label>
          <label className={`${fieldLabel} mt-4 block`}>
            {s.shipNoteLabel}
            <textarea value={proof} onChange={(e) => setProof(e.target.value)} dir="auto" maxLength={2000} className={textArea} />
          </label>
        </>
      ) : ships ? (
        <>
          <fieldset>
            <legend className={fieldLabel}>{s.carrierLabel}</legend>
            <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
              {carriers.map((c) => {
                const on = c.slug === shipment.carrier;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setShipment({ ...shipment, carrier: c.slug })}
                    className={`min-h-11 rounded-full border px-4 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                      on
                        ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]'
                        : 'border-[var(--lp-border-light)] text-[var(--lp-dark)]'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className={`${fieldLabel} mt-4 block`}>
            {s.trackingLabel}
            <input
              value={shipment.trackingNumber}
              onChange={(e) => setShipment({ ...shipment, trackingNumber: e.target.value })}
              maxLength={60}
              placeholder={placeholder}
              className="form-input mt-1.5 block font-normal"
            />
          </label>
          {carrier?.needsUrl ? (
            <label className={`${fieldLabel} mt-4 block`}>
              {s.trackingUrlLabel}
              <input
                value={shipment.trackingUrl}
                onChange={(e) => setShipment({ ...shipment, trackingUrl: e.target.value })}
                maxLength={400}
                inputMode="url"
                dir="ltr"
                placeholder="https://"
                className="form-input mt-1.5 block font-normal"
              />
              <span className="mt-1.5 block text-[14px] font-normal text-[var(--lp-text-sub)]">{s.trackingUrlNote}</span>
            </label>
          ) : null}
          <label className={`${fieldLabel} mt-4 block`}>
            {s.shipNoteLabel}
            <textarea value={proof} onChange={(e) => setProof(e.target.value)} dir="auto" maxLength={2000} className={textArea} />
          </label>
        </>
      ) : (
        <label className={fieldLabel}>
          {s.proofLabel}
          <textarea value={proof} onChange={(e) => setProof(e.target.value)} dir="auto" maxLength={2000} className={textArea} />
        </label>
      )}
      <div className="mt-4">
        <p className={fieldLabel}>{f.photosLabel}</p>
        <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{photoRequired ? f.photosRequired : f.photosOptional}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {photos.map((src, index) => (
            <button
              key={src.slice(-32) + index}
              type="button"
              onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
              aria-label={fill(f.removeTemplate, { n: index + 1 })}
              className="relative overflow-hidden rounded-[12px] border border-[var(--lp-border-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <img src={src} alt="" className="size-16 object-cover" />
              <span aria-hidden className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-[var(--lp-dark)] text-[var(--lp-light)]"><Icon name="close" size={16} /></span>
            </button>
          ))}
          {photos.length < MAX_DELIVERY_PHOTOS ? (
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
              {f.addPhotos}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          ) : null}
        </div>
        {photoError ? <p role="alert" className="mt-1.5 text-[14px] text-[var(--neg)]">{f.photoFailed}</p> : null}
      </div>
      <MoveError error={move.error} />
      <div className="mt-6">
        <button
          type="button"
          disabled={move.busy || !deliveryReady({ tradeType: deal.tradeType, proof, shipment, carrier, handoverCode: inPerson ? code : null, photos: photos.length, photoRequired })}
          onClick={submit}
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
    moreReview: s.moreReviewTitle,
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
          <p className="text-[15px] text-[var(--lp-dark)]">{deal.fundTxHash ? copy.cancelDeal.consequenceFunded : copy.cancelDeal.consequence}</p>
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
      ) : current === 'moreReview' ? (
        <>
          <p className="text-[15px] text-[var(--lp-dark)]">{s.moreReviewBody}</p>
          <MoveError error={move.error} />
          <div className="mt-6">
            <button type="button" disabled={move.busy} onClick={() => void move.run(() => api.stillReviewing(deal.jobId, caller))} className={primaryButton}>
              {s.moreReviewSubmit}
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
