'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type ContractKind,
  type CurrentContractsSnapshot,
  type LifetimeContract,
  type LifetimeStats,
} from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { compactUsdc, glanceUsdc, weekly } from '@/features/analytics/series';
import { WeeklyBars } from '@/features/analytics/WeeklyBars';

/// Karwan in numbers: a public page anyone can read, including someone who has
/// never used Karwan. Every figure comes from the contracts on Arc, summed by
/// the backend's all-time scan, and every contract links to the explorer so the
/// reader can check it.
///
/// Two feeds on two clocks. The all-time scan is history and only grows at the
/// tail, so a 30-second poll keeps it within a block or two of the chain.
/// Contract balances are a fact about now and refresh on a slower loop.

const LIFETIME_POLL_MS = 30_000;
const CONTRACTS_POLL_MS = 5 * 60_000;
const OTHER_NETWORK_URL = process.env.NEXT_PUBLIC_OTHER_NETWORK_STATS_URL?.trim() || null;

type Copy = ReturnType<typeof useTranslations>['analytics'];

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

export default function AllTimePage() {
  const t = useTranslations().analytics;
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [current, setCurrent] = useState<CurrentContractsSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unscanned' | 'error'>('loading');
  const [explorer, setExplorer] = useState('https://testnet.arcscan.app');
  const [updatedAt, setUpdatedAt] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    api.status().then((s) => setExplorer(s.chain.explorer ?? 'https://testnet.arcscan.app')).catch(() => undefined);
    return () => {
      alive.current = false;
    };
  }, []);

  const loadLifetime = useCallback(() => {
    api
      .networkLifetime()
      .then((s) => {
        if (!alive.current) return;
        setStats(s);
        setUpdatedAt(Date.now());
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!alive.current) return;
        // A failed poll keeps the figures already on screen. 503 means this
        // network has not been counted yet, an operational state, not a fault.
        setState((prev) =>
          prev === 'ready' ? prev : err instanceof ApiError && err.status === 503 ? 'unscanned' : 'error',
        );
      });
  }, []);

  const loadContracts = useCallback(() => {
    api.networkContracts().then((c) => alive.current && setCurrent(c)).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadLifetime();
    const id = setInterval(loadLifetime, LIFETIME_POLL_MS);
    return () => clearInterval(id);
  }, [loadLifetime]);

  useEffect(() => {
    loadContracts();
    const id = setInterval(loadContracts, CONTRACTS_POLL_MS);
    return () => clearInterval(id);
  }, [loadContracts]);

  const testnet = stats?.network?.testnet ?? true;

  return (
    <main className="product-surface mx-auto w-full max-w-[960px] px-4 pb-24 pt-8 sm:px-6">
      <header className="space-y-4 border-b border-[var(--lp-border-light)] pb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-border-light)] px-3 py-1 font-medium text-[var(--lp-dark)]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--chart-bar)]" />
            {testnet ? t.networkTestnet : t.networkMainnet}
          </span>
          {OTHER_NETWORK_URL ? (
            <a href={OTHER_NETWORK_URL} className="inline-flex min-h-11 items-center text-[var(--lp-text-sub)] underline-offset-4 hover:underline">
              {testnet ? t.otherMainnet : t.otherTestnet} ↗
            </a>
          ) : null}
        </div>
        <h1 className="text-[32px] font-semibold leading-tight text-[var(--lp-dark)] sm:text-[36px]">{t.title}</h1>
        <p className="max-w-[60ch] text-[16px] leading-relaxed text-[var(--lp-text-sub)]">{t.lead}</p>
        {state === 'ready' && stats ? <Freshness block={stats.toBlock} updatedAt={updatedAt} t={t} /> : null}
      </header>

      {state === 'loading' ? <Skeleton /> : null}
      {state === 'unscanned' ? <Message text={t.states.unscanned} /> : null}
      {state === 'error' ? <Message text={t.states.error} action={t.states.retry} onAction={loadLifetime} /> : null}
      {state === 'ready' && stats ? (
        <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-10">
          <Hero stats={stats} t={t} />
          <OverTime stats={stats} t={t} />
          <WhereItWent stats={stats} t={t} />
          <Rails stats={stats} t={t} />
          <Contracts stats={stats} current={current} explorer={explorer} t={t} />
        </div>
      ) : null}
    </main>
  );
}

function Freshness({ block, updatedAt, t }: { block: string; updatedAt: number; t: Copy }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const age = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <p className="text-[13px] tabular-nums text-[var(--lp-text-sub)]">
      {age < 5 ? t.updatedNow : fill(t.updatedAgo, { n: String(age) })}
      <span aria-hidden className="mx-2">·</span>
      {fill(t.block, { block: Number(block).toLocaleString('en-US') })}
    </p>
  );
}

function Skeleton() {
  const soft = 'rounded-[12px] bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse';
  return (
    <div aria-busy="true" className="space-y-6 py-10">
      <div className={`h-16 w-72 ${soft}`} />
      <div className={`h-24 w-full ${soft}`} />
      <div className={`h-52 w-full ${soft}`} />
    </div>
  );
}

function Message({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="space-y-4 py-12">
      <p className="text-[16px] text-[var(--lp-dark)]">{text}</p>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-[var(--lp-outline-strong)] px-4 text-[15px] font-medium text-[var(--lp-dark)]"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

const num = (v: string | number | undefined) => Number(v ?? 0) || 0;

/// Labelled rows with a bar each, all on one scale: magnitude compared at a
/// glance, the exact figure beside every bar.
function RowBars({ rows }: { rows: Array<{ label: string; value: number; note?: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[15px] text-[var(--lp-dark)]">{r.label}</span>
            <span dir="ltr" className="text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">
              {glanceUsdc(r.value)} <span className="text-[13px] font-normal text-[var(--lp-text-sub)]">USDC</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--lp-border-light)]">
            <div
              className="h-2 rounded-full bg-[var(--chart-bar)]"
              style={{ width: `${r.value > 0 ? Math.max(1.5, (r.value / max) * 100) : 0}%` }}
            />
          </div>
          {r.note ? <p className="text-[13px] text-[var(--lp-text-sub)]">{r.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] text-[var(--lp-text-sub)]">{label}</p>
      <p className="text-[24px] font-semibold tabular-nums text-[var(--lp-dark)]">
        <span dir="ltr">
          {value}
          {unit ? <span className="ms-1.5 text-[13px] font-normal text-[var(--lp-text-sub)]">{unit}</span> : null}
        </span>
      </p>
    </div>
  );
}

function Hero({ stats, t }: { stats: LifetimeStats; t: Copy }) {
  const financing = stats.byKind.find((k) => k.kind === 'financing');
  const staking = stats.byKind.find((k) => k.kind === 'staking');
  return (
    <section aria-labelledby="hero" className="space-y-8">
      <div className="space-y-2">
        <h2 id="hero" className="text-[15px] font-medium text-[var(--lp-text-sub)]">{t.hero.label}</h2>
        <p className="text-[48px] font-semibold leading-none tabular-nums text-[var(--lp-dark)] sm:text-[64px]">
          <span dir="ltr">
            {glanceUsdc(num(stats.totalMovedUsdc))}
            <span className="ms-2 text-[18px] font-medium text-[var(--lp-text-sub)]">USDC</span>
          </span>
        </p>
        <p className="text-[13px] text-[var(--lp-text-sub)]">{t.hero.note}</p>
      </div>
      <RowBars
        rows={[
          { label: t.hero.inDeals, value: num(stats.volumes.fundedUsdc) },
          { label: t.hero.inStake, value: num(staking?.volumes.stakedUsdc) },
          { label: t.hero.inFinance, value: num(financing?.volumes.advancedUsdc) },
        ]}
      />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label={t.kpis.deals} value={stats.totals.deals.toLocaleString('en-US')} />
        <Stat label={t.kpis.paidToSellers} value={glanceUsdc(num(stats.volumes.releasedUsdc))} unit="USDC" />
        <Stat label={t.kpis.returnedToBuyers} value={glanceUsdc(num(stats.volumes.refundedUsdc))} unit="USDC" />
        <Stat label={t.kpis.requests} value={stats.totals.jobsPosted.toLocaleString('en-US')} />
      </div>
    </section>
  );
}

function OverTime({ stats, t }: { stats: LifetimeStats; t: Copy }) {
  const { locale } = useLocale();
  const series = stats.series;
  const weeks = weekly(series?.days ?? []);
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dealsLine = (n: number) => (n === 1 ? t.overTime.dealsOne : fill(t.overTime.dealsMany, { n: String(n) }));

  // A backend older than the daily series sends none at all: leave the section
  // out rather than show a history that is not being built.
  if (!series) return null;

  let body: React.ReactNode;
  if (!series.complete) {
    const pct = Math.floor(series.indexedShare * 100);
    body = <p className="text-[15px] text-[var(--lp-text-sub)]">{fill(t.overTime.indexing, { pct: String(pct) })}</p>;
  } else if (weeks.length === 0) {
    body = <p className="text-[15px] text-[var(--lp-text-sub)]">{t.overTime.empty}</p>;
  } else {
    const heading = (w: string) => fill(t.overTime.weekOf, { date: long.format(new Date(`${w}T00:00:00Z`)) });
    body = (
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.overTime.moneyTitle}</h3>
          <WeeklyBars
            title={t.overTime.moneyTitle}
            data={weeks.map((w) => ({
              key: w.weekStart,
              label: short.format(new Date(`${w.weekStart}T00:00:00Z`)),
              value: w.fundedUsdc,
              tooltip: [heading(w.weekStart), `${glanceUsdc(w.fundedUsdc)} USDC`, dealsLine(w.deals)],
            }))}
            axisFormat={compactUsdc}
            tableHeaders={[t.overTime.colWeek, t.overTime.colUsdc]}
            tableValue={(d) => glanceUsdc(d.value)}
            showTableLabel={t.overTime.showTable}
            hideTableLabel={t.overTime.hideTable}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.overTime.dealsTitle}</h3>
          <WeeklyBars
            title={t.overTime.dealsTitle}
            data={weeks.map((w) => ({
              key: w.weekStart,
              label: short.format(new Date(`${w.weekStart}T00:00:00Z`)),
              value: w.deals,
              tooltip: [heading(w.weekStart), dealsLine(w.deals)],
            }))}
            axisFormat={(v) => String(Math.round(v))}
            tableHeaders={[t.overTime.colWeek, t.overTime.colDeals]}
            tableValue={(d) => String(d.value)}
            showTableLabel={t.overTime.showTable}
            hideTableLabel={t.overTime.hideTable}
          />
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="over-time" className="space-y-6">
      <h2 id="over-time" className="text-[22px] font-semibold text-[var(--lp-dark)]">{t.overTime.title}</h2>
      {body}
    </section>
  );
}

function WhereItWent({ stats, t }: { stats: LifetimeStats; t: Copy }) {
  const funded = num(stats.volumes.fundedUsdc);
  const share = (v: number) => (funded > 0 ? fill(t.went.share, { pct: String(Math.round((v / funded) * 100)) }) : undefined);
  const sellers = num(stats.volumes.releasedUsdc);
  const buyers = num(stats.volumes.refundedUsdc);
  const fees = num(stats.volumes.feesUsdc);
  return (
    <section aria-labelledby="went" className="space-y-6">
      <h2 id="went" className="text-[22px] font-semibold text-[var(--lp-dark)]">{t.went.title}</h2>
      <RowBars
        rows={[
          { label: t.went.sellers, value: sellers, note: share(sellers) },
          { label: t.went.buyers, value: buyers, note: share(buyers) },
          { label: t.went.fees, value: fees, note: share(fees) },
        ]}
      />
      <p className="text-[13px] text-[var(--lp-text-sub)]">{t.went.note}</p>
    </section>
  );
}

function Rails({ stats, t }: { stats: LifetimeStats; t: Copy }) {
  const financing = stats.byKind.find((k) => k.kind === 'financing');
  const staking = stats.byKind.find((k) => k.kind === 'staking');
  const treasury = stats.byKind.find((k) => k.kind === 'treasury');
  return (
    <section aria-labelledby="rails" className="space-y-6">
      <h2 id="rails" className="text-[22px] font-semibold text-[var(--lp-dark)]">{t.rails.title}</h2>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Stat label={t.rails.stakeLocked} value={glanceUsdc(num(staking?.volumes.stakedUsdc))} unit="USDC" />
        <Stat label={t.rails.stakeTaken} value={glanceUsdc(num(stats.volumes.slashedUsdc))} unit="USDC" />
        <Stat label={t.rails.yieldPaid} value={glanceUsdc(num(treasury?.volumes.yieldUsdc ?? stats.volumes.yieldUsdc))} unit="USDC" />
        <Stat label={t.rails.advanced} value={glanceUsdc(num(financing?.volumes.advancedUsdc))} unit="USDC" />
        <Stat label={t.rails.repaid} value={glanceUsdc(num(financing?.volumes.repaidUsdc))} unit="USDC" />
        <Stat label={t.rails.defaults} value={String(financing?.defaults ?? 0)} />
      </div>
    </section>
  );
}

const plainName = (name: string) =>
  name.replace(/^Karwan/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

function Contracts({
  stats,
  current,
  explorer,
  t,
}: {
  stats: LifetimeStats;
  current: CurrentContractsSnapshot | null;
  explorer: string;
  t: Copy;
}) {
  const byAddress = new Map(stats.contracts.map((c) => [c.address.toLowerCase(), c]));
  const live = current?.contracts ?? [];
  const retired = stats.contracts.filter((c) => c.status === 'retired' && c.events > 0);
  const role = (kind: ContractKind) => t.contracts.roles[kind];
  const link = (address: string) => (
    <a
      href={`${explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center mono text-[12px] text-[var(--lp-text-sub)] underline-offset-4 hover:underline"
    >
      {address.slice(0, 6)}…{address.slice(-4)} ↗
    </a>
  );
  const version = (c: LifetimeContract | undefined) =>
    c?.version && c.of && c.of > 1 ? fill(t.contracts.version, { v: String(c.version), of: String(c.of) }) : null;

  return (
    <section aria-labelledby="contracts" className="space-y-6">
      <div className="space-y-2">
        <h2 id="contracts" className="text-[22px] font-semibold text-[var(--lp-dark)]">{t.contracts.title}</h2>
        <p className="text-[15px] text-[var(--lp-text-sub)]">{t.contracts.lead}</p>
      </div>
      <ul className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
        {live.map((c) => {
          const history = byAddress.get(c.address.toLowerCase());
          return (
            <li key={c.address} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-[var(--lp-dark)]">
                  {plainName(c.name)}
                  {version(history) ? <span className="ms-2 text-[13px] font-normal text-[var(--lp-text-sub)]">{version(history)}</span> : null}
                </p>
                <p className="text-[13px] text-[var(--lp-text-sub)]">{role(c.kind)}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[14px] tabular-nums text-[var(--lp-dark)]">
                  {c.usdcBalance === null || num(c.usdcBalance) === 0
                    ? t.contracts.noFunds
                    : fill(t.contracts.holds, { amount: glanceUsdc(num(c.usdcBalance)) })}
                </span>
                {link(c.address)}
              </div>
            </li>
          );
        })}
      </ul>
      {retired.length > 0 ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-[var(--lp-dark)]">
            {t.contracts.retiredTitle} ({retired.length})
          </summary>
          <p className="mb-3 text-[13px] text-[var(--lp-text-sub)]">{t.contracts.retiredLead}</p>
          <ul className="divide-y divide-[var(--lp-border-light)]">
            {retired.map((c) => (
              <li key={c.address} className="flex flex-wrap items-center justify-between gap-x-6 py-2">
                <span className="text-[14px] text-[var(--lp-dark)]">
                  {plainName(c.name)}
                  {version(c) ? <span className="ms-2 text-[13px] text-[var(--lp-text-sub)]">{version(c)}</span> : null}
                </span>
                {link(c.address)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
