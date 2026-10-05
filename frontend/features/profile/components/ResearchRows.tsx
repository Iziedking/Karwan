'use client';
import { useEffect, useState } from 'react';
import { api, ApiError, type AgentKitResearchStatus } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Row, RowGroup } from '../ui/ProfileUi';

const pill =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

/// Market research for the agents as three plain facts: credit, free reports
/// left today and whether the person is verified. Adding credit asks twice.
export function ResearchRows() {
  const s = useTranslations().profile.simple;
  const [research, setResearch] = useState<{ active: boolean; creditUsdc: number; priceUsdc: number } | null>(null);
  const [kit, setKit] = useState<AgentKitResearchStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.researchStatus()
      .then((next) => { if (!cancelled) setResearch(next); })
      .catch(() => { if (!cancelled) setResearch({ active: false, creditUsdc: 0, priceUsdc: 1.5 }); });
    api.researchAgentKitStatus()
      .then((next) => { if (!cancelled) setKit(next); })
      .catch(() => { if (!cancelled) setKit(null); });
    return () => { cancelled = true; };
  }, []);

  const price = research?.priceUsdc ?? 1.5;
  const reports = kit?.allowance
    ? s.reportsLeftTemplate.replace('{left}', String(kit.allowance.remaining)).replace('{total}', String(kit.allowance.allowance))
    : kit?.allowancePolicy
      ? s.reportsPerDayTemplate.replace('{n}', String(kit.allowancePolicy.reportsPer24Hours))
      : s.notAvailable;
  const verified = !kit || kit.mode === 'unavailable' ? s.notAvailable : kit.verification === 'verified' ? s.yes : s.notYet;

  async function addCredit() {
    if (busy) return;
    if (!confirming) {
      setConfirming(true);
      setMessage(null);
      return;
    }
    setBusy(true);
    try {
      const next = await api.researchActivate();
      setResearch((prev) => ({ priceUsdc: prev?.priceUsdc ?? price, ...next }));
      setMessage({ tone: 'ok', text: s.creditAdded });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError && /insufficient/i.test(err.message) ? s.notEnough : s.tryAgain });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">
        {s.researchTitle}
        <Hint side="bottom">{s.researchHint}</Hint>
      </h2>
      <RowGroup>
        <Row label={s.researchCredit} value={research?.active ? `${research.creditUsdc.toFixed(2)} USDC` : s.none}>
          <button type="button" onClick={() => void addCredit()} disabled={busy} className={pill}>
            {(confirming ? s.confirmCreditTemplate : s.addCreditTemplate).replace('{price}', String(price))}
          </button>
        </Row>
        <Row label={s.freeReports} value={reports} />
        <Row label={s.verifiedPerson} value={verified} />
      </RowGroup>
      {message ? (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className="px-1 text-[14px] text-[var(--lp-dark)]">{message.text}</p>
      ) : null}
    </div>
  );
}
