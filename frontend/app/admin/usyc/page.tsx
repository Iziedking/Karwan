'use client';
import { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8787';
const ADMIN_TOKEN_KEY = 'karwan-admin-token';

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

export default function AdminUsycPage() {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
    setToken(cached);
    setDraft(cached);
    setLoaded(true);
  }, []);

  if (!loaded) return null;
  if (!token) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-20">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-serif tracking-tight">USYC reserves</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Paste the admin token. Held in this tab only.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem(ADMIN_TOKEN_KEY, draft);
              setToken(draft);
            }}
            className="mt-6 flex flex-col gap-3"
          >
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="ADMIN_API_TOKEN"
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-40"
            >
              Unlock
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <Console
      token={token}
      onLock={() => {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken('');
        setDraft('');
      }}
    />
  );
}

function Console({ token, onLock }: { token: string; onLock: () => void }) {
  const [data, setData] = useState<UsycResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/admin/usyc`, {
        headers: { 'x-admin-token': token },
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

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
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-end justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              [:USYC RESERVES:]
            </p>
            <h1 className="mt-1 text-3xl font-serif tracking-tight">Yield monitor</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900 disabled:opacity-40"
            >
              {loading ? 'Loading' : 'Refresh'}
            </button>
            <button
              onClick={onLock}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-900"
            >
              Lock
            </button>
          </div>
        </header>

        {error ? (
          <p className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {data?.configured === false ? (
          <p className="mt-6 text-sm text-zinc-400">Treasury address not configured.</p>
        ) : null}

        {data?.error ? (
          <p className="mt-6 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
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
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
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
                  <p className="text-sm text-zinc-500">
                    No vault configured, or no stake routed to USYC yet.
                  </p>
                </Card>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
          accent ? 'text-emerald-400' : 'text-zinc-100'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
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
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {address ? (
          <span className="font-mono text-[10px] text-zinc-500">{short(address)}</span>
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
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
      <dd
        className={`text-sm tabular-nums ${mono ? 'font-mono text-xs' : ''} ${
          accent ? 'font-bold text-emerald-400' : 'text-zinc-100'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
