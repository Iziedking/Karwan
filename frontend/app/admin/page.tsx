'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type AdminDealRow,
  type AdminProfileRow,
  type AdminTicketRow,
} from '@/core/api';
import { SOURCE_ROUTE_SNAPSHOT } from '@/features/admin/routeCatalog';

interface HealthView {
  overall: 'healthy' | 'degraded';
  infrastructure: Array<{ label: string; ok: boolean }>;
  watchers: Array<{ status: 'healthy' | 'stalled' | 'missing' | 'dormant' | 'starting' }>;
  crons: Array<{ status: 'fresh' | 'stale' | 'unknown' }>;
  contracts: Array<{ ok: boolean }>;
}

interface ControlRoomData {
  deals: AdminDealRow[];
  profiles: AdminProfileRow[];
  tickets: AdminTicketRow[];
  pendingBusinesses: number;
  health: HealthView | null;
}

function NumberCard({ label, value, detail, href, urgent = false }: {
  label: string;
  value: number;
  detail: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link href={href} className={`group min-h-[132px] rounded-xl border-l-2 border-y border-r p-4 transition ${urgent && value > 0 ? 'border-l-[#e0794f] border-y-[#e0794f]/25 border-r-[#e0794f]/25 bg-[#171214] hover:border-y-[#e0794f]/50 hover:border-r-[#e0794f]/50' : 'border-l-transparent border-y-white/10 border-r-white/10 bg-[#111114] hover:border-l-[#AFC95B] hover:border-y-white/20 hover:border-r-white/20'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</p>
        <span aria-hidden="true" className="text-[15px] text-white/25 transition group-hover:translate-x-0.5 group-hover:text-[#AFC95B]">&rarr;</span>
      </div>
      <p className="mt-3 text-[32px] font-black leading-none tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-3 text-[10px] leading-4 text-white/38">{detail}</p>
    </Link>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState<ControlRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const [deals, profiles, tickets, businesses, health] = await Promise.allSettled([
      api.adminDeals(),
      api.adminProfiles(),
      api.adminSupportList(),
      api.adminBusinessPending(),
      api.adminHealth(),
    ]);
    const hasCoreFailure = deals.status === 'rejected' || profiles.status === 'rejected';
    if (hasCoreFailure) setFailed(true);
    setData({
      deals: deals.status === 'fulfilled' ? deals.value.deals : [],
      profiles: profiles.status === 'fulfilled' ? profiles.value.profiles : [],
      tickets: tickets.status === 'fulfilled' ? tickets.value.tickets : [],
      pendingBusinesses: businesses.status === 'fulfilled' ? businesses.value.pending.length : 0,
      health: health.status === 'fulfilled' ? health.value : null,
    });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const view = useMemo(() => {
    const deals = data?.deals ?? [];
    const profiles = data?.profiles ?? [];
    const disputed = deals.filter((deal) => deal.stage === 'disputed').length;
    const active = deals.filter((deal) => ['open', 'accepted', 'delivered'].includes(deal.stage)).length;
    // The support list endpoint returns open conversations only.
    const openTickets = data?.tickets.length ?? 0;
    const unhealthyInfrastructure = data?.health?.infrastructure.filter((item) => !item.ok).length ?? 0;
    const unhealthyWatchers = data?.health?.watchers.filter((item) => item.status === 'stalled' || item.status === 'missing').length ?? 0;
    const staleCrons = data?.health?.crons.filter((item) => item.status === 'stale').length ?? 0;
    const unhealthyContracts = data?.health?.contracts.filter((item) => !item.ok).length ?? 0;
    return {
      deals,
      profiles,
      disputed,
      active,
      openTickets,
      systemIssues: unhealthyInfrastructure + unhealthyWatchers + staleCrons + unhealthyContracts,
    };
  }, [data]);

  const queues = [
    { label: 'Open disputes', value: view.disputed, href: '/admin/disputes', copy: view.disputed ? 'Rulings require operator review.' : 'No deal rulings waiting.' },
    { label: 'Business checks', value: data?.pendingBusinesses ?? 0, href: '/admin/business', copy: data?.pendingBusinesses ? 'Evidence is waiting for a decision.' : 'Verification queue is clear.' },
    { label: 'Support tickets', value: view.openTickets, href: '/admin/support', copy: view.openTickets ? 'Customers are waiting for a response.' : 'No open customer conversations.' },
    { label: 'System issues', value: view.systemIssues, href: '/admin/diagnostics', copy: view.systemIssues ? 'One or more checks need attention.' : 'No degraded checks reported.' },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-white/10 pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-[720px]">
          <p className="mono text-[9px] font-bold uppercase tracking-[0.17em] text-[#AFC95B]">[:CONTROL ROOM:]</p>
          <h1 className="mt-3 font-sans text-[clamp(32px,4vw,52px)] font-black leading-none tracking-[-0.04em]">What needs attention now?</h1>
          <p className="mt-4 text-[13px] leading-6 text-white/48">Start with exceptions, then monitor active trade and agent work. Wallet signing remains disconnected until a reviewed on-chain action needs it.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 self-start rounded-lg border border-white/12 px-4 mono text-[9px] font-bold uppercase tracking-[0.12em] text-white/55 transition hover:border-white/25 hover:text-white disabled:opacity-45 xl:self-auto">{loading ? 'Refreshing...' : 'Refresh control room'}</button>
      </div>

      {failed && (
        <div role="alert" className="mt-5 flex flex-col gap-3 rounded-xl border border-[#e0794f]/25 bg-[#e0794f]/7 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[12px] font-bold text-[#efaa8d]">Some core operational data is unavailable.</p><p className="mt-1 text-[10px] text-white/40">Existing workspaces remain available. Retry before making a decision from these counts.</p></div>
          <button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-[#e0794f]/30 px-3 mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#efaa8d]">Retry</button>
        </div>
      )}

      <section aria-labelledby="attention-heading" className="mt-7">
        <div className="flex items-end justify-between gap-4"><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-white/30">Priority queue</p><h2 id="attention-heading" className="mt-2 text-[18px] font-extrabold">Review before routine work</h2></div><p className="text-[10px] text-white/28">Live operator data</p></div>
        {loading && !data ? (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[132px] animate-pulse rounded-xl border border-white/8 bg-white/[0.025]" />)}</div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {queues.map((queue) => <NumberCard key={queue.label} {...queue} detail={queue.copy} urgent />)}
          </div>
        )}
      </section>

      <section aria-labelledby="business-heading" className="mt-8">
        <p className="mono text-[9px] uppercase tracking-[0.15em] text-white/30">Operating picture</p>
        <h2 id="business-heading" className="mt-2 text-[18px] font-extrabold">Trade network</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <NumberCard label="Active deals" value={view.active} detail="Open, agreed, or delivered." href="/admin/deals" />
          <NumberCard label="Settled deals" value={view.deals.filter((deal) => deal.stage === 'settled').length} detail="Completed settlement records." href="/admin/deals" />
          <NumberCard label="Profiles" value={view.profiles.length} detail="People and business accounts." href="/admin/profiles" />
          <NumberCard label="Verified businesses" value={view.profiles.filter((profile) => profile.accountType === 'business' && profile.businessStatus === 'verified').length} detail="Approved trade identities." href="/admin/business" />
        </div>
      </section>

      <section aria-labelledby="workspaces-heading" className="mt-8 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-white/10 bg-[#121315] p-5">
          <div className="flex items-start justify-between gap-4"><div><p className="mono text-[9px] uppercase tracking-[0.15em] text-white/30">Fast paths</p><h2 id="workspaces-heading" className="mt-2 text-[18px] font-extrabold">Common operator workflows</h2></div><span className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-3 mono text-[8px] uppercase tracking-[0.11em] text-white/35">Reviewed actions</span></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              ['/admin/matching', 'Review agent matches', 'Assess evidence and ranking quality.'],
              ['/admin/runtime', 'Inspect agent execution', 'Trace tasks, parity, and rollout readiness.'],
              ['/admin/business', 'Verify a business', 'Review submitted company evidence.'],
              ['/admin/treasury', 'Review treasury posture', 'Confirm authority before any transfer.'],
              ['/admin/errors', 'Triage a failure', 'Diagnose recent operational errors.'],
              ['/admin/team', 'Manage team access', 'Invite, disable, or remove operators.'],
            ].map(([href, label, copy]) => (
              <Link key={href} href={href} className="group min-h-[82px] rounded-lg border border-white/8 p-3 transition hover:border-[#AFC95B]/35 hover:bg-[#AFC95B]/[0.04]"><span className="flex items-center justify-between gap-3 text-[12px] font-bold text-white/75 group-hover:text-white">{label}<span aria-hidden="true" className="text-[#AFC95B]">→</span></span><span className="mt-2 block text-[10px] leading-4 text-white/33">{copy}</span></Link>
            ))}
          </div>
        </div>

        <Link href="/admin/routes" className="group flex min-h-[280px] flex-col justify-between rounded-xl border border-white/10 border-t-2 border-t-[#AFC95B] bg-[#111114] p-5 transition hover:border-white/20">
          <div><p className="mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#AFC95B]">Complete backend map</p><p className="mt-4 text-[44px] font-black leading-none tabular-nums">{SOURCE_ROUTE_SNAPSHOT.length}</p><p className="mt-2 text-[12px] font-bold text-white/75">mounted endpoints captured</p><p className="mt-4 text-[10px] leading-5 text-white/38">Search every admin, application, service, webhook, and public route. Routes with reviewed tools link directly to their workspace.</p></div>
          <span className="mt-6 inline-flex min-h-11 items-center justify-between rounded-lg border border-[#AFC95B]/35 px-3 mono text-[9px] font-bold uppercase tracking-[0.11em] text-[#AFC95B]">Open API directory <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span></span>
        </Link>
      </section>
    </div>
  );
}
