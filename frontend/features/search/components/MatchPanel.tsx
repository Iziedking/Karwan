'use client';
import { useId, useState } from 'react';
import { api, type BuyerJob, type MatchProposal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { FundAgentButton } from '@/features/money/components/FundAgentButton';
import { ALERT, FIELD, PRIMARY, QUIET, SECONDARY } from '@/shared/ui/controls';
import type { RequestAction, RequestView } from '../requestView';

type Acting = Exclude<RequestAction, 'openDeal' | 'editRequest' | 'cancelRequest' | 'addFunds'>;

/// The one action the request page offers and its quiet alternatives. Every
/// call is an existing route; this only decides which button shows.
export function MatchPanel({
  view,
  job,
  proposal,
  me,
  onChanged,
}: {
  view: RequestView;
  job: BuyerJob;
  proposal: MatchProposal | null;
  me: string;
  onChanged: () => void;
}) {
  const t = useTranslations().search.request;
  const raiseId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [raising, setRaising] = useState(false);
  const [raisePrice, setRaisePrice] = useState('');

  const addFunds = view.primary === 'addFunds';
  const actions = [view.primary, ...view.secondary].filter(
    (a): a is Acting => !!a && a !== 'openDeal' && a !== 'editRequest' && a !== 'cancelRequest' && a !== 'addFunds',
  );
  if (actions.length === 0 && !addFunds) return null;

  const run = async (call: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await call();
      onChanged();
      return true;
    } catch {
      setError(true);
      // The failure may be the state having moved on (a raise, a short
      // agent); refetch so the page offers what can actually be done.
      onChanged();
      return false;
    } finally {
      setBusy(false);
    }
  };
  const act = (action: Acting) => {
    if (action === 'raiseMatch') {
      setRaising(true);
      return;
    }
    void run(() => {
      switch (action) {
        case 'acceptMatch':
        case 'acceptRaise':
          return api.approveMatch(job.jobId, me);
        case 'declineMatch':
        case 'declineRaise':
          return api.declineMatch(job.jobId, me);
        case 'proceedNearMiss':
          return api.proceedNearMiss(job.jobId, me);
        case 'declineNearMiss':
          return api.declineNearMiss(job.jobId, me);
        case 'reconsider':
          return api.reconsiderPassed(job.jobId, me);
      }
    });
  };
  const sendRaise = async () => {
    const price = Number(raisePrice);
    if (!Number.isFinite(price) || price <= 0) return;
    if (await run(() => api.raiseMatchOffer(job.jobId, me, String(price)))) setRaising(false);
  };
  const label = (a: Acting) =>
    a === 'acceptRaise' || a === 'proceedNearMiss' || a === 'reconsider'
      ? fill(t.actions[a], { price: view.priceUsdc ?? '' })
      : t.actions[a];

  return (
    <div className="space-y-3">
      {raising ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={raiseId} className="text-[14px] text-[var(--lp-dark)]">{t.raise.label}</label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id={raiseId}
                inputMode="decimal"
                value={raisePrice}
                onChange={(e) => setRaisePrice(e.target.value)}
                className={`${FIELD} max-w-[140px] tabular-nums`}
              />
              <span className="text-[14px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
            </div>
          </div>
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => void sendRaise()}>{t.raise.send}</button>
          <button type="button" className={QUIET} onClick={() => setRaising(false)}>{t.raise.cancel}</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {addFunds ? <FundAgentButton amountUsdc={Number(view.topUpUsdc ?? 0)} onFunded={onChanged} /> : null}
          {actions.map((a) => (
            <button key={a} type="button" className={a === view.primary ? PRIMARY : SECONDARY} disabled={busy} onClick={() => act(a)}>
              {label(a)}
            </button>
          ))}
        </div>
      )}
      {error ? <p role="alert" className={ALERT}>{t.error}</p> : null}
      {proposal?.riskNote && view.viewer === 'seller' ? (
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{proposal.riskNote}</p>
      ) : null}
    </div>
  );
}
