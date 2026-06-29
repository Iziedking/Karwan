'use client';
import { useState } from 'react';
import { api, ApiError } from '@/core/api';

/// Operator diagnostics: live health of the in-app assistant provider chain
/// (Conduit primary, Anthropic fallback) and the agent gas seed, plus a manual
/// seed for an account whose agents activated unfunded. Read-only except the
/// seed action, which is idempotent.

type Health = Awaited<ReturnType<typeof api.adminAssistantHealth>>;
type SeedStatus = Awaited<ReturnType<typeof api.adminAgentSeedStatus>>;
type SeedRun = Awaited<ReturnType<typeof api.adminAgentSeedRun>>;

const PANEL = 'bg-[#161616] border border-white/10 rounded-2xl p-6';
const LABEL = 'mono text-[10px] uppercase tracking-[0.18em] text-white/40';
const BTN =
  'shrink-0 mono text-[11px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-50 transition';
const INPUT =
  'w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[13px] text-white font-mono focus:border-white/40 outline-none';

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
      style={{ background: ok ? '#6BE39A' : '#e0794f' }}
    />
  );
}

export default function AdminDiagnostics() {
  return (
    <div className="space-y-8">
      <div>
        <p className={LABEL}>[:DIAGNOSTICS:]</p>
        <h1 className="mt-2 font-sans text-[26px] font-extrabold text-white">Diagnostics</h1>
        <p className="mt-1 text-[13px] text-white/50 max-w-[60ch]">
          Live checks for the in-app assistant and the agent gas seed, so a failing key or an
          unfunded operator wallet is visible without reading logs.
        </p>
      </div>
      <AssistantHealthPanel />
      <AgentSeedPanel />
    </div>
  );
}

function AssistantHealthPanel() {
  const [data, setData] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      setData(await api.adminAssistantHealth());
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={PANEL}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={LABEL}>[:ASSISTANT HEALTH:]</p>
          <h2 className="mt-1.5 font-sans text-[18px] font-bold text-white">In-app assistant</h2>
        </div>
        <button type="button" onClick={run} disabled={busy} className={BTN}>
          {busy ? 'Checking…' : 'Run check'}
        </button>
      </div>
      {err && <p className="mt-4 text-[12px] text-[#e0794f]">{err}</p>}
      {data && (
        <div className="mt-5 space-y-3">
          {!data.configured && (
            <p className="text-[13px] text-white/55">No assistant providers configured.</p>
          )}
          {data.providers.map((p) => (
            <div key={p.name} className="flex items-start gap-3 border border-white/10 rounded-lg px-4 py-3">
              <span className="mt-1">
                <Dot ok={p.ok} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-sans text-[14px] font-bold text-white uppercase">{p.name}</span>
                  <span className="mono text-[11px] text-white/45">{p.model}</span>
                  <span className="mono text-[11px] text-white/35">{p.latencyMs} ms</span>
                  {typeof p.status === 'number' && (
                    <span className="mono text-[11px] text-white/45">HTTP {p.status}</span>
                  )}
                </div>
                {p.ok ? (
                  p.sample ? <p className="mt-1 text-[12px] text-white/55 truncate">“{p.sample}”</p> : null
                ) : (
                  <p className="mt-1 text-[12px] text-[#e0794f] break-words">{p.detail ?? 'failed'}</p>
                )}
              </div>
            </div>
          ))}
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
      // Refresh balances so the panel reflects the seed immediately.
      setStatus(await api.adminAgentSeedStatus(address.trim()));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={PANEL}>
      <p className={LABEL}>[:AGENT GAS SEED:]</p>
      <h2 className="mt-1.5 font-sans text-[18px] font-bold text-white">Agent funding</h2>
      <p className="mt-1 text-[13px] text-white/50 max-w-[60ch]">
        Check the operator wallet balance and an account's agent balances, then seed the agents if
        they activated unfunded. Seeding is idempotent and skips an already-funded agent.
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
      {err && <p className="mt-4 text-[12px] text-[#e0794f]">{err}</p>}
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
                <span className="text-white/55">{status.operator.balanceUsdc} USDC</span>
              </span>
            ) : (
              <span className="text-white/45">no key</span>
            )}
          </Row>
          {status.agents ? (
            <>
              <Row label="Buyer agent">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <Dot ok={Number(status.agents.buyer.balanceUsdc ?? 0) > 0} />
                  <span className="font-mono">{short(status.agents.buyer.address)}</span>
                  <span className="text-white/55">{status.agents.buyer.balanceUsdc ?? '—'} USDC</span>
                </span>
              </Row>
              <Row label="Seller agent">
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <Dot ok={Number(status.agents.seller.balanceUsdc ?? 0) > 0} />
                  <span className="font-mono">{short(status.agents.seller.address)}</span>
                  <span className="text-white/55">{status.agents.seller.balanceUsdc ?? '—'} USDC</span>
                </span>
              </Row>
              <div className="pt-2">
                <button type="button" onClick={seed} disabled={busy !== null} className={BTN}>
                  {busy === 'seed' ? 'Seeding…' : 'Seed agents now'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-white/45">No agent wallets for this address.</p>
          )}
        </div>
      )}
      {result && (
        <div className="mt-4 space-y-1.5">
          <p className={LABEL}>[:SEED RESULT:]</p>
          {(['buyer', 'seller'] as const).map((k) => {
            const r = result[k];
            return (
              <p key={k} className="flex items-center gap-2 text-[12px]">
                <Dot ok={r.ok} />
                <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/70">{k}</span>
                <span className="text-white/55 break-words">
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-white/40 w-28 shrink-0">
        {label}
      </span>
      <span className="text-white/85">{children}</span>
    </div>
  );
}
