'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminApiUrl } from '@/shared/admin/adminDesk';
import { deskReasonHeader } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';


type UsycResp = {
  configured: boolean;
  error?: string;
  usyc?: {
    token: string;
    oracle: string;
    priceUsd: number;
    appreciationPct: number;
    updatedAt: number;
  };
  treasury?: {
    address: string;
    usdc: number;
    usycShares: number;
    usycValueUsd: number;
    yieldUsd: number;
    totalReservesUsdc: number;
  };
  vault?: {
    address: string;
    operator: string;
    operatorUsyc: number;
    operatorUsycValueUsd: number;
    outForYieldUsdc: number;
    yieldUsd: number;
  } | null;
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '-');

/// The yield part of Treasury and yield (view 79), read with the desk session.
export default function AdminUsycPage() {
  return <Console token="desk" />;
}

type RunStep = { action: string; detail: string; txHash?: string; skipped?: boolean; failed?: boolean };
type RunResult = { ok: boolean; operator?: string | null; dryRun?: boolean; steps?: RunStep[]; error?: string };

interface PendingClaim {
  positionId: string;
  owner: string;
  principalUsdc: string;
  claimableAt: number;
  due: boolean;
}
interface Liquidity {
  vault: string;
  liquidUsdc: string;
  liabilityUsdc: string;
  dueNowUsdc: string;
  shortfallUsdc: string;
  urgentShortfallUsdc: string;
  pending: PendingClaim[];
  nextDueAt: number | null;
}
interface CoverResult {
  coveredUsdc?: string;
  shortfallUsdc?: string;
  redeemedUsyc?: string;
  txHash?: string;
  note?: string;
  error?: string;
}

function Console({ token }: { token: string }) {
  const { prompt } = useDialog();
  const [liq, setLiq] = useState<Liquidity | null>(null);
  const [covering, setCovering] = useState(false);
  const [cover, setCover] = useState<CoverResult | null>(null);
  const [data, setData] = useState<UsycResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(adminApiUrl(`/api/admin/usyc`), {
        headers: { 'x-karwan-desk': '1' },
      });
      if (r.status === 401) {
        setError('Token rejected. Lock and re-enter.');
        setData(null);
        return;
      }
      if (!r.ok && r.status !== 502) {
        setError(`Backend ${r.status}`);
        setData(null);
        return;
      }
      setData((await r.json()) as UsycResp);
      setError(null);
      // Separate call: the liquidity read must still work when the USYC/oracle
      // reads above fail, because it is the one an operator acts on.
      try {
        const lr = await fetch(adminApiUrl(`/api/admin/usyc/liquidity`), {
          headers: { 'x-karwan-desk': '1' },
        });
        setLiq(lr.ok ? ((await lr.json()) as Liquidity) : null);
      } catch {
        setLiq(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const wrap = useCallback(
    async (dry: boolean) => {
      const reason = dry ? '' : await prompt({ title: 'Ask to run the USYC wrap', message: 'Nothing moves until a second member approves it on Approvals.', confirmLabel: 'Ask for approval' });
      if (!dry && !reason?.trim()) return;
      setRunning(true);
      setRun(null);
      try {
        const r = await fetch(adminApiUrl(`/api/admin/usyc/run${dry ? '?dry=1' : ''}`), {
          method: 'POST',
          headers: { 'x-karwan-desk': '1', ...(dry ? {} : deskReasonHeader(reason!.trim())) },
        });
        if (r.status === 202) {
          setRun({ ok: true, dryRun: false, steps: [{ action: 'Sent for approval', detail: 'A second member approves it on Approvals. Nothing has moved yet.', skipped: true }] });
          return;
        }
        const body = (await r.json()) as RunResult;
        setRun(body);
        if (!dry && body.ok) refresh();
      } catch (e) {
        setRun({ ok: false, error: (e as Error).message });
      } finally {
        setRunning(false);
      }
    },
    [token, refresh, prompt],
  );

  const runCover = useCallback(
    async (dry: boolean) => {
      const reason = dry ? '' : await prompt({ title: 'Ask to cover the vault shortfall', message: 'Nothing moves until a second member approves it on Approvals.', confirmLabel: 'Ask for approval' });
      if (!dry && !reason?.trim()) return;
      setCovering(true);
      setCover(null);
      try {
        const r = await fetch(adminApiUrl(`/api/admin/usyc/cover${dry ? '?dry=1' : ''}`), {
          method: 'POST',
          headers: { 'x-karwan-desk': '1', ...(dry ? {} : deskReasonHeader(reason!.trim())) },
        });
        if (r.status === 202) {
          setCover({ error: 'Sent for approval. A second member approves it on Approvals. Nothing has moved yet.' } as CoverResult);
          return;
        }
        setCover((await r.json()) as CoverResult);
        if (!dry) refresh();
      } catch (e) {
        setCover({ error: (e as Error).message });
      } finally {
        setCovering(false);
      }
    },
    [token, refresh, prompt],
  );

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const price = data?.usyc?.priceUsd ?? 0;
  const totalValue =
    (data?.treasury?.usycValueUsd ?? 0) + (data?.vault?.operatorUsycValueUsd ?? 0);
  const totalYield = (data?.treasury?.yieldUsd ?? 0) + (data?.vault?.yieldUsd ?? 0);

  return (
    <section aria-label="Yield" className="text-[var(--d-text)]">
      <div>
        <header className="flex items-end justify-between gap-4 border-b border-[var(--d-line)] pb-5">
          <div>
            <h2 className="text-[18px] font-semibold">Yield</h2>
            <p className="mt-1 text-xs text-[var(--d-text-3)]">USYC reserves</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-md border border-[var(--d-line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--d-hover)] disabled:opacity-40"
            >
              {loading ? 'Loading' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? (
          <p className="mt-6 rounded-lg border border-[#5A2A2E] bg-[#3A1C1F] px-4 py-3 text-sm text-[var(--d-red)]">
            {error}
          </p>
        ) : null}

        {data?.configured === false ? (
          <p className="mt-6 text-sm text-[var(--d-text-2)]">Treasury address not configured.</p>
        ) : null}

        {data?.error ? (
          <p className="mt-6 rounded-lg border border-[#5A4520] bg-[#352A12] px-4 py-3 text-sm text-[var(--d-amber)]">
            On-chain read failed: {data.error}
          </p>
        ) : null}

        {data?.usyc ? (
          <>
            {/* Live price + totals hero */}
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <Stat
                label="USYC price"
                value={`$${price.toFixed(4)}`}
                sub={`+${data.usyc.appreciationPct.toFixed(2)}% vs par`}
                accent
              />
              <Stat label="Total USYC value" value={`$${usd(totalValue)}`} sub="treasury + vault" />
              <Stat label="Yield earned" value={`$${usd(totalYield)}`} sub="marked to oracle" />
            </section>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--d-text-2)]">
              oracle {short(data.usyc.oracle)} · updated{' '}
              {data.usyc.updatedAt ? new Date(data.usyc.updatedAt).toLocaleString() : '-'}
            </p>

            {/* Holders */}
            <section className="mt-8 grid gap-4 lg:grid-cols-2">
              {data.treasury ? (
                <Card title="Treasury (fees → USYC)" address={data.treasury.address}>
                  <Row label="Liquid USDC" value={`$${usd(data.treasury.usdc)}`} />
                  <Row label="USYC shares" value={usd(data.treasury.usycShares)} />
                  <Row label="USYC value" value={`$${usd(data.treasury.usycValueUsd)}`} />
                  <Row label="Total reserves" value={`$${usd(data.treasury.totalReservesUsdc)}`} />
                  <Row label="Yield" value={`$${usd(data.treasury.yieldUsd)}`} accent />
                </Card>
              ) : null}
              {data.vault ? (
                <Card title="Vault stake (routed)" address={data.vault.address}>
                  <Row label="Operator" value={short(data.vault.operator)} mono />
                  <Row label="USYC shares" value={usd(data.vault.operatorUsyc)} />
                  <Row label="USYC value" value={`$${usd(data.vault.operatorUsycValueUsd)}`} />
                  <Row label="Out for yield (cost)" value={`$${usd(data.vault.outForYieldUsdc)}`} />
                  <Row label="Yield" value={`$${usd(data.vault.yieldUsd)}`} accent />
                </Card>
              ) : (
                <Card title="Vault stake (routed)" address={null}>
                  <p className="text-sm text-[var(--d-text-3)]">
                    No vault configured, or no stake routed to USYC yet.
                  </p>
                </Card>
              )}
            </section>
          </>
        ) : null}

        {/* Claim liquidity. Above the wrap panel on purpose: this is the one
            that has a user waiting on it. A claim is paid from the vault's
            liquid USDC and nothing else, and the vault cannot redeem USYC
            itself, so a shortfall here is somebody's Claim button reverting. */}
        {liq ? (
          <section
            className="mt-8 rounded-lg border p-5"
            style={{
              borderColor: Number(liq.urgentShortfallUsdc) > 0 ? '#7f1d1d' : '#27272a',
              background: Number(liq.urgentShortfallUsdc) > 0 ? 'rgba(127,29,29,0.12)' : 'rgba(24,24,27,0.4)',
            }}
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Claim liquidity</h2>
                <p className="mt-1 text-xs text-[var(--d-text-3)]">
                  {Number(liq.urgentShortfallUsdc) > 0
                    ? `Short $${usd(Number(liq.urgentShortfallUsdc))} against claims that are due NOW. Claims are reverting.`
                    : Number(liq.shortfallUsdc) > 0
                      ? `Covers everything due today, short $${usd(Number(liq.shortfallUsdc))} before the last cooldown matures.`
                      : 'Covers every position in cooldown.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runCover(true)}
                  disabled={covering || Number(liq.shortfallUsdc) === 0}
                  className="rounded-lg border border-[var(--d-line)] px-3 py-1.5 text-xs font-medium text-[var(--d-text-2)] hover:bg-[var(--d-hover)] disabled:opacity-40"
                >
                  Preview
                </button>
                <button
                  onClick={() => runCover(false)}
                  disabled={covering || Number(liq.shortfallUsdc) === 0}
                  className="rounded-lg bg-[var(--lp-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--d-text)] hover:brightness-95 disabled:opacity-40"
                >
                  {covering ? 'Redeeming…' : 'Redeem and cover'}
                </button>
              </div>
            </header>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Row label="Liquid in vault" value={`$${usd(Number(liq.liquidUsdc))}`} />
              <Row label="Owed (in cooldown)" value={`$${usd(Number(liq.liabilityUsdc))}`} />
              <Row label="Claimable now" value={`$${usd(Number(liq.dueNowUsdc))}`} />
              <Row label="Shortfall" value={`$${usd(Number(liq.shortfallUsdc))}`} accent={Number(liq.shortfallUsdc) > 0} />
            </div>

            {liq.nextDueAt ? (
              <p className="mt-3 text-xs text-[var(--d-text-3)]">
                Next cooldown matures {new Date(liq.nextDueAt * 1000).toLocaleString()}.
              </p>
            ) : null}

            {liq.pending.length > 0 ? (
              <ul className="mt-4 space-y-1 text-xs text-[var(--d-text-2)]">
                {liq.pending.slice(0, 8).map((p) => (
                  <li key={p.positionId} className="flex justify-between gap-3">
                    <span className="font-mono">
                      #{p.positionId} · {p.owner.slice(0, 10)}…
                    </span>
                    <span>
                      ${usd(Number(p.principalUsdc))}{' '}
                      <span className={p.due ? 'text-[var(--lp-accent)]' : 'text-[var(--d-text-2)]'}>
                        {p.due ? 'due now' : new Date(p.claimableAt * 1000).toLocaleDateString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {cover ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-[var(--d-bg)] p-3 text-xs text-[var(--d-text-2)]">
                {cover.error
                  ? `failed: ${cover.error}`
                  : [
                      cover.redeemedUsyc ? `redeemed ${cover.redeemedUsyc} USYC` : null,
                      cover.coveredUsdc ? `returned ${cover.coveredUsdc} USDC` : null,
                      cover.note ?? null,
                      cover.txHash ?? null,
                    ]
                      .filter(Boolean)
                      .join('\n')}
              </pre>
            ) : null}
          </section>
        ) : null}

        {/* One-click wrap: operator-signed vault rebalance + treasury sweep. */}
        <section className="mt-8 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Wrap idle USDC into USYC</h2>
              <p className="mt-1 text-xs text-[var(--d-text-3)]">
                Operator-signed. Wraps the vault above its buffer and sweeps the treasury into USYC.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => wrap(true)}
                disabled={running}
                className="rounded-md border border-[var(--d-line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--d-hover)] disabled:opacity-40"
              >
                {running ? 'Working' : 'Preview'}
              </button>
              <button
                onClick={() => wrap(false)}
                disabled={running}
                className="rounded-md bg-[var(--lp-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--d-text)] hover:brightness-95 disabled:opacity-40"
              >
                Wrap now
              </button>
            </div>
          </header>

          {run ? (
            <div className="mt-4">
              {run.error ? (
                <p className="rounded-lg border border-[#5A2A2E] bg-[#3A1C1F] px-4 py-3 text-sm text-[var(--d-red)]">
                  {run.error}
                </p>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--d-text-3)]">
                    {run.dryRun ? 'preview (no transactions)' : 'executed'} · operator{' '}
                    {short(run.operator)}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {(run.steps ?? []).map((s, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-4 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2"
                      >
                        <span className="text-sm text-[var(--d-text)]">
                          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--d-text-3)]">
                            {s.action}
                          </span>{' '}
                          {s.detail}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${
                            s.failed
                              ? 'text-[var(--d-red)]'
                              : s.skipped
                                ? 'text-[var(--d-text-2)]'
                                : s.txHash
                                  ? 'text-[var(--lp-accent)]'
                                  : 'text-[var(--d-text-2)]'
                          }`}
                        >
                          {s.failed ? 'fail' : s.skipped ? 'skip' : s.txHash ? `${s.txHash.slice(0, 10)}…` : 'ok'}
                        </span>
                      </li>
                    ))}
                    {(run.steps ?? []).length === 0 ? (
                      <li className="text-sm text-[var(--d-text-3)]">Nothing to do.</li>
                    ) : null}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--d-text-3)]">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
          accent ? 'text-[var(--lp-accent)]' : 'text-[var(--d-text)]'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[var(--d-text-3)]">{sub}</p> : null}
    </div>
  );
}

function Card({
  title,
  address,
  children,
}: {
  title: string;
  address: string | null;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {address ? (
          <span className="font-mono text-[10px] text-[var(--d-text-3)]">{short(address)}</span>
        ) : null}
      </header>
      <dl className="mt-4 space-y-2.5">{children}</dl>
    </article>
  );
}

function Row({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--d-text-3)]">{label}</dt>
      <dd
        className={`text-sm tabular-nums ${mono ? 'font-mono text-xs' : ''} ${
          accent ? 'font-bold text-[var(--lp-accent)]' : 'text-[var(--d-text)]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
