'use client';

import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

interface DisputePolicy {
  reviewWindowMs: number;
  delayAppealGraceMs: number;
  delayAppealResponseMs: number;
  deadlineReclaimGraceMs: number;
  disputeTimeoutMs: number;
}

/// Mono instrument formatting for a policy duration, locale-neutral units.
function fmtPolicy(ms: number): string {
  if (ms >= 36 * 3_600_000) return `${Math.round(ms / 86_400_000)}d`;
  if (ms >= 90 * 60_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 90_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1_000)}s`;
}

/// The published dispute timelines. The differentiator vs marketplace dispute
/// pages: the numbers are FETCHED from the live platform config (the same
/// values the watcher enforces), so the published process cannot drift from
/// the running one. Placeholders substitute into the i18n strings.
export default function DocsDisputesPage() {
  const t = useTranslations().docsDisputesPage;
  const [policy, setPolicy] = useState<DisputePolicy | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .disputePolicy()
      .then((p) => !cancelled && setPolicy(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // '—' until the live read lands; never a hardcoded number that could lie.
  const v = {
    reviewWindow: policy ? fmtPolicy(policy.reviewWindowMs) : '—',
    appealGrace: policy ? fmtPolicy(policy.delayAppealGraceMs) : '—',
    buyerResponse: policy ? fmtPolicy(policy.delayAppealResponseMs) : '—',
    reclaimGrace: policy ? fmtPolicy(policy.deadlineReclaimGraceMs) : '—',
    disputeTimeout: policy ? fmtPolicy(policy.disputeTimeoutMs) : '—',
  };
  const sub = (s: string) =>
    s
      .replace('{reviewWindow}', v.reviewWindow)
      .replace('{appealGrace}', v.appealGrace)
      .replace('{buyerResponse}', v.buyerResponse)
      .replace('{reclaimGrace}', v.reclaimGrace)
      .replace('{disputeTimeout}', v.disputeTimeout);

  const cells: { label: string; value: string }[] = [
    { label: t.policy.reviewWindow, value: v.reviewWindow },
    { label: t.policy.appealGrace, value: v.appealGrace },
    { label: t.policy.buyerResponse, value: v.buyerResponse },
    { label: t.policy.reclaimGrace, value: v.reclaimGrace },
    { label: t.policy.disputeTimeout, value: v.disputeTimeout },
  ];

  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.title}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      {/* Live policy strip: hairline cells, one value each, LED-tagged live. */}
      <div
        className="mt-8 border border-[var(--lp-border-light)] bg-[var(--lp-card)] overflow-hidden"
        style={{ borderRadius: 3 }}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--lp-border-light)]">
          <span
            aria-hidden
            data-instrument-blink
            className="inline-block w-[6px] h-[6px]"
            style={{
              background: 'var(--lp-accent)',
              animation: 'instrumentBlink 1.6s ease-in-out infinite',
            }}
          />
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {t.policy.liveTag}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-[var(--lp-border-light)]">
          {cells.map((cell) => (
            <div key={cell.label} className="px-4 py-3">
              <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] leading-snug">
                {cell.label}
              </p>
              <p className="mt-1 mono text-[20px] font-semibold tabular-nums leading-none text-[var(--lp-dark)]">
                {cell.value}
              </p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
        {t.policy.note}
      </p>

      <DocsH2>{t.buyerSilent.heading}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.buyerSilent.s1.label}</strong> {sub(t.buyerSilent.s1.body)}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.buyerSilent.s2.label}</strong> {sub(t.buyerSilent.s2.body)}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.buyerSilent.s3.label}</strong> {sub(t.buyerSilent.s3.body)}
        </DocsListItem>
      </DocsList>

      <DocsH2>{t.sellerLate.heading}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.sellerLate.s1.label}</strong> {sub(t.sellerLate.s1.body)}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.sellerLate.s2.label}</strong> {sub(t.sellerLate.s2.body)}
        </DocsListItem>
      </DocsList>

      <DocsH2>{t.disputed.heading}</DocsH2>
      <DocsP>{t.disputed.intro}</DocsP>
      <DocsList>
        <DocsListItem>
          <strong>{t.disputed.s1.label}</strong> {sub(t.disputed.s1.body)}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.disputed.s2.label}</strong> {sub(t.disputed.s2.body)}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.disputed.s3.label}</strong> {sub(t.disputed.s3.body)}
        </DocsListItem>
      </DocsList>

      <DocsCallout title={t.callout.title}>{t.callout.body}</DocsCallout>
    </article>
  );
}
