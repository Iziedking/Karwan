'use client';
import { useId, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY } from '@/shared/ui/controls';
import { DETAILS_MAX, TITLE_MAX, offerErrors } from '../formRules';

export interface OfferDraft {
  title: string;
  description: string;
  askingPriceUsdc: number;
  negotiationMaxDecreasePct?: number;
  ttlDays: number;
}

/// What the seller offers, from what price, and how long it stays up. Posting
/// goes through the offer sheet, which sets up the agents first if needed.
export function OfferForm({ onSubmit }: { onSubmit: (draft: OfferDraft) => void }) {
  const t = useTranslations().search.offer;
  const ids = { what: useId(), details: useId(), price: useId(), room: useId(), ttl: useId() };
  const [what, setWhat] = useState('');
  const [details, setDetails] = useState('');
  const [price, setPrice] = useState('');
  const [room, setRoom] = useState('');
  const [ttl, setTtl] = useState('30');
  const [tried, setTried] = useState(false);
  const priceN = Number(price);
  const roomN = room.trim() === '' ? null : Number(room);
  const ttlN = Number(ttl);
  const invalid = new Set(offerErrors({ what, details, price, room, ttl }));
  const errors = {
    what: invalid.has('what') ? t.errors.what : null,
    details: invalid.has('details') ? t.errors.details : null,
    price: invalid.has('price') ? t.errors.price : null,
    room: invalid.has('room') ? t.errors.room : null,
    ttl: invalid.has('ttl') ? t.errors.ttl : null,
  };
  const err = (k: keyof typeof errors) => (tried && errors[k] ? <p className={`${ALERT} mt-2`}>{errors[k]}</p> : null);
  const submit = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    onSubmit({
      title: what.trim(),
      description: details.trim(),
      askingPriceUsdc: priceN,
      negotiationMaxDecreasePct: roomN ?? undefined,
      ttlDays: ttlN,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={ids.what} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.what}</label>
        <input id={ids.what} value={what} onChange={(e) => setWhat(e.target.value)} maxLength={TITLE_MAX} className={`${FIELD} mt-2`} />
        {err('what')}
      </div>
      <div>
        <label htmlFor={ids.details} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.details}</label>
        <textarea id={ids.details} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={DETAILS_MAX} className={`${FIELD} mt-2 py-3`} />
        {err('details')}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <label htmlFor={ids.price} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.price}</label>
          <div className="mt-2 flex items-center gap-2">
            <input id={ids.price} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={`${FIELD} min-w-0 tabular-nums`} />
            <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
          </div>
          {err('price')}
        </div>
        <div className="min-w-0">
          <label htmlFor={ids.ttl} className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.ttl}</label>
          <div className="mt-2 flex items-center gap-2">
            <input id={ids.ttl} inputMode="numeric" value={ttl} onChange={(e) => setTtl(e.target.value)} className={`${FIELD} min-w-0 tabular-nums`} />
            <span className="text-[14px] text-[var(--lp-text-sub)]">{t.days}</span>
          </div>
          {err('ttl')}
        </div>
      </div>
      <div>
        <label htmlFor={ids.room} className="text-[14px] text-[var(--lp-dark)]">{t.room}</label>
        <div className="mt-2 flex items-center gap-2">
          <input id={ids.room} inputMode="numeric" value={room} onChange={(e) => setRoom(e.target.value)} className={`${FIELD} max-w-[120px] tabular-nums`} />
          <span className="text-[14px] text-[var(--lp-text-sub)]">{t.roomUnit}</span>
        </div>
        {err('room')}
      </div>
      <button type="button" className={`${PRIMARY} w-full sm:w-auto`} onClick={submit}>{t.submit}</button>
    </div>
  );
}
