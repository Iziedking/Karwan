'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/core/api';
import { DealRulesSwitch } from '@/features/admin/DealRulesSwitch';

/// Operator diagnostics. A backend-health overview (model gateway, operator
/// funds, infrastructure, feature flags) plus an agent-seed tool that can fund
/// an account whose agents activated unfunded. Read-only except the seed.

type Health = Awaited<ReturnType<typeof api.adminHealth>>;
type SeedStatus = Awaited<ReturnType<typeof api.adminAgentSeedStatus>>;
type Older = Awaited<ReturnType<typeof api.adminOlderContracts>>['contracts'];
type SeedRun = Awaited<ReturnType<typeof api.adminAgentSeedRun>>;
type PagePolicy = Awaited<ReturnType<typeof api.adminPagePolicy>>;

const PANEL = 'bg-[var(--d-surface)] border border-[var(--d-line)] rounded-lg p-6';
const CARD = 'bg-[var(--d-surface)] border border-[var(--d-line)] rounded-lg p-5';
const LABEL = 'text-[10px] text-[var(--d-text-2)]';
const BTN =
  'shrink-0 text-[11px] font-bold px-4 py-2.5 rounded-lg bg-[var(--d-text)] text-[#0D0E10] disabled:opacity-50 transition';
const INPUT =
  'w-full bg-[var(--d-bg)] border border-[var(--d-line)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--d-text)] font-mono focus:border-[var(--d-line-2)] outline-none';

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed';
}

function short(s: string): string {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: ok ? 'var(--lp-accent)' : '#e0794f' }}
    />
  );
}

const GREEN = 'var(--lp-accent)';
const AMBER = '#e0794f';
const GREY = 'rgba(255,255,255,0.25)';

function StatusDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
  );
}

function fmtSpan(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

function fmtAge(ms: number | null): string {
  if (ms == null) return 'never';
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function watcherColor(status: Health['watchers'][number]['status']): string {
  if (status === 'healthy') return GREEN;
  // Grey, not amber: dormant is switched off and starting is simply not due yet.
  // Neither is a fault, and colouring them as one is what made a healthy deal
  // watcher read as an incident.
  if (status === 'dormant' || status === 'starting') return GREY;
  return AMBER;
}

function watcherDetail(w: Health['watchers'][number]): string {
  if (w.status === 'dormant') return 'dormant (disabled)';
  if (w.status === 'starting') return 'not due yet';
  if (w.status === 'missing') return 'not ticking';
  if (w.status === 'stalled') return `stalled · last ${fmtAge(w.ageMs)}`;
  return `${fmtAge(w.ageMs)} · ${w.runs} ticks`;
}

function cronColor(status: Health['crons'][number]['status']): string {
  return status === 'fresh' ? GREEN : status === 'unknown' ? GREY : AMBER;
}

function cronDetail(cr: Health['crons'][number]): string {
  if (cr.status === 'unknown') return cr.detail ?? 'no record yet';
  if (cr.status === 'fresh') return `ran ${cr.lastRunDate}${cr.detail ? ` · ${cr.detail}` : ''}`;
  return `stale · last ${cr.lastRunDate ?? '—'}`;
}

export default function AdminDiagnostics() {
  return (
    <div className="space-y-8">
      <div>
        <p className={LABEL}>Diagnostics</p>
        <h1 className="mt-2 font-sans text-[26px] font-semibold text-[var(--d-text)]">Diagnostics</h1>
        <p className="mt-1 text-[13px] text-[var(--d-text-2)] max-w-[64ch]">
          Live backend health and the agent gas seed, so a failing model key, an unfunded operator
          wallet, a stalled watcher, or a cron that stopped firing is visible without reading logs.
        </p>
      </div>
      <HealthOverview />
      <PagePolicyPanel />
      <DealRulesSwitch />
      <OlderContractsPanel />
      <AgentSeedPanel />
    </div>
  );
}

/// What the page policy blocked in the last 30 days, by rule and host (view 70).
/// Before the policy is enforced, every row here is either added to the host
/// list or explained.
function PagePolicyPanel() {
  const [data, setData] = useState<PagePolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.adminPagePolicy().then(setData, (e) => setError(errMsg(e)));
  }, []);
  return (
    <HealthCard title="Blocked by the page policy">
      {error ? <HealthItem ok={false}>Could not read: {error}</HealthItem> : null}
      {data && data.blocked.length === 0 ? <HealthItem ok>Nothing blocked since {data.since}</HealthItem> : null}
      {data && data.blocked.length > 0 ? (
        <>
          <p className="text-[12px] text-[var(--d-text-2)] pb-1">
            {data.total} reports since {data.since}
          </p>
          {data.blocked.slice(0, 40).map((b) => (
            <HealthItem key={`${b.directive} ${b.blocked}`} ok={false}>
              <span className="text-[11.5px]">{b.blocked}</span>{' '}
              <span className="text-[var(--d-text-2)]">
                {b.directive} · {b.count} · last {b.lastSeen}
              </span>
            </HealthItem>
          ))}
        </>
      ) : null}
    </HealthCard>
  );
}

function HealthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={CARD}>
      <p className={LABEL}>{title}</p>
      <div className="mt-3 space-y-1.5 text-[12.5px]">{children}</div>
    </div>
  );
}

function HealthItem({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1">
        <Dot ok={ok} />
      </span>
      <span className="min-w-0 break-words text-[var(--d-text)]">{children}</span>
    </div>
  );
}

function HealthOverview() {
  const [data, setData] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await api.adminHealth());
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const healthy = data?.overall === 'healthy';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className={LABEL}>Backend health</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {data && <Dot ok={healthy} />}
            <h2 className="font-sans text-[18px] font-bold" style={{ color: data ? (healthy ? 'var(--lp-accent)' : '#e0794f') : '#fff' }}>
              {!data ? (busy ? 'Checking…' : 'Backend health') : healthy ? 'All systems healthy' : 'Degraded'}
            </h2>
            {data && (
              <span className="text-[11px] text-[var(--d-text-3)]">
                checked {new Date(data.checkedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={run} disabled={busy} className={BTN}>
          {busy ? 'Checking…' : 'Run check'}
        </button>
      </div>
      {err && <p className="text-[12px] text-[var(--d-red)]">{err}</p>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <HealthCard title="Model gateway">
            <p className="text-[12px] text-[var(--d-text-2)] pb-1">
              Primary: <span className="text-[var(--d-text)]">{data.modelGateway.primary}</span>
            </p>
            {data.modelGateway.providers.length === 0 ? (
              <p className="text-[12px] text-[var(--d-text-2)]">none configured</p>
            ) : (
              data.modelGateway.providers.map((p) => (
                <HealthItem key={p.name} ok={p.ok}>
                  {p.name}{' '}
                  <span className="text-[var(--d-text-2)]">
                    {p.ok ? `${p.latencyMs}ms` : p.detail?.slice(0, 70) ?? 'failed'}
                  </span>
                </HealthItem>
              ))
            )}
          </HealthCard>

          <HealthCard title="Operator funds">
            {data.funds.length === 0 ? (
              <p className="text-[12px] text-[var(--d-text-2)]">none configured</p>
            ) : (
              data.funds.map((f) => (
                <HealthItem key={f.label} ok={f.ok}>
                  {f.label}{' '}
                  <span className="text-[var(--d-text-2)]">
                    {f.balanceUsdc != null ? `${f.balanceUsdc} USDC` : f.detail ?? '—'}
                  </span>
                  {f.address && (
                    <span className="block text-[10px] text-[var(--d-text-3)]">{short(f.address)}</span>
                  )}
                </HealthItem>
              ))
            )}
          </HealthCard>

          <HealthCard title="Infrastructure">
            {data.infrastructure.map((i) => (
              <HealthItem key={i.label} ok={i.ok}>
                {i.label} <span className="text-[var(--d-text-2)]">{i.detail}</span>
              </HealthItem>
            ))}
          </HealthCard>

          <HealthCard title="Contract wiring">
            {data.contracts.map((ct) => (
              <HealthItem key={ct.label} ok={ct.ok}>
                {ct.label} <span className="text-[var(--d-text-2)]">{ct.detail}</span>
              </HealthItem>
            ))}
          </HealthCard>

          <HealthCard title="Features">
            {data.features.map((f) => (
              <HealthItem key={f.label} ok={f.on}>
                {f.label} <span className="text-[var(--d-text-2)]">{f.on ? '' : 'off'}</span>
              </HealthItem>
            ))}
          </HealthCard>
        </div>
      )}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <HealthCard title="Watchers (in-process)">
            {data.watchers.map((w) => (
              <div key={w.name} className="flex items-start gap-2">
                <span className="mt-1">
                  <StatusDot color={watcherColor(w.status)} />
                </span>
                <span className="min-w-0 break-words text-[var(--d-text)]">
                  {w.label} <span className="text-[var(--d-text-2)]">{watcherDetail(w)}</span>
                </span>
              </div>
            ))}
          </HealthCard>

          <HealthCard title="Job leases (one runner per job)">
            {(data.leases ?? []).map((l) => (
              <HealthItem key={l.name} ok={l.expiresInMs > 0}>
                {l.name}{' '}
                <span className="text-[var(--d-text-2)]">
                  {l.thisProcess ? 'this process' : l.holder} · held {fmtSpan(l.heldForMs)} · {l.expiresInMs > 0 ? `expires in ${fmtSpan(l.expiresInMs)}` : 'expired, free to take'}
                </span>
              </HealthItem>
            ))}
          </HealthCard>

          <HealthCard title="Money">
            {(data.money?.lines ?? []).map((line) => (
              <HealthItem key={line.key} ok={line.ok}>
                {MONEY_LINE[line.key]}: {line.key === 'sweep' ? (line.ok ? 'running' : 'late') : line.count}{' '}
                <span className="text-[var(--d-text-2)]">
                  {[line.detail, line.oldest ? `oldest ${line.oldest.reference}, ${fmtAge(Date.now() - line.oldest.at)}` : null].filter(Boolean).join(' · ')}
                </span>
              </HealthItem>
            ))}
            {data.money?.error ? <HealthItem ok={false}>Could not read: {data.money.error}</HealthItem> : null}
            {data.money?.lastSweep && data.money.lastSweep.left.length > 0 ? (
              <div className="space-y-1 pt-1">
                {data.money.lastSweep.left.slice(0, 20).map((l) => (
                  <span key={l.reference} className="block text-[11px] text-[var(--d-text-2)]">
                    {l.reference} · {l.kind} · {l.state} · {l.reason}
                  </span>
                ))}
              </div>
            ) : null}
          </HealthCard>

          <HealthCard title="Deal guarantees">
            <HealthItem ok={(data.guarantees?.held ?? 0) === 0 && (data.guarantees?.errors ?? 0) === 0}>
              {data.guarantees?.held ?? 0} to check on the support page{' '}
              <span className="text-[var(--d-text-2)]">
                {data.guarantees?.lastPassAt
                  ? `last pass ${fmtAge(Date.now() - data.guarantees.lastPassAt)} · kept ${data.guarantees.kept} · freed ${data.guarantees.freed} · unread ${data.guarantees.errors}`
                  : 'no pass yet'}
              </span>
            </HealthItem>
          </HealthCard>

          <HealthCard title="Host crons (VPS)">
            {data.crons.map((cr) => (
              <div key={cr.name} className="flex items-start gap-2">
                <span className="mt-1">
                  <StatusDot color={cronColor(cr.status)} />
                </span>
                <span className="min-w-0 break-words text-[var(--d-text)]">
                  {cr.label} <span className="text-[var(--d-text-2)]">{cronDetail(cr)}</span>
                  <span className="block text-[10px] text-[var(--d-text-3)]">{cr.schedule}</span>
                </span>
              </div>
            ))}
          </HealthCard>
        </div>
      )}
    </section>
  );
}

const MONEY_LINE: Record<'needs_attention' | 'stuck' | 'owed' | 'bridges' | 'watchers' | 'sweep', string> = {
  needs_attention: 'Needs attention',
  stuck: 'Not finished after an hour',
  owed: 'Owed, not collected',
  bridges: 'Transfers between networks after an hour',
  watchers: 'Watchers stalled or missing',
  sweep: 'Scheduled money check',
};

const usd = (v: string | null) => (v === null ? '—' : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`);

/// What older contracts still hold (view 37). "For people" is what open deals
/// and positions on Karwan's records hold; "no step" is the part of it nobody
/// can move today; "left over" is the rest of the balance: fees, team money and
/// money not matched to a record.
function OlderContractsPanel() {
  const [rows, setRows] = useState<Older | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.adminOlderContracts().then((r) => setRows(r.contracts), (e) => setErr(errMsg(e)));
  }, []);

  return (
    <section className={PANEL}>
      <p className={LABEL}>Older contracts</p>
      <h2 className="mt-1.5 font-sans text-[18px] font-bold text-[var(--d-text)]">Money still on older contracts</h2>
      {err && <p className="mt-3 text-[13px] text-[var(--d-red)]">{err}</p>}
      {!rows && !err && <p className="mt-3 text-[13px] text-[var(--d-text-2)]">Reading the chain…</p>}
      {rows && rows.length === 0 && <p className="mt-3 text-[13px] text-[var(--d-text-2)]">Nothing is left on older contracts.</p>}
      {rows && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[12.5px] tabular-nums">
            <thead>
              <tr className={`${LABEL} text-left`}>
                <th className="py-2 pr-4 font-normal">Contract</th>
                <th className="py-2 pr-4 font-normal text-right">Holds</th>
                <th className="py-2 pr-4 font-normal text-right">For people</th>
                <th className="py-2 pr-4 font-normal text-right">Open</th>
                <th className="py-2 pr-4 font-normal text-right">No step</th>
                <th className="py-2 font-normal text-right">Left over</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.address} className="border-t border-[var(--d-line)] text-[var(--d-text)]">
                  <td className="py-2 pr-4">
                    {r.name.replace(/^Karwan/, '')}
                    <span className="block text-[10px] text-[var(--d-text-3)]">{short(r.address)}</span>
                  </td>
                  <td className="py-2 pr-4 text-right">{usd(r.balanceUsdc)}</td>
                  <td className="py-2 pr-4 text-right">{usd(r.forPeopleUsdc)}</td>
                  <td className="py-2 pr-4 text-right">{r.forPeopleUsdc === null ? '—' : r.open}</td>
                  <td className="py-2 pr-4 text-right" style={{ color: r.noStepUsdc && Number(r.noStepUsdc) > 0 ? AMBER : undefined }}>
                    {usd(r.noStepUsdc)}
                  </td>
                  <td className="py-2 text-right">{usd(r.leftOverUsdc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AgentSeedPanel() {
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<SeedStatus | null>(null);
  const [result, setResult] = useState<SeedRun | null>(null);
  const [busy, setBusy] = useState<'check' | 'seed' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const valid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

  async function check() {
    if (!valid) return;
    setBusy('check');
    setErr(null);
    setResult(null);
    try {
      setStatus(await api.adminAgentSeedStatus(address.trim()));
    } catch (e) {
      setErr(errMsg(e));
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }

  async function seed() {
    if (!valid) return;
    setBusy('seed');
    setErr(null);
    try {
      setResult(await api.adminAgentSeedRun(address.trim()));
      setStatus(await api.adminAgentSeedStatus(address.trim()));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={PANEL}>
      <p className={LABEL}>Agent gas seed</p>
      <h2 className="mt-1.5 font-sans text-[18px] font-bold text-[var(--d-text)]">Agent funding</h2>
      <p className="mt-1 text-[13px] text-[var(--d-text-2)] max-w-[60ch]">
        Check an account's agent balances against the operator wallet, then seed the agents if they
        activated unfunded. Seeding is idempotent and skips an already-funded agent.
      </p>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… account address"
          className={INPUT}
        />
        <button type="button" onClick={check} disabled={!valid || busy !== null} className={BTN}>
          {busy === 'check' ? 'Checking…' : 'Check'}
        </button>
      </div>
      {err && <p className="mt-4 text-[12px] text-[var(--d-red)]">{err}</p>}
      {status && (
        <div className="mt-5 space-y-2 text-[13px]">
          <Row label="Seed key">
            <span className="inline-flex items-center gap-2">
              <Dot ok={status.keyConfigured} />
              {status.keyConfigured ? 'configured' : 'not set'}
            </span>
          </Row>
          <Row label="Seed amount">{status.seedAmountUsdc} USDC</Row>
          <Row label="Operator">
            {status.operator ? (
              <span className="inline-flex items-center gap-2 flex-wrap">
                <Dot ok={Number(status.operator.balanceUsdc) >= status.seedAmountUsdc} />
                <span className="font-mono">{short(status.operator.address)}</span>
                <span className="text-[var(--d-text-2)]">{status.operator.balanceUsdc} USDC</span>
              </span>
            ) : (
              <span className="text-[var(--d-text-2)]">no key</span>
            )}
          </Row>
          {status.agents ? (
            <>
              <Row label="Buyer agent">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <Dot ok={Number(status.agents.buyer.balanceUsdc ?? 0) > 0} />
                  <span className="font-mono">{short(status.agents.buyer.address)}</span>
                  <span className="text-[var(--d-text-2)]">{status.agents.buyer.balanceUsdc ?? '—'} USDC</span>
                </span>
              </Row>
              <Row label="Seller agent">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <Dot ok={Number(status.agents.seller.balanceUsdc ?? 0) > 0} />
                  <span className="font-mono">{short(status.agents.seller.address)}</span>
                  <span className="text-[var(--d-text-2)]">{status.agents.seller.balanceUsdc ?? '—'} USDC</span>
                </span>
              </Row>
              <div className="pt-2">
                <button type="button" onClick={seed} disabled={busy !== null} className={BTN}>
                  {busy === 'seed' ? 'Seeding…' : 'Seed agents now'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[var(--d-text-2)]">No agent wallets for this address.</p>
          )}
        </div>
      )}
      {result && (
        <div className="mt-4 space-y-1.5">
          <p className={LABEL}>Seed result</p>
          {(['buyer', 'seller'] as const).map((k) => {
            const r = result[k];
            return (
              <p key={k} className="flex items-center gap-2 text-[12px]">
                <Dot ok={r.ok} />
                <span className="text-[10px] text-[var(--d-text)]">{k}</span>
                <span className="text-[var(--d-text-2)] break-words">
                  {r.ok ? (r.txHash ? `sent ${short(r.txHash)}` : r.reason ?? 'ok') : r.reason ?? 'failed'}
                </span>
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] text-[var(--d-text-2)] w-28 shrink-0">
        {label}
      </span>
      <span className="text-[var(--d-text)]">{children}</span>
    </div>
  );
}
