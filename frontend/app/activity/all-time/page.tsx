'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type LifetimeStats, type LifetimeContract } from '@/core/api';
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

/// All-time settlement totals, across every contract generation.
///
/// Deliberately public and deliberately not sign-in gated, unlike /activity:
/// there is nothing here about any individual. Only sums, and the addresses
/// they were summed from.

export default function AllTimePage() {
  const t = useTranslations().activity.allTime;
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unscanned' | 'error'>('loading');
  const [explorer, setExplorer] = useState('https://testnet.arcscan.app');

  useEffect(() => {
    api
      .status()
      .then((s) => setExplorer(s.chain.explorer ?? 'https://testnet.arcscan.app'))
      .catch(() => {
        /* keep default */
      });
  }, []);

  useEffect(() => {
    let live = true;
    api
      .networkLifetime()
      .then((s) => {
        if (!live) return;
        setStats(s);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!live) return;
        // 503 means the seed scan has not run on this deployment. That is an
        // operational state rather than a fault, and it should read that way.
        // Keyed on the status, not on the message text, so rewording the
        // backend's copy cannot silently turn it into a generic error.
        setState(err instanceof ApiError && err.status === 503 ? 'unscanned' : 'error');
      });
    return () => {
      live = false;
    };
  }, []);

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
          <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
            {t.description}
          </p>
        </div>
      </Band>

      <Band tone="light" compact>
        <div className="fade-up fade-up-1">
          <PageCard>
            <div className="p-6 md:p-8 space-y-8">
              {state === 'loading' && <BracketMessage tag={t.loadingTag} body={t.loadingBody} />}
              {state === 'unscanned' && (
                <BracketMessage tag={t.unscannedTag} body={t.unscannedBody} />
              )}
              {state === 'error' && <BracketMessage tag={t.errorTag} body={t.errorBody} />}
              {state === 'ready' && stats && <Totals stats={stats} explorer={explorer} t={t} />}

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

function BracketMessage({ tag, body }: { tag: string; body: string }) {
  return (
    <div className="py-10 text-center space-y-2.5 max-w-[46ch] mx-auto">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{tag}:]
      </p>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{body}</p>
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

function Totals({
  stats,
  explorer,
  t,
}: {
  stats: LifetimeStats;
  explorer: string;
  t: Copy;
}) {
  const { totals, volumes } = stats;

  return (
    <div className="space-y-8">
      {/* The headline pair. Volume is the one lime figure on the page. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Headline label={t.volumeLabel} value={usdc(volumes.fundedUsdc)} suffix="USDC" accent />
        <Headline label={t.txnsLabel} value={count(totals.transactions)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label={t.dealsLabel} value={count(totals.deals)} />
        <Stat label={t.eventsLabel} value={count(totals.events)} />
        <Stat label={t.releasedLabel} value={usdc(volumes.releasedUsdc)} />
        <Stat label={t.settledLabel} value={usdc(volumes.settledUsdc)} />
        <Stat label={t.refundedLabel} value={usdc(volumes.refundedUsdc)} />
        <Stat label={t.feesLabel} value={usdc(volumes.feesUsdc)} />
        <Stat
          label={t.contractsLabel}
          value={`${count(totals.contractsWithActivity)}/${count(totals.contracts)}`}
        />
        <Stat label={t.blocksLabel} value={count(Number(stats.toBlock) - Number(stats.fromBlock))} />
      </div>

      {/* The proof. A total across contracts nobody can name is a claim; the
          addresses and their block ranges are what make it checkable. */}
      <section className="space-y-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:{t.breakdownTag}:]
        </span>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--lp-border-light)]">
                <Th>{t.colContract}</Th>
                <Th>{t.colDeployed}</Th>
                <Th right>{t.colDeals}</Th>
                <Th right>{t.colEvents}</Th>
                <Th right>{t.colFunded}</Th>
              </tr>
            </thead>
            <tbody>
              {stats.contracts.map((c) => (
                <ContractRow key={c.address} c={c} explorer={explorer} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {totals.undecodedEvents > 0 && (
        <p className="text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.undecodedNote.replace('{n}', count(totals.undecodedEvents))}
        </p>
      )}

      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {t.scannedTo
          .replace('{from}', count(Number(stats.fromBlock)))
          .replace('{to}', count(Number(stats.toBlock)))}
      </p>
    </div>
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

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)] pb-2.5 ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function ContractRow({
  c,
  explorer,
  t,
}: {
  c: LifetimeContract;
  explorer: string;
  t: Copy;
}) {
  const unused = c.events === 0;
  return (
    <tr
      className="border-b border-[var(--lp-border-light)] last:border-0"
      style={unused ? { opacity: 0.45 } : undefined}
    >
      <td className="py-2.5 pr-4">
        <a
          href={`${explorer}/address/${c.address}`}
          target="_blank"
          rel="noreferrer"
          className="mono text-[11px] text-[var(--lp-ink)] hover:underline"
        >
          {c.address.slice(0, 10)}…{c.address.slice(-6)}
        </a>
        <span className="ml-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {c.name.replace('Karwan', '')}
        </span>
        {unused && (
          <span className="ml-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            {t.neverUsed}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-4 mono text-[11px] tabular-nums text-[var(--lp-text-sub)]">
        {count(Number(c.deployBlock))}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums text-[13px] text-[var(--lp-ink)]">
        {count(c.deals)}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums text-[13px] text-[var(--lp-ink)]">
        {count(c.events)}
      </td>
      <td className="py-2.5 text-right tabular-nums text-[13px] font-bold text-[var(--lp-ink)]">
        {usdc(c.fundedUsdc)}
      </td>
    </tr>
  );
}
