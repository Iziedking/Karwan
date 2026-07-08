'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Partner } from '@/core/api';
import { shortAddress } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
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

const SECTORS = [
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
] as const;

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

/// B2B partner directory. A business filters fellow businesses by sourcing
/// sector + region and opens a direct deal with one. Distinct from the P2P
/// listings feed (which lists individual offers); this lists COMPANIES.
export function PartnersBrowse() {
  const [sector, setSector] = useState('');
  const [region, setRegion] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [state, setState] = useState<FetchState>('idle');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    // Debounce the region text so typing doesn't fire a request per keystroke.
    const id = setTimeout(() => {
      api
        .getPartners({ sector: sector || undefined, region: region.trim() || undefined })
        .then((r) => {
          if (cancelled) return;
          setPartners(r.partners);
          setState('ready');
        })
        .catch(() => {
          if (!cancelled) setState('error');
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [sector, region]);

  return (
    <FullBleed>
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="fade-up">
          <SectionTag tone="dark">[:FIND PARTNERS:]</SectionTag>
        </div>
        <div className="fade-up fade-up-1">
          <HeroHeadline size="sm">
            Source a <Accent>business partner</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        <p className="fade-up fade-up-2 mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[52ch]">
          Businesses on Karwan, by what they trade and where. Filter, then open a
          deal directly, or post a request and let your agent run the auction.
        </p>
      </Band>

      <Band tone="light" compact>
        {/* FILTERS */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              Sector
            </span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="form-input min-w-[180px]"
            >
              <option value="">All sectors</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              Region
            </span>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Dubai, or South Asia"
              className="form-input min-w-[220px]"
              maxLength={80}
            />
          </label>
          {(sector || region) && (
            <button
              type="button"
              onClick={() => {
                setSector('');
                setRegion('');
              }}
              className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] pb-2.5"
            >
              Clear
            </button>
          )}
          <span className="ms-auto mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] pb-2.5 tabular-nums">
            {state === 'ready' ? `${partners.length} found` : ''}
          </span>
        </div>

        {/* RESULTS */}
        <div className="mt-8">
          {state === 'error' ? (
            <p className="text-[13px] text-[var(--lp-critical)]">
              Could not load partners. Try again.
            </p>
          ) : state === 'loading' || state === 'idle' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-40 rounded-2xl bg-black/[0.04] animate-pulse motion-reduce:animate-none" />
              <div className="h-40 rounded-2xl bg-black/[0.04] animate-pulse motion-reduce:animate-none" />
            </div>
          ) : partners.length === 0 ? (
            <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed max-w-[46ch]">
              No businesses match that filter yet. Widen the sector or region, or
              post a request and let your agent surface partners as they bid.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {partners.map((p) => (
                <PartnerCard key={p.address} partner={p} />
              ))}
            </div>
          )}
        </div>
      </Band>
    </FullBleed>
  );
}

function PartnerCard({ partner: p }: { partner: Partner }) {
  return (
    <PageCard>
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-sans text-[19px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)] truncate">
                {p.name}
              </h3>
              {p.verified && (
                <span
                  className="mono text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5"
                  style={{
                    color: 'var(--lp-positive)',
                    border: '1px solid var(--lp-positive)',
                    borderRadius: 3,
                  }}
                >
                  Verified
                </span>
              )}
            </div>
            <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {shortAddress(p.address)}
            </p>
          </div>
          <ReputationBadge address={p.address} size="sm" />
        </div>

        {/* Sector / region chips */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.sector && <Chip label={p.sector} accent />}
          {p.region && <Chip label={p.region} />}
          {p.canSupply && <Chip label="Supplies" />}
        </div>

        {/* Capability rows */}
        {(p.minOrderValue || p.leadTimeDays || p.certifications || p.primaryMarkets) && (
          <dl className="mt-4 space-y-2 border-t border-[var(--lp-border-light)] pt-3.5">
            {p.primaryMarkets && <CapRow label="Markets" value={p.primaryMarkets} />}
            {p.minOrderValue && <CapRow label="Min order" value={p.minOrderValue} />}
            {p.leadTimeDays ? <CapRow label="Lead time" value={`${p.leadTimeDays} days`} /> : null}
            {p.certifications && <CapRow label="Certifications" value={p.certifications} />}
          </dl>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center gap-4">
          <Link
            href={`/buyer?seller=${p.address}`}
            className="inline-flex items-center gap-1.5 mono text-[11px] font-bold uppercase tracking-[0.1em] px-3.5 py-2 bg-[var(--lp-dark)] text-[var(--lp-accent)] transition-transform hover:-translate-y-0.5"
            style={{
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 2,
            }}
          >
            Open a deal
            <span aria-hidden>→</span>
          </Link>
          <a
            href={`/credit-passport/${p.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]"
          >
            Passport ↗
          </a>
        </div>
      </div>
    </PageCard>
  );
}

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className="mono text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 capitalize"
      style={{
        background: accent
          ? 'color-mix(in oklab, var(--lp-accent) 16%, transparent)'
          : 'var(--lp-light)',
        color: 'var(--lp-dark)',
        border: '1px solid var(--lp-border-light)',
        borderRadius: 3,
      }}
    >
      {label}
    </span>
  );
}

function CapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] shrink-0">
        {label}
      </dt>
      <dd className="text-[13px] text-[var(--lp-dark)] text-right">{value}</dd>
    </div>
  );
}
