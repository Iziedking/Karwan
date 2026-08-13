'use client';
import { useEffect, useState } from 'react';
import { api, type VerificationEligibilityResponse } from '@/core/api';
import { PageCard, SectionTag } from '@/shared/components/Bands';

export function VerificationStatusCard({ address }: { address: string }) {
  const [data, setData] = useState<VerificationEligibilityResponse | null>(null);
  useEffect(() => { let cancelled = false; api.getVerificationEligibility(address).then((next) => { if (!cancelled) setData(next); }).catch(() => { if (!cancelled) setData(null); }); return () => { cancelled = true; }; }, [address]);
  if (!data) return null;
  const labels: Record<VerificationEligibilityResponse['verification']['status'], string> = { unverified: 'NOT CERTIFIED', pending: 'UNDER REVIEW', verified: 'CERTIFIED', rejected: 'DECLINED', expired: 'EXPIRED', revoked: 'REVOKED' };
  const tone = data.verification.status === 'verified' ? 'var(--lp-positive)' : data.verification.status === 'pending' ? '#b07d1f' : data.verification.status === 'unverified' ? 'var(--lp-text-muted)' : 'var(--lp-critical)';
  const items: Array<[string, boolean]> = [['Direct deals', data.eligibility.directDeals], ['Agent matching', data.eligibility.agentMatching], ['Reputation access', data.eligibility.reputationEligible]]; if (data.accountKind === 'business') items.push(['Business perks', data.eligibility.businessPerks]);
  return <PageCard className="mt-4 max-w-[560px]"><div className="p-3.5 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-3"><SectionTag>VERIFICATION</SectionTag><span className="mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone }}>{labels[data.verification.status]}</span></div><div className="mt-3 grid gap-x-6 gap-y-0 sm:grid-cols-2">{items.map(([label, enabled]) => <div key={label} className="flex min-h-8 items-center justify-between gap-3 border-t border-[var(--lp-border-light)] py-1.5 text-[12px]"><span className="text-[var(--lp-text-sub)]">{label}</span><span className="mono text-end text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: enabled ? 'var(--lp-positive)' : 'var(--lp-critical)' }}>{enabled ? 'AVAILABLE' : 'CERTIFICATION REQUIRED'}</span></div>)}</div>{data.eligibility.reasons.length > 0 ? <p className="mt-2 text-[10px] leading-snug text-white/45">{data.eligibility.reasons.join(' · ')} · policy {data.eligibility.policyVersion}</p> : null}</div></PageCard>;
}