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
  return <PageCard className="mt-5"><div className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><SectionTag>VERIFICATION</SectionTag><span className="mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone }}>{labels[data.verification.status]}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map(([label, enabled]) => <div key={label} className="flex items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-2 text-[13px]"><span className="text-[var(--lp-text-sub)]">{label}</span><span className="mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: enabled ? 'var(--lp-positive)' : 'var(--lp-critical)' }}>{enabled ? 'AVAILABLE' : 'CERTIFICATION REQUIRED'}</span></div>)}</div>{data.eligibility.reasons.length > 0 ? <p className="mt-3 text-[12px] leading-relaxed text-[var(--lp-text-muted)]">{data.eligibility.reasons.join(' · ')} · policy {data.eligibility.policyVersion}</p> : null}</div></PageCard>;
}