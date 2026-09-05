'use client';

import { useEffect, useState } from 'react';
import { api, type AgentKitResearchStatus } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function AgentTrustEvidenceCard() {
  const copy = useTranslations().profile.agentTrustCard;
  const [status, setStatus] = useState<AgentKitResearchStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.researchAgentKitStatus()
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  const checked = status?.verification === 'not-checked' && status.mode === 'sandbox-ready';
  const statusLabel = checked ? copy.notChecked : copy.unavailable;
  const allowance = status ? `${status.allowancePolicy.reportsPer24Hours} / 24h` : copy.unavailable;

  return (
    <section
      aria-labelledby="agent-trust-card-title"
      className="min-w-0 border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4 sm:p-5"
      style={{ borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">[:{copy.tag}:]</p>
          <h3 id="agent-trust-card-title" className="mt-1.5 font-sans text-[17px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {copy.headline}
          </h3>
        </div>
        <span className="shrink-0 mono px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]" style={{ background: 'rgba(0,0,0,0.05)', borderRadius: 4 }}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--lp-text-sub)]">{copy.body}</p>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <TrustRow label={copy.humanBacked} value={statusLabel} />
        <TrustRow label={copy.trackRecord} value={copy.notChecked} />
        <TrustRow label={copy.connectedEvidence} value={copy.noEvidence} />
        <TrustRow label={copy.pilotAllowance} value={allowance} mono />
      </dl>
      {!checked && <p className="mt-3 text-[11px] leading-snug text-[var(--lp-text-muted)]">{copy.notCheckedBody}</p>}
    </section>
  );
}

function TrustRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-3 py-2.5">
      <dt className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">{label}</dt>
      <dd className={`mt-1 break-words text-[12px] leading-snug text-[var(--lp-dark)] ${mono ? 'mono tabular-nums' : ''}`}>{value}</dd>
    </div>
  );
}
