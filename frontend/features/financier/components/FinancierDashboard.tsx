'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWalletClient, usePublicClient, useChainId } from 'wagmi';
import { parseUnits } from 'viem';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type DirectDeal, type FactoringOffer, type POFinancingLine } from '@/core/api';
import { Band, SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';
import { PageTour } from '@/shared/guide/PageTour';
import { FINANCIER_DESK_TOUR_ID, FINANCIER_DESK_STEPS } from '@/shared/guide/tours';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  KARWAN_PO_FINANCING_ADDRESS,
} from '@/features/profile/config';
import {
  buildTransferAuthorization,
  serializeAuthorization,
} from '@/features/factoring/usdcAuthorization';

/// Actionable empty state for a funding lane (SKILL §5.3 bracket-message
/// pattern): what the lane is, why it is empty, and one way to act. Replaces the
/// bare grey sentence the review flagged, so an empty desk still orients a
/// first-time financier rather than dead-ending them.
function DeskEmpty({ tag, body }: { tag: string; body: string }) {
  return (
    <div className="py-4">
      <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        [:{tag}:]
      </span>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
        {body}
      </p>
      <Link
        href="/market"
        className="mt-4 inline-flex items-center gap-1.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] hover:text-[var(--lp-accent-hover)] transition-colors"
      >
        Browse live trade <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

/// Turn a thrown signing/submit error into one short human line. A wallet
/// rejection is the common case and should read calmly, never dump the raw
/// viem string (with its "Version: viem@x" tag) into the modal.
function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    return typeof e.detail === 'string' && e.detail.trim() ? e.detail : e.message;
  }
  const msg = (e as Error)?.message ?? '';
  if (/user rejected|user denied|rejected the request|denied (the )?signature/i.test(msg)) {
    return 'You declined the signature, so the offer was not posted.';
  }
  const firstLine = msg.split('\n')[0]?.replace(/\s*Version:\s*viem@[\d.]+\s*$/i, '').trim();
  return firstLine || 'Could not post the offer. Please try again.';
}

// USDC + KarwanPOFinancing ABIs. Hoisted to module scope per Vercel
// `rendering-hoist-jsx`; both are tiny and `as const` enables viem's
// strict type inference.
const usdcAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const poFinancingAbi = [
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'invoiceId', type: 'bytes32' },
      { name: 'principalUsdc', type: 'uint128' },
      { name: 'repayUsdc', type: 'uint128' },
      { name: 'releaseTimeoutSeconds', type: 'uint64' },
    ],
    outputs: [],
  },
] as const;

// Hoisted constants per Vercel `rendering-hoist-jsx`.
type Tab = 'factor' | 'po';

// Seller reputation tier colours, mirroring the rest of the app's tier hues.
const SELLER_TIER_HUE: Record<string, string> = {
  new: '#9a9a9a',
  cold: '#e0a23c',
  established: 'var(--lp-accent)',
  strong: '#5fd08a',
  elite: '#39e08a',
};

const TABS: ReadonlyArray<{ id: Tab; label: string; available: boolean }> = [
  { id: 'factor', label: 'Factor invoices', available: true },
  { id: 'po', label: 'Fund POs', available: true },
];

/// Release timeout presets. The financier picks how long they're
/// willing to wait for PoD before reclaiming principal. Aligned to
/// payment-term defaults from sme-design.md §9.2.
const RELEASE_TIMEOUT_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '7 DAYS', seconds: 7 * 86_400 },
  { label: '30 DAYS', seconds: 30 * 86_400 },
  { label: '45 DAYS', seconds: 45 * 86_400 },
  { label: '75 DAYS', seconds: 75 * 86_400 },
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
  // PO-tab state. Split from the factor tab so a tab switch never
  // re-renders the inactive surface, per Vercel
  // `rerender-split-combined-hooks`.
  const [poAvailable, setPoAvailable] = useState<DirectDeal[] | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  const [fundTarget, setFundTarget] = useState<DirectDeal | null>(null);

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

  // PO-tab fetch. Mirrors the factor-tab effect but reads the PO
  // financing endpoint. Filters share the sector + region UI.
  useEffect(() => {
    if (tab !== 'po') return;
    let cancelled = false;
    setPoLoading(true);
    setPoError(null);
    api
      .listPOFinancingAvailable({
        sector: sectorFilter || undefined,
        region: regionFilter || undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setPoAvailable(r.deals);
      })
      .catch((e) => {
        if (cancelled) return;
        setPoError((e as Error).message);
      })
      .finally(() => {
        if (cancelled) return;
        setPoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, sectorFilter, regionFilter]);

  return (
    <main className="min-h-[70vh]">
      <PageTour id={FINANCIER_DESK_TOUR_ID} steps={FINANCIER_DESK_STEPS} />
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
        <div className="mt-7 flex gap-2 flex-wrap" data-guide="financier-tabs">
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
        {/* FILTERS: only when on factor tab */}
        {tab === 'factor' ? (
          <div className="mt-6 flex gap-3 flex-wrap items-center" data-guide="financier-filters">
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
          <FundPOsTab
            available={poAvailable}
            loading={poLoading}
            error={poError}
            onOpenFund={(deal) => setFundTarget(deal)}
          />
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
      {fundTarget ? (
        <FundModal
          deal={fundTarget}
          isAuthed={auth.isAuthenticated}
          onClose={() => setFundTarget(null)}
          onFunded={() => {
            setFundTarget(null);
            api
              .listPOFinancingAvailable({
                sector: sectorFilter || undefined,
                region: regionFilter || undefined,
              })
              .then((r) => setPoAvailable(r.deals))
              .catch(() => {});
          }}
        />
      ) : null}
    </main>
  );
}

// Factor tab

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
      <DeskEmpty
        tag="NO OPEN FACTORING"
        body="Nothing to fund right now. Invoices appear here the moment a seller raises one on an accepted deal."
      />
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
      <div className="p-5 md:p-6 space-y-4" data-guide="financier-deal">
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
          <div className="flex flex-col items-end gap-1.5">
            {deal.sellerTier ? (
              <span
                className="mono text-[10px] uppercase tracking-[0.16em] font-bold px-2.5 py-1"
                style={{
                  border: `1px solid ${SELLER_TIER_HUE[deal.sellerTier] ?? '#9a9a9a'}`,
                  color: 'var(--lp-dark)',
                }}
                title="Seller reputation tier. Drives the discount floor and the stake the seller must post to take the advance."
              >
                {deal.sellerTier.toUpperCase()}
              </span>
            ) : null}
            <span className="mono text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 border border-black/15 text-[var(--lp-dark)]">
              {settlementWindow}
            </span>
          </div>
        </div>
        <CompanyLine deal={deal} />
        <div className="pt-3 border-t border-[var(--lp-border-light)] flex items-center justify-between gap-3 flex-wrap">
          <Link
            href={`/credit-passport/${deal.seller}`}
            target="_blank"
            data-guide="financier-passport"
            className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            Seller passport ↗
          </Link>
          <button
            type="button"
            onClick={onOpenOffer}
            data-guide="financier-offer"
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

// Filter row

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

// Offer modal

const OFFER_EXPIRES_HOURS = 24;

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
  const auth = useAuth();
  const { data: walletClient } = useWalletClient();
  const face = Number(deal.dealAmountUsdc);
  const [discountBps, setDiscountBps] = useState<number>(200); // 2% default
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = face * (1 - discountBps / 10_000);
  const repay = face;
  const profit = repay - advance;
  const isCircleUser = auth.method === 'circle';

  async function submit() {
    if (!isAuthed) {
      setError('Sign in to post an offer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Web3 financiers sign the advance authorization now (USDC
      // EIP-3009, no gas, no transfer yet). The relay submits it the
      // moment the seller accepts, so the advance lands without the
      // financier being online. Circle financiers skip this; the backend
      // signs from their identity wallet at accept time.
      let advanceAuthorization;
      if (!isCircleUser) {
        if (!walletClient || !auth.address) {
          setError('Connect your wallet to sign the advance authorization.');
          setSubmitting(false);
          return;
        }
        const typed = buildTransferAuthorization({
          from: auth.address as `0x${string}`,
          to: deal.seller as `0x${string}`,
          valueUsdc: advance.toFixed(6),
          // Covers the offer window plus margin for the backend check.
          validForSeconds: (OFFER_EXPIRES_HOURS + 4) * 3600,
        });
        const signature = await walletClient.signTypedData({
          account: auth.address as `0x${string}`,
          ...typed,
        });
        advanceAuthorization = serializeAuthorization(typed.message, signature);
      }
      const r = await api.postFactoringOffer({
        invoiceId: deal.jobId,
        offeredAdvanceUsdc: advance.toFixed(6),
        expectedReturnUsdc: repay.toFixed(6),
        expiresInHours: OFFER_EXPIRES_HOURS,
        advanceAuthorization,
      });
      onPosted(r.offer);
    } catch (e) {
      setError(friendlyError(e));
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
              max={2000}
              step={50}
              value={discountBps}
              onChange={(e) => setDiscountBps(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 flex justify-between mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              <span>1%</span>
              <span>20%</span>
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

// Fund POs tab

function FundPOsTab({
  available,
  loading,
  error,
  onOpenFund,
}: {
  available: DirectDeal[] | null;
  loading: boolean;
  error: string | null;
  onOpenFund: (deal: DirectDeal) => void;
}) {
  if (loading && available === null) {
    return <SkeletonGrid />;
  }
  if (error) {
    return (
      <p className="text-[14px] text-[var(--lp-critical)]">
        Couldn't load PO lines: {error}
      </p>
    );
  }
  if (!available || available.length === 0) {
    return (
      <DeskEmpty
        tag="NO OPEN PO LINES"
        body="Nothing to fund right now. Lines appear here as sellers draw against accepted purchase orders."
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {available.map((deal) => (
        <POCard key={deal.jobId} deal={deal} onOpenFund={() => onOpenFund(deal)} />
      ))}
    </div>
  );
}

function POCard({
  deal,
  onOpenFund,
}: {
  deal: DirectDeal;
  onOpenFund: () => void;
}) {
  return (
    <PageCard>
      <div className="p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:PO VALUE:]
            </p>
            <p className="mt-1 serif text-[32px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
              <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>
          <div className="text-end">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              REPAY ON PoD
            </p>
            <p className="mt-1 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-dark)]">
              BUYER OR ATTESTER
            </p>
          </div>
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
            onClick={onOpenFund}
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 bg-[var(--lp-dark)] text-[var(--lp-bg)]"
            style={{
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
          >
            Fund line
          </button>
        </div>
      </div>
    </PageCard>
  );
}

// Fund modal

function FundModal({
  deal,
  isAuthed,
  onClose,
  onFunded,
}: {
  deal: DirectDeal;
  isAuthed: boolean;
  onClose: () => void;
  onFunded: (line: POFinancingLine) => void;
}) {
  const auth = useAuth();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const face = Number(deal.dealAmountUsdc);
  // Default principal at 80% of face, repay at 84% (5% fee on principal).
  // Matches the demo scenario in sme-design.md §17 (5% PO financing fee).
  const [principal, setPrincipal] = useState<number>(Math.round(face * 0.8 * 100) / 100);
  const [repay, setRepay] = useState<number>(Math.round(face * 0.84 * 100) / 100);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30 * 86_400);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'idle' | 'approving' | 'funding' | 'mirroring'>('idle');
  const [error, setError] = useState<string | null>(null);

  const isCircleUser = auth.method === 'circle';
  const address = auth.address as `0x${string}` | undefined;
  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;
  const spread = repay - principal;
  const validRepay = repay > principal && repay <= face;

  async function submit() {
    if (!isAuthed || !address) {
      setError('Sign in to fund a PO line.');
      return;
    }
    if (!validRepay) {
      setError('Repay must be greater than principal and at most the PO value.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setStep('idle');
    try {
      if (isCircleUser) {
        // Circle DCW path. Backend signs approve + fund via the user's
        // identity wallet, returns both tx hashes, mirrors the line.
        setStep('funding');
        const r = await api.fundPOLineCircle({
          address,
          invoiceId: deal.jobId,
          principalUsdc: principal.toFixed(6),
          repayUsdc: repay.toFixed(6),
          releaseTimeoutSeconds: timeoutSeconds,
        });
        onFunded(r.line);
      } else {
        if (!walletClient || !arcClient) {
          throw new Error('Wallet not ready');
        }
        const principalWei = parseUnits(principal.toFixed(6), ARC_USDC_DECIMALS);
        const repayWei = parseUnits(repay.toFixed(6), ARC_USDC_DECIMALS);

        // Allowance precheck. Only approve if the existing allowance is
        // short, so a repeat-funder doesn't pay gas for a redundant
        // approve. Same pattern as StakeCard.tsx.
        const current = (await arcClient.readContract({
          address: ARC_USDC_ADDRESS,
          abi: usdcAbi,
          functionName: 'allowance',
          args: [address, KARWAN_PO_FINANCING_ADDRESS],
        })) as bigint;

        if (current < principalWei) {
          setStep('approving');
          const approveHash = await walletClient.writeContract({
            address: ARC_USDC_ADDRESS,
            abi: usdcAbi,
            functionName: 'approve',
            args: [KARWAN_PO_FINANCING_ADDRESS, principalWei],
            chain: walletClient.chain,
            account: address,
          });
          await arcClient.waitForTransactionReceipt({ hash: approveHash });
        }

        setStep('funding');
        const fundHash = await walletClient.writeContract({
          address: KARWAN_PO_FINANCING_ADDRESS,
          abi: poFinancingAbi,
          functionName: 'fund',
          args: [
            deal.jobId as `0x${string}`,
            principalWei,
            repayWei,
            BigInt(timeoutSeconds),
          ],
          chain: walletClient.chain,
          account: address,
        });
        await arcClient.waitForTransactionReceipt({ hash: fundHash });

        setStep('mirroring');
        const r = await api.fundPOLine({
          invoiceId: deal.jobId,
          principalUsdc: principal.toFixed(6),
          repayUsdc: repay.toFixed(6),
          releaseTimeoutSeconds: timeoutSeconds,
          fundTxHash: fundHash,
        });
        onFunded(r.line);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSubmitting(false);
      setStep('idle');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-3 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--lp-light)] border border-[var(--lp-border-light)] w-full max-w-[480px] overflow-hidden my-6"
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
            [:FUND PO:]
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
              PO VALUE
            </p>
            <p className="mt-1 serif text-[28px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
              <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Principal you fund">
              <input
                type="number"
                min={0}
                step={0.01}
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value))}
                disabled={submitting}
                className="form-input form-input-num"
              />
            </ModalField>
            <ModalField label="Repay on settlement">
              <input
                type="number"
                min={0}
                step={0.01}
                value={repay}
                onChange={(e) => setRepay(Number(e.target.value))}
                disabled={submitting}
                className="form-input form-input-num"
              />
            </ModalField>
          </div>

          <ModalField label="Release timeout">
            <div className="flex gap-2 flex-wrap">
              {RELEASE_TIMEOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.seconds}
                  type="button"
                  disabled={submitting}
                  onClick={() => setTimeoutSeconds(opt.seconds)}
                  className={cn(
                    'mono text-[10px] uppercase tracking-[0.14em] font-bold px-2.5 py-1 border transition-colors',
                    timeoutSeconds === opt.seconds
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
                  {opt.label}
                </button>
              ))}
            </div>
          </ModalField>

          <dl className="pt-3 border-t border-[var(--lp-border-light)] space-y-2.5">
            <ModalRow label="You fund now" value={`${principal.toFixed(2)} USDC`} />
            <ModalRow
              label="You receive on PoD repay"
              value={`${repay.toFixed(2)} USDC`}
              bold
            />
            <ModalRow label="Your spread" value={`+${spread.toFixed(2)} USDC`} accent />
            <ModalRow
              label="If PoD never lands"
              value={`Reclaim principal after ${Math.round(timeoutSeconds / 86_400)}d`}
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
            disabled={submitting || !validRepay || onWrongChain}
            className="w-full mono text-[12px] uppercase tracking-[0.14em] font-bold py-3 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-60"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            {step === 'approving'
              ? 'Approving USDC…'
              : step === 'funding'
                ? 'Funding line…'
                : step === 'mirroring'
                  ? 'Confirming…'
                  : submitting
                    ? 'Working…'
                    : onWrongChain
                      ? 'Switch to Arc'
                      : isAuthed
                        ? 'Fund line'
                        : 'Sign in to fund'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
