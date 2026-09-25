'use client';
import { useState } from 'react';
import { api, type DirectDeal } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ConfirmSheet } from '../workspace/ConfirmSheet';
import { v3PanelState, type V3PanelState } from './v3PanelState';

/// The parts of a deal only the terms-driven escrow (v3) has: a deal the
/// seller never accepted, which the buyer can take back, and the dispute path
/// (automatic ruling with its appeal window, then admin review). Renders
/// nothing for a v2 deal or when none of these apply.
export function V3EscrowPanel({ deal, address, onChanged }: {
  deal: DirectDeal;
  address: string | null;
  onChanged: () => void;
}) {
  const copy = useTranslations().escrowV3;
  const { locale } = useLocale();
  const [sheet, setSheet] = useState<'take-back' | 'escalate' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state: V3PanelState = v3PanelState(deal, address, Date.now());
  if (state.kind === 'none') return null;

  const when = (ms: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

  async function confirm() {
    if (!address || !sheet) return;
    setBusy(true);
    setError(null);
    try {
      if (sheet === 'take-back') await api.cancelDirectDeal(deal.jobId, address);
      else await api.escalateDealDispute(deal.jobId, address);
      setSheet(null);
      onChanged();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  const button = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {label}
    </button>
  );

  let body: React.ReactNode;
  let sheetTitle = '';
  let sheetConsequence = '';
  switch (state.kind) {
    case 'unaccepted': {
      const amount = state.refundUsdc;
      body = (
        <>
          <h2 className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.unaccepted.title}</h2>
          <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">
            {state.viewer === 'buyer' ? copy.unaccepted.buyerBody : copy.unaccepted.sellerBody}
          </p>
          {state.viewer === 'buyer' ? button(fill(copy.unaccepted.takeBack, { amount }), () => setSheet('take-back')) : null}
        </>
      );
      sheetTitle = copy.unaccepted.confirmTitle;
      sheetConsequence = fill(copy.unaccepted.confirmConsequence, { amount });
      break;
    }
    case 'ruling': {
      const r = state.ruling;
      const reason =
        r.ruleId === 'R1-no-delivery' ? copy.ruling.reasons.r1
          : r.ruleId === 'R2-checked-delivery' ? copy.ruling.reasons.r2
            : r.ruleId === 'R3-check-failed' ? copy.ruling.reasons.r3
              : null;
      body = (
        <>
          <h2 className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.ruling.title}</h2>
          <p className="mono text-[17px] font-semibold tabular-nums text-[var(--lp-dark)]">
            {fill(copy.ruling.split, { seller: r.toSellerUsdc, buyer: r.toBuyerUsdc })}
          </p>
          {reason ? <p className="text-[15px] text-[var(--lp-dark)]">{reason}</p> : null}
          {r.appealEndsAtMs ? (
            <p className="text-[14px] text-[var(--lp-text-sub)]">{fill(copy.ruling.applies, { date: when(r.appealEndsAtMs) })}</p>
          ) : null}
          {state.canAct ? button(copy.ruling.appeal, () => setSheet('escalate')) : null}
        </>
      );
      sheetTitle = copy.ruling.confirmTitle;
      sheetConsequence = copy.ruling.confirmConsequence;
      break;
    }
    case 'waiting': {
      body = (
        <>
          <h2 className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.waiting.title}</h2>
          <p className="text-[15px] text-[var(--lp-dark)]">{copy.waiting.body}</p>
          {state.escalateOpensAtMs && !state.canAct ? (
            <p className="text-[14px] text-[var(--lp-text-sub)]">{fill(copy.waiting.escalateFrom, { date: when(state.escalateOpensAtMs) })}</p>
          ) : null}
          {state.canAct ? button(copy.waiting.escalate, () => setSheet('escalate')) : null}
        </>
      );
      sheetTitle = copy.waiting.confirmTitle;
      sheetConsequence = copy.waiting.confirmConsequence;
      break;
    }
    case 'review': {
      body = (
        <>
          <h2 className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.review.title}</h2>
          {state.lapseAtMs ? (
            <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{fill(copy.review.body, { date: when(state.lapseAtMs) })}</p>
          ) : null}
        </>
      );
      break;
    }
  }

  return (
    <section aria-live="polite" className="space-y-3">
      {body}
      <ConfirmSheet
        open={sheet !== null}
        title={sheetTitle}
        consequence={sheetConsequence}
        irreversible
        busy={busy}
        error={error}
        onConfirm={() => { void confirm(); }}
        onClose={() => { setSheet(null); setError(null); }}
      />
    </section>
  );
}
