'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  api,
  ApiError,
  type ContractKind,
  type CurrentContract,
  type CurrentContractsSnapshot,
  type LifetimeStats,
  type LifetimeContract,
} from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  PageCard,
} from '@/shared/components/Bands';

/// All-time settlement totals, across every contract generation, beside what the
/// contracts in service are holding right now.
///
/// Deliberately public and deliberately not sign-in gated, unlike /activity:
/// there is nothing here about any individual. Only sums, and the addresses they
/// were summed from. The addresses are the point rather than an implementation
/// leak: a total nobody can check is a claim, and every row links to the
/// explorer so a reader can add it up themselves.
///
/// Two feeds on two clocks. The all-time sweep is history, so it only ever
/// grows at the tail and a 30-second poll keeps it within a block or two of
/// chain. Contract balances are a fact about now, read at head, and change only
/// when somebody funds or releases, which the activity feed already reports as
/// it happens. They refresh on a slower loop.

const LIFETIME_POLL_MS = 30_000;
const CONTRACTS_POLL_MS = 5 * 60_000;

export default function AllTimePage() {
  const t = useTranslations().activity.allTime;
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [current, setCurrent] = useState<CurrentContractsSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unscanned' | 'error'>('loading');
  const [explorer, setExplorer] = useState('https://testnet.arcscan.app');
  const [updatedAt, setUpdatedAt] = useState(0);

  useEffect(() => {
    api
      .status()
      .then((s) => setExplorer(s.chain.explorer ?? 'https://testnet.arcscan.app'))
      .catch(() => {
        /* keep default */
      });
  }, []);

  // `live` guards against a response landing after the component unmounted, and
  // against a slow first request overwriting a newer poll.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
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
        // 503 means the seed scan has not run on this deployment. That is an
        // operational state rather than a fault, and it should read that way.
        // Keyed on the status, not on the message text, so rewording the
        // backend's copy cannot silently turn it into a generic error.
        //
        // A failed POLL is not a failed page: keep serving the numbers already
        // on screen rather than blanking them because one refresh missed.
        setState((prev) =>
          prev === 'ready' ? prev : err instanceof ApiError && err.status === 503 ? 'unscanned' : 'error',
        );
      });
  }, []);

  const loadContracts = useCallback(() => {
    api
      .networkContracts()
      .then((c) => {
        if (alive.current) setCurrent(c);
      })
      .catch(() => {
        // The section simply does not render. The all-time totals above it do
        // not depend on this read, and half a page beats an error banner.
      });
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

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="max-w-[58ch]">
          <div className="fade-up">
            <SectionTag tone="dark">{t.sectionTag}</SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline size="md">
              {t.headlineTop}<Punc>.</Punc>
              <br />
              <Accent>{t.headlineAccent}</Accent>
            </HeroHeadline>
          </div>
          <p className="body-copy fade-up fade-up-2 mt-6 text-pretty text-[15px] text-[var(--lp-text-muted)] max-w-[44ch]">
            {t.description}
          </p>
          {state === 'ready' && stats && (
            <div className="fade-up fade-up-3 mt-7">
              <LiveStrip block={stats.toBlock} updatedAt={updatedAt} t={t} />
            </div>
          )}
        </div>
      </Band>

      <Band tone="light" compact>
        <div className="fade-up fade-up-1">
          <PageCard>
            <div className="p-6 md:p-8 space-y-10">
              {state === 'loading' && <SweepingSkeleton />}
              {state === 'unscanned' && (
                <BracketMessage tag={t.unscannedTag} body={t.unscannedBody} />
              )}
              {state === 'error' && <BracketMessage tag={t.errorTag} body={t.errorBody} />}
              {state === 'ready' && stats && (
                <Totals stats={stats} current={current} explorer={explorer} t={t} />
              )}

              <div className="pt-6 border-t border-[var(--lp-border-light)]">
                <Link
                  href="/activity"
                  className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-ink)] transition-colors"
                >
                  {t.backToActivity}
                </Link>
              </div>
            </div>
          </PageCard>
        </div>
      </Band>
    </FullBleed>
  );
}

type Copy = ReturnType<typeof useTranslations>['activity']['allTime'];

/// Head block and how stale the reading is, with the breathing dot the charter
/// asks for wherever data is live. The seconds counter ticks on its own so the
/// page reads as watching rather than as a snapshot somebody left open.
function LiveStrip({ block, updatedAt, t }: { block: string; updatedAt: number; t: Copy }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const age = Math.max(0, Math.round((now - updatedAt) / 1000));
  const stamp = age < 5 ? t.updatedNow : t.updatedAgo.replace('{n}', String(age));

  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-2 mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
        <span aria-hidden className="live-dot w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
        {t.liveTag}
      </span>
      <span aria-hidden className="w-px h-3 bg-white/15" />
      <span className="mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--lp-text-muted)]">
        {t.blockLabel.replace('{block}', Number(block).toLocaleString('en-US'))}
      </span>
      <span aria-hidden className="w-px h-3 bg-white/15" />
      <span className="mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--lp-text-muted)]">
        {stamp}
      </span>
      <style jsx>{`
        .live-dot {
          animation: breathe 2.4s ease-in-out infinite;
        }
        @keyframes breathe {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-dot {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function BracketMessage({ tag, body }: { tag: string; body?: string }) {
  return (
    <div className="py-10 text-center space-y-2.5 max-w-[46ch] mx-auto">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{tag}:]
      </p>
      {body && <p className="body-copy text-[14px] text-[var(--lp-text-sub)]">{body}</p>}
    </div>
  );
}

/// The charter forbids the word "Loading". A lime hairline sweeping under a
/// skeleton says the same thing without saying it.
function SweepingSkeleton() {
  return (
    <div className="py-10 space-y-4" aria-busy="true">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonBlock height={116} />
        <SkeletonBlock height={116} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} height={74} />
        ))}
      </div>
    </div>
  );
}

function SkeletonBlock({ height }: { height: number }) {
  return (
    <div
      className="skel relative overflow-hidden rounded-xl border border-[var(--lp-border-light)]"
      style={{ height }}
    >
      <style jsx>{`
        .skel::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: 0;
          height: 1px;
          width: 40%;
          background: var(--lp-accent);
          animation: sweep 1.4s ease-in-out infinite;
        }
        @keyframes sweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(350%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .skel::after {
            animation: none;
            width: 100%;
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}

/// Money, formatted the way a settlement desk reads it: grouped thousands, two
/// decimals, USDC suffix carried by the label rather than repeated on every row.
function usdc(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function count(n: number): string {
  return n.toLocaleString('en-US');
}

/// True when a decimal USDC string is worth showing. `Number` rather than a
/// string compare, because '0', '0.0' and '0.000000' all mean the same thing and
/// only one of them is what the API happens to send.
function moved(value: string): boolean {
  return Number(value) > 0;
}

function Totals({
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
  const { totals, volumes } = stats;
  const financing = stats.byKind.find((k) => k.kind === 'financing');
  const staking = stats.byKind.find((k) => k.kind === 'staking');
  const treasury = stats.byKind.find((k) => k.kind === 'treasury');

  // Every rail is rendered, including one sitting at zero. Hiding an empty
  // section would be tidier and would answer a different question: a reader
  // checking whether trade finance has moved anything cannot tell "nothing yet"
  // apart from "not on this page" if the section is simply absent. Zero is the
  // answer, so the page gives it.

  return (
    <div className="space-y-10">
      {/* The headline pair. Volume is the one lime figure on the page.

          It reads every USDC that ENTERED a Karwan contract: escrow funding,
          financier advances, and stake locked. It used to be escrow funding
          alone, which quietly told a reader that the financing and staking
          rails below it were not money. The out-legs stay out, since counting
          a dollar arriving and the same dollar leaving reports the trade
          twice. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Headline label={t.volumeLabel} value={usdc(stats.totalMovedUsdc)} suffix="USDC" accent />
        <Headline label={t.txnsLabel} value={count(totals.transactions)} />
      </div>

      {/* Settlement. Money and deals only. Event counts, block spans and
          undecodable-log tallies were on this page and none of them are a
          user's question: they are how the number was produced, not what it
          says. They stay in the scan script's output, where whoever runs it
          needs them.

          Ordered as the funnel runs: what was asked for, what got funded, then
          where the money ended up. */}
      <Section tag={t.settlementTag} body={t.settlementBody}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label={t.jobsPostedLabel} value={count(totals.jobsPosted)} />
          <Stat label={t.dealsLabel} value={count(totals.deals)} />
          <Stat label={t.feesLabel} value={usdc(volumes.feesUsdc)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <Stat label={t.releasedLabel} value={usdc(volumes.releasedUsdc)} />
          <Stat label={t.settledLabel} value={usdc(volumes.settledUsdc)} />
          <Stat label={t.refundedLabel} value={usdc(volumes.refundedUsdc)} />
        </div>
      </Section>

      {/* Invoice factoring and purchase-order advances, from two contracts and
          one bucket. Deliberately not added to the headline volume above: an
          advance is a financier's capital moving against a deal that already
          counted its own value when the escrow was funded, so folding them
          together would report one trade twice. */}
      <Section tag={t.financingTag} body={t.financingBody}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label={t.advancedLabel} value={usdc(financing?.volumes.advancedUsdc ?? '0')} />
          <Stat label={t.repaidLabel} value={usdc(financing?.volumes.repaidUsdc ?? '0')} />
          <Stat label={t.financingsLabel} value={count(financing?.financings ?? 0)} />
          <Stat label={t.defaultsLabel} value={count(financing?.defaults ?? 0)} />
        </div>
      </Section>

      {/* Slashing is read from the platform total rather than the staking
          rollup: stake is forfeited both by losing a dispute in the escrow and
          by defaulting on an advance, and it is the same money either way. */}
      <Section tag={t.stakingTag} body={t.stakingBody}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label={t.stakedLabel} value={usdc(staking?.volumes.stakedUsdc ?? '0')} />
          <Stat label={t.slashedLabel} value={usdc(volumes.slashedUsdc)} />
          <Stat label={t.yieldLabel} value={usdc(treasury?.volumes.yieldUsdc ?? volumes.yieldUsdc)} />
        </div>
      </Section>

      {current && current.contracts.length > 0 && (
        <CurrentContracts snapshot={current} explorer={explorer} t={t} />
      )}

      <Ledger stats={stats} explorer={explorer} t={t} />
    </div>
  );
}

function Section({
  tag,
  body,
  children,
}: {
  tag: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{tag}:]
      </span>
      {body && (
        <p className="body-copy text-[13px] text-[var(--lp-text-sub)] max-w-[62ch]">{body}</p>
      )}
      <div className="pt-1">{children}</div>
    </section>
  );
}

/// What the running deployment is wired to, and what each contract holds now.
///
/// Separate from the ledger below on purpose. That one is history and every row
/// in it is retired but one; this is the short list a reader actually wants when
/// they ask "so where is the money right now".
function CurrentContracts({
  snapshot,
  explorer,
  t,
}: {
  snapshot: CurrentContractsSnapshot;
  explorer: string;
  t: Copy;
}) {
  return (
    <Section tag={t.currentTag} body={t.currentBody}>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <Stat label={t.custodiedLabel} value={usdc(snapshot.totals.custodiedUsdc)} />
        <Stat
          label={t.liveCountLabel}
          value={`${count(snapshot.totals.live)} / ${count(snapshot.totals.configured)}`}
        />
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full min-w-[520px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-[var(--lp-border-light)]">
              <Th>{t.colContract}</Th>
              <Th width="7.5rem">{t.colStatus}</Th>
              <Th right width="6rem">{t.colReplaced}</Th>
              <Th right width="9rem">{t.colBalance}</Th>
            </tr>
          </thead>
          <tbody>
            {snapshot.contracts.map((c, i) => (
              <CurrentRow key={c.address} c={c} index={i} explorer={explorer} t={t} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function CurrentRow({
  c,
  index,
  explorer,
  t,
}: {
  c: CurrentContract;
  index: number;
  explorer: string;
  t: Copy;
}) {
  return (
    <tr className="border-b border-[var(--lp-border-light)] last:border-0 hover:bg-[rgba(10,10,11,0.03)] transition-colors">
      <td className="py-3 pe-4">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--lp-ink)] truncate">
              {c.name.replace('Karwan', '')}
            </p>
            <a
              href={`${explorer}/address/${c.address}`}
              target="_blank"
              rel="noreferrer"
              className="mono text-[10px] text-[var(--lp-text-muted)] hover:text-[var(--lp-ink)] hover:underline transition-colors"
            >
              {c.address.slice(0, 10)}…{c.address.slice(-6)} ↗
            </a>
          </div>
        </div>
      </td>
      <td className="py-3 pe-4">
        <StatusPill live={c.live} t={t} />
      </td>
      <td className="py-3 pe-4 text-end mono text-[11px] tabular-nums text-[var(--lp-text-muted)]">
        {c.supersededGenerations > 0 ? count(c.supersededGenerations) : '—'}
      </td>
      <td className="py-3 text-end tabular-nums text-[13px] font-bold text-[var(--lp-ink)]">
        {c.usdcBalance === null ? (
          <span className="mono text-[10px] uppercase tracking-[0.12em] font-normal text-[var(--lp-text-muted)]">
            {t.notApplicable}
          </span>
        ) : (
          usdc(c.usdcBalance)
        )}
      </td>
    </tr>
  );
}

function StatusPill({ live, t }: { live: boolean; t: Copy }) {
  const color = live ? 'var(--lp-accent)' : 'var(--lp-text-muted)';
  return (
    <span
      className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 rounded-full"
      style={{
        color,
        background: live ? 'color-mix(in srgb, var(--lp-accent) 8%, transparent)' : 'transparent',
        border: `1px solid color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {live ? t.statusLive : t.statusMissing}
    </span>
  );
}

/// Every contract ever, grouped by what it does.
///
/// Only the ones that carried something are listed. The rest were deployed and
/// superseded before anyone touched them, so a row of zeros is noise, and each
/// group header still says how many exist against how many were used, which
/// means nothing is being quietly dropped.
function Ledger({
  stats,
  explorer,
  t,
}: {
  stats: LifetimeStats;
  explorer: string;
  t: Copy;
}) {
  const label: Record<ContractKind, string> = {
    settlement: t.settlementTag,
    financing: t.financingTag,
    staking: t.stakingTag,
    treasury: t.treasuryTag,
    registry: t.registryTag,
  };

  const groups = stats.byKind
    .map((k) => ({
      kind: k.kind,
      rollup: k,
      rows: stats.contracts.filter((c) => c.kind === k.kind && c.events > 0),
    }))
    .filter((g) => g.rows.length > 0);

  if (groups.length === 0) return null;

  return (
    <Section tag={t.ledgerTag} body={t.ledgerBody}>
      <div className="space-y-7">
        {groups.map((g) => (
          <div key={g.kind} className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-ink)]">
                {label[g.kind]}
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[var(--lp-text-muted)]">
                {g.rollup.contracts === 1
                  ? t.generationsOne
                  : t.generationsMany.replace('{n}', String(g.rollup.contracts))}
              </span>
            </div>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[460px] table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-[var(--lp-border-light)]">
                    <Th>{t.colContract}</Th>
                    <Th right width="6rem">{t.colEvents}</Th>
                    <Th right width="9rem">{t.colMoved}</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((c, i) => (
                    <LedgerRow key={c.address} c={c} index={i} explorer={explorer} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/// The measure a contract of this kind actually moves. Printing `funded` for a
/// financing contract prints zero, and a zero in a money column reads as an
/// unused rail rather than as the wrong column.
function movedBy(c: LifetimeContract): string {
  switch (c.kind) {
    case 'financing':
      return c.advancedUsdc;
    case 'staking':
      return c.stakedUsdc;
    case 'treasury':
      return c.yieldUsdc;
    default:
      return c.fundedUsdc;
  }
}

function LedgerRow({
  c,
  index,
  explorer,
}: {
  c: LifetimeContract;
  index: number;
  explorer: string;
}) {
  const amount = movedBy(c);
  return (
    <tr className="border-b border-[var(--lp-border-light)] last:border-0 hover:bg-[rgba(10,10,11,0.03)] transition-colors">
      <td className="py-2.5 pe-4">
        <span className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)] me-2">
          {String(index + 1).padStart(2, '0')}
        </span>
        <a
          href={`${explorer}/address/${c.address}`}
          target="_blank"
          rel="noreferrer"
          className="mono text-[11px] text-[var(--lp-ink)] hover:underline"
        >
          {c.address.slice(0, 10)}…{c.address.slice(-6)} ↗
        </a>
      </td>
      <td className="py-2.5 pe-4 text-end mono text-[11px] tabular-nums text-[var(--lp-text-muted)]">
        {count(c.events)}
      </td>
      <td className="py-2.5 text-end tabular-nums text-[13px] font-bold text-[var(--lp-ink)]">
        {moved(amount) ? usdc(amount) : '—'}
      </td>
    </tr>
  );
}

function Headline({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="p-6 md:p-7"
      style={{
        background: 'var(--lp-band-dark)',
        color: 'white',
        border: accent ? '1px solid var(--lp-accent)' : '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">{label}</p>
      <p className="mt-3 flex items-baseline gap-2">
        <span
          className="tabular-nums font-bold leading-none"
          style={{
            fontSize: 'clamp(28px, 4vw, 44px)',
            letterSpacing: '-0.02em',
            color: accent ? 'var(--lp-accent)' : 'white',
          }}
        >
          {value}
        </span>
        {suffix && (
          <span className="mono text-[11px] uppercase tracking-[0.14em] text-white/55">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--lp-border-light)]">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      <p className="mt-2 tabular-nums text-[19px] font-bold text-[var(--lp-ink)]">{value}</p>
    </div>
  );
}

function Th({
  children,
  right,
  width,
}: {
  children: React.ReactNode;
  right?: boolean;
  /// Explicit width on the measured columns.
  ///
  /// Without it the table shares the leftover space out between every column,
  /// so a status pill and a four-digit number drift apart on a wide screen and
  /// the header stops sitting over its own values. Pinning the narrow columns
  /// lets the contract name take the slack instead, which is the only column
  /// that wants it.
  width?: string;
}) {
  return (
    <th
      style={width ? { width } : undefined}
      className={`mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)] pb-2.5 ${
        right ? 'text-end' : 'text-start'
      }`}
    >
      {children}
    </th>
  );
}
