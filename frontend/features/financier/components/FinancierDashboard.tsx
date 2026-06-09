'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, type DirectDeal, type FactoringOffer } from '@/core/api';
import { Band, SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

// Hoisted constants per Vercel `rendering-hoist-jsx`.
type Tab = 'factor' | 'po';

const TABS: ReadonlyArray<{ id: Tab; label: string; available: boolean }> = [
  { id: 'factor', label: 'Factor invoices', available: true },
  { id: 'po', label: 'Fund POs', available: false },
];

const SECTOR_FILTERS: ReadonlyArray<string> = [
  '',
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
];

/// Tier-default discount in basis points per sme-design.md §8.2.
/// Reading from the seller's tier is a Day 12 follow-up; for now the
/// financier picks via the modal slider with these as suggestions.
const TIER_DISCOUNT_HINT: Record<string, number> = {
  ELITE: 100, // 1%
  STRONG: 200, // 2%
  ESTABLISHED: 400, // 4% (v2 gating)
};

export function FinancierDashboard() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('factor');
  const [sectorFilter, setSectorFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [available, setAvailable] = useState<DirectDeal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerTarget, setOfferTarget] = useState<DirectDeal | null>(null);

  useEffect(() => {
    if (tab !== 'factor') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listFactoringAvailable({
        sector: sectorFilter || undefined,
        region: regionFilter || undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setAvailable(r.deals);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, sectorFilter, regionFilter]);

  return (
    <main className="min-h-[70vh]">
      <Band tone="light" compact>
        <SectionTag>[:FINANCIER:]</SectionTag>
        <HeroHeadline size="md">
          Fund real trade<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          Browse SME invoices and POs open to early payout. Every deal carries a
          credit passport, an on-chain settlement path, and a verifiable
          repayment record.
        </p>
        {/* TAB BAR */}
        <div className="mt-7 flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!t.available}
              onClick={() => t.available && setTab(t.id)}
              className={cn(
                'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                tab === t.id
                  ? 'bg-[var(--lp-dark)] text-[var(--lp-bg)] border-[var(--lp-dark)]'
                  : 'bg-transparent text-[var(--lp-dark)] border-black/15 hover:border-black/40',
                !t.available && 'opacity-40 cursor-not-allowed',
              )}
              style={{
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {t.label}
              {!t.available ? <span className="ms-2 opacity-60">soon</span> : null}
            </button>
          ))}
        </div>
        {/* FILTERS — only when on factor tab */}
        {tab === 'factor' ? (
          <div className="mt-6 flex gap-3 flex-wrap items-center">
            <FilterSelect
              label="Sector"
              value={sectorFilter}
              onChange={setSectorFilter}
              options={SECTOR_FILTERS}
            />
            <FilterText
              label="Region"
              value={regionFilter}
              onChange={setRegionFilter}
              placeholder="e.g. Lagos"
            />
            {sectorFilter || regionFilter ? (
              <button
                type="button"
                onClick={() => {
                  setSectorFilter('');
                  setRegionFilter('');
                }}
                className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </Band>

      <Band tone="light" compact>
        {tab === 'factor' ? (
          <FactorInvoicesTab
            available={available}
            loading={loading}
            error={error}
            onOpenOffer={(deal) => setOfferTarget(deal)}
          />
        ) : (
          <p className="text-[14px] text-[var(--lp-text-muted)]">
            PO financing tab opens Day 14.
          </p>
        )}
      </Band>

      {offerTarget ? (
        <OfferModal
          deal={offerTarget}
          isAuthed={auth.isAuthenticated}
          onClose={() => setOfferTarget(null)}
          onPosted={() => {
            setOfferTarget(null);
            // Re-fetch the list so the just-bid invoice no longer appears.
            api
              .listFactoringAvailable({
                sector: sectorFilter || undefined,
                region: regionFilter || undefined,
              })
              .then((r) => setAvailable(r.deals))
              .catch(() => {});
          }}
        />
      ) : null}
    </main>
  );
}

/* =============================================================== */
/*                           FACTOR TAB                             */
/* =============================================================== */

function FactorInvoicesTab({
  available,
  loading,
  error,
  onOpenOffer,
}: {
  available: DirectDeal[] | null;
  loading: boolean;
  error: string | null;
  onOpenOffer: (deal: DirectDeal) => void;
}) {
  if (loading && available === null) {
    return <SkeletonGrid />;
  }
  if (error) {
    return (
      <p className="text-[14px] text-[var(--lp-critical)]">
        Couldn't load opportunities: {error}
      </p>
    );
  }
  if (!available || available.length === 0) {
    return (
      <p className="text-[14px] text-[var(--lp-text-muted)] leading-relaxed">
        No factoring opportunities open right now. Check back as new
        deals get accepted.
      </p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {available.map((deal) => (
        <InvoiceCard key={deal.jobId} deal={deal} onOpenOffer={() => onOpenOffer(deal)} />
      ))}
    </div>
  );
}

function InvoiceCard({
  deal,
  onOpenOffer,
}: {
  deal: DirectDeal;
  onOpenOffer: () => void;
}) {
  const settlementWindow =
    deal.paymentTerms === 'net30'
      ? 'NET 30'
      : deal.paymentTerms === 'net60'
        ? 'NET 60'
        : deal.paymentTerms === 'net90'
          ? 'NET 90'
          : 'IMMEDIATE';
  return (
    <PageCard>
      <div className="p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:FACE VALUE:]
            </p>
            <p className="mt-1 serif text-[32px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
              <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 border border-black/15 text-[var(--lp-dark)]">
            {settlementWindow}
          </span>
        </div>
        <CompanyLine deal={deal} />
        <div className="pt-3 border-t border-[var(--lp-border-light)] flex items-center justify-between gap-3 flex-wrap">
          <Link
            href={`/credit-passport/${deal.seller}`}
            target="_blank"
            className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            Seller passport ↗
          </Link>
          <button
            type="button"
            onClick={onOpenOffer}
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 bg-[var(--lp-dark)] text-[var(--lp-bg)]"
            style={{
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
          >
            Make offer
          </button>
        </div>
      </div>
    </PageCard>
  );
}

function CompanyLine({ deal }: { deal: DirectDeal }) {
  const c = deal.counterpartyCompany;
  if (!c?.name && !c?.sector && !c?.region) {
    return (
      <p className="text-[12px] text-[var(--lp-text-muted)]">
        Seller: {shortAddress(deal.seller)}
      </p>
    );
  }
  return (
    <div className="text-[12.5px] leading-snug">
      {c.name ? (
        <p className="text-[var(--lp-dark)] font-medium">{c.name}</p>
      ) : null}
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mt-1">
        {[c.sector, c.region].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <PageCard key={i}>
          <div className="p-5 md:p-6 space-y-3 opacity-50">
            <div className="h-3 w-24 bg-black/10" />
            <div className="h-9 w-36 bg-black/10" />
            <div className="h-3 w-48 bg-black/10" />
            <div className="h-3 w-32 bg-black/10" />
          </div>
        </PageCard>
      ))}
    </div>
  );
}

/* =============================================================== */
/*                          FILTER ROW                              */
/* =============================================================== */

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<string>;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input text-[12px] py-1.5 px-2"
        style={{ minWidth: 120 }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || 'Any'}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input text-[12px] py-1.5 px-2"
        style={{ minWidth: 140 }}
      />
    </label>
  );
}

/* =============================================================== */
/*                          OFFER MODAL                             */
/* =============================================================== */

function OfferModal({
  deal,
  isAuthed,
  onClose,
  onPosted,
}: {
  deal: DirectDeal;
  isAuthed: boolean;
  onClose: () => void;
  onPosted: (offer: FactoringOffer) => void;
}) {
  const face = Number(deal.dealAmountUsdc);
  const [discountBps, setDiscountBps] = useState<number>(200); // 2% default
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = face * (1 - discountBps / 10_000);
  const repay = face;
  const profit = repay - advance;

  async function submit() {
    if (!isAuthed) {
      setError('Sign in to post an offer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.postFactoringOffer({
        invoiceId: deal.jobId,
        offeredAdvanceUsdc: advance.toFixed(6),
        expectedReturnUsdc: repay.toFixed(6),
        expiresInHours: 24,
      });
      onPosted(r.offer);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-3"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--lp-light)] border border-[var(--lp-border-light)] w-full max-w-[440px] overflow-hidden"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 3,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--lp-border-light)] flex items-center justify-between gap-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:OFFER:]
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] leading-none text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5 md:p-6 space-y-5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              FACE VALUE
            </p>
            <p className="mt-1 serif text-[28px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
              <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>

          {/* Tier-default presets per sme-design.md §8.2 */}
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mb-2">
              Quick discount
            </p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(TIER_DISCOUNT_HINT).map(([tier, bps]) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setDiscountBps(bps)}
                  className={cn(
                    'mono text-[10px] uppercase tracking-[0.14em] font-bold px-2.5 py-1 border transition-colors',
                    discountBps === bps
                      ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)] border-[var(--lp-accent)]'
                      : 'bg-transparent text-[var(--lp-dark)] border-black/15 hover:border-black/40',
                  )}
                  style={{
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 6,
                    borderBottomRightRadius: 2,
                  }}
                >
                  {tier} · {(bps / 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                Custom discount
              </span>
              <span className="mono text-[14px] tabular-nums font-extrabold text-[var(--lp-dark)]">
                {(discountBps / 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={800}
              step={25}
              value={discountBps}
              onChange={(e) => setDiscountBps(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 flex justify-between mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              <span>1%</span>
              <span>8%</span>
            </div>
          </div>

          <dl className="pt-3 border-t border-[var(--lp-border-light)] space-y-2.5">
            <ModalRow label="You pay seller now" value={`${advance.toFixed(2)} USDC`} />
            <ModalRow label="You receive on settlement" value={`${repay.toFixed(2)} USDC`} bold />
            <ModalRow
              label="Your spread"
              value={`+${profit.toFixed(2)} USDC`}
              accent
            />
          </dl>

          {error ? (
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full mono text-[12px] uppercase tracking-[0.14em] font-bold py-3 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-60"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            {submitting ? 'Posting…' : isAuthed ? 'Post offer · 24h' : 'Sign in to post'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  const valueClass = accent
    ? 'text-[var(--lp-accent-strong, var(--lp-dark))] font-extrabold'
    : bold
      ? 'text-[var(--lp-dark)] font-extrabold'
      : 'text-[var(--lp-dark)]';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </dt>
      <dd className={cn('text-[14px] tabular-nums', valueClass)}>{value}</dd>
    </div>
  );
}
