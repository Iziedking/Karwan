'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/core/api';
import {
  SOURCE_ROUTE_SNAPSHOT,
  filterAdminRoutes,
  workspaceForRoute,
  type AdminRouteAccess,
  type AdminRouteRecord,
  type AdminRouteRisk,
} from '@/features/admin/routeCatalog';

const accessFilters: Array<{ value: AdminRouteAccess | 'all'; label: string }> = [
  { value: 'all', label: 'All access' },
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Support' },
  { value: 'application', label: 'Application' },
  { value: 'service', label: 'Service' },
  { value: 'public', label: 'Public' },
];

const riskFilters: Array<{ value: AdminRouteRisk | 'all'; label: string }> = [
  { value: 'all', label: 'All operations' },
  { value: 'read', label: 'Read' },
  { value: 'change', label: 'Change' },
  { value: 'destructive', label: 'Destructive' },
  { value: 'ingress', label: 'Ingress' },
];

function MethodBadge({ method }: { method: string }) {
  const tone = method === 'GET' || method === 'HEAD'
    ? 'border-[#6eb47b]/30 bg-[#6eb47b]/10 text-[#8ed49a]'
    : method === 'DELETE'
      ? 'border-[#5A2A2E] bg-[#3A1C1F] text-[var(--d-red)]'
      : 'border-[#dfad58]/30 bg-[#dfad58]/10 text-[#f0c87e]';
  return <span className={`inline-flex min-h-7 min-w-[58px] items-center justify-center rounded-md border px-2 font-mono text-[9px] font-bold ${tone}`}>{method}</span>;
}

export default function AdminRouteDirectoryPage() {
  const [routes, setRoutes] = useState<AdminRouteRecord[]>(SOURCE_ROUTE_SNAPSHOT);
  const [source, setSource] = useState<'runtime' | 'source'>('source');
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState<AdminRouteAccess | 'all'>('all');
  const [risk, setRisk] = useState<AdminRouteRisk | 'all'>('all');
  const [visible, setVisible] = useState(60);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.adminRouteCatalog()
      .then((response) => {
        if (cancelled || response.routes.length === 0) return;
        setRoutes(response.routes);
        setSource('runtime');
      })
      .catch(() => {
        if (!cancelled) setSource('source');
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => filterAdminRoutes(routes, { query, access, risk }),
    [routes, query, access, risk],
  );
  const shown = filtered.slice(0, visible);
  const adminCount = routes.filter((route) => route.access === 'admin').length;
  const changeCount = routes.filter((route) => route.risk === 'change' || route.risk === 'destructive').length;
  const linkedCount = routes.filter((route) => workspaceForRoute(route.path)).length;

  async function copyRoute(route: AdminRouteRecord) {
    try {
      await navigator.clipboard.writeText(`${route.method} ${route.path}`);
      setCopied(route.id);
      window.setTimeout(() => setCopied((current) => current === route.id ? null : current), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-[var(--d-line)] pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-[720px]">
          <p className="text-[9px] font-bold text-[var(--d-lime)]">Backend map</p>
          <h1 className="mt-3 font-sans text-[clamp(30px,4vw,48px)] font-semibold leading-none tracking-[-0.035em]">API directory</h1>
          <p className="mt-4 text-[13px] leading-6 text-[var(--d-text-2)]">Every mounted backend endpoint is searchable here. Reviewed workspaces handle real operator actions; routes without a workspace remain visible for engineering traceability.</p>
        </div>
        <div className={`inline-flex min-h-11 items-center gap-2 self-start rounded-full border px-3 text-[9px] xl:self-auto ${source === 'runtime' ? 'border-[#3D4A22] bg-[#1F2614] text-[var(--d-lime)]' : 'border-[#dfad58]/30 bg-[#dfad58]/8 text-[#f0c87e]'}`}>
          <span className={`size-2 rounded-full ${source === 'runtime' ? 'bg-[var(--d-lime)]' : 'bg-[#dfad58]'}`} />
          {source === 'runtime' ? 'Live backend inventory' : 'Source snapshot, backend deploy pending'}
        </div>
      </div>

      <section aria-label="Route coverage" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Mounted routes', routes.length],
          ['Admin routes', adminCount],
          ['State-changing', changeCount],
          ['Linked to tools', linkedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[var(--d-line)] bg-[#121315] p-4">
            <p className="text-[9px] text-[var(--d-text-3)]">{label}</p>
            <p className="mt-2 text-[26px] font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-[var(--d-line)] bg-[#101113] p-3 sm:p-4">
        <label htmlFor="route-search" className="text-[9px] font-bold text-[var(--d-text-2)]">Find an operation</label>
        <input
          id="route-search"
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setVisible(60); }}
          placeholder="Search method, path, family, or workspace"
          className="mt-2 min-h-12 w-full rounded-lg border border-[var(--d-line)] bg-[#0b0c0d] px-4 text-[13px] text-[var(--d-text)] outline-none transition placeholder:text-[var(--d-text-3)] focus:border-[#3D4A22]"
        />
        <div className="mt-4">
          <p className="text-[9px] text-[var(--d-text-3)]">Access</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {accessFilters.map((item) => (
              <button key={item.value} type="button" aria-pressed={access === item.value} onClick={() => { setAccess(item.value); setVisible(60); }} className={`min-h-11 rounded-full border px-3 text-[9px] font-bold transition ${access === item.value ? 'border-[#3D4A22] bg-[#1F2614] text-[var(--d-lime)]' : 'border-[var(--d-line)] text-[var(--d-text-2)] hover:border-[var(--d-line-2)] hover:text-[var(--d-text)]'}`}>{item.label}</button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[9px] text-[var(--d-text-3)]">Effect</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {riskFilters.map((item) => (
              <button key={item.value} type="button" aria-pressed={risk === item.value} onClick={() => { setRisk(item.value); setVisible(60); }} className={`min-h-11 rounded-full border px-3 text-[9px] font-bold transition ${risk === item.value ? 'border-[#3D4A22] bg-[#1F2614] text-[var(--d-lime)]' : 'border-[var(--d-line)] text-[var(--d-text-2)] hover:border-[var(--d-line-2)] hover:text-[var(--d-text)]'}`}>{item.label}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p aria-live="polite" className="text-[12px] text-[var(--d-text-2)]">Showing {Math.min(shown.length, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} matching routes</p>
        {(query || access !== 'all' || risk !== 'all') && (
          <button type="button" onClick={() => { setQuery(''); setAccess('all'); setRisk('all'); setVisible(60); }} className="min-h-11 rounded-lg px-3 text-[9px] font-bold text-[var(--d-text-2)] hover:bg-[var(--d-surface)] hover:text-[var(--d-text)]">Clear filters</button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-[var(--d-line)] px-5 py-14 text-center">
          <p className="text-[15px] font-bold">No routes match these filters.</p>
          <p className="mt-2 text-[12px] text-[var(--d-text-2)]">Clear a filter or search for a broader operation.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--d-line)] bg-[#101113]">
          {shown.map((route) => {
            const workspace = workspaceForRoute(route.path);
            return (
              <article key={route.id} className="grid gap-3 border-b border-[var(--d-line)] p-4 last:border-b-0 md:grid-cols-[70px_minmax(0,1fr)_130px_180px] md:items-center">
                <div><MethodBadge method={route.method} /></div>
                <div className="min-w-0">
                  <code className="block overflow-x-auto whitespace-nowrap font-mono text-[11px] text-[var(--d-text)]">{route.path}</code>
                  <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-[var(--d-text-3)]">
                    <span>{route.family}</span><span aria-hidden="true">·</span><span>{route.access}</span><span aria-hidden="true">·</span><span>{route.risk}</span>
                  </div>
                </div>
                <div>
                  {workspace ? <Link href={workspace.href} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--d-line)] px-3 text-[10px] font-semibold text-[var(--d-text-2)] transition hover:border-[#3D4A22] hover:text-[var(--d-text)]">{workspace.label}</Link> : <span className="text-[10px] text-[var(--d-text-3)]">Catalog only</span>}
                </div>
                <button type="button" onClick={() => void copyRoute(route)} className="min-h-11 rounded-lg border border-[var(--d-line)] px-3 text-[9px] font-bold text-[var(--d-text-2)] transition hover:border-[var(--d-line-2)] hover:text-[var(--d-text)]">
                  {copied === route.id ? 'Copied' : 'Copy method + path'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {visible < filtered.length && (
        <button type="button" onClick={() => setVisible((current) => current + 60)} className="mt-5 min-h-12 w-full rounded-lg border border-[var(--d-line)] text-[10px] font-bold text-[var(--d-text-2)] transition hover:border-[var(--d-line-2)] hover:bg-[var(--d-hover)] hover:text-[var(--d-text)]">Show 60 more</button>
      )}

      <aside className="mt-6 rounded-lg border border-[#dfad58]/20 bg-[#dfad58]/6 p-4">
        <p className="text-[9px] font-bold text-[#f0c87e]">Execution boundary</p>
        <p className="mt-2 max-w-[900px] text-[11px] leading-5 text-[var(--d-text-2)]">The directory does not turn arbitrary mutation routes into unreviewed buttons. Financial, destructive, webhook, and customer-session operations remain behind their purpose-built workflow or service credential, where recipients, cost, authority, reversibility, and outcome can be reviewed before execution.</p>
      </aside>
    </div>
  );
}
