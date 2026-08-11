'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useWalletClient, usePublicClient, useChainId } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type DirectDeal, type FactoringOffer, type POFinancingLine } from '@/core/api';
import { Band, SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';
import { PageTour } from '@/shared/guide/PageTour';
import { FINANCIER_DESK_TOUR_ID, FINANCIER_DESK_STEPS } from '@/shared/guide/tours';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  KARWAN_PO_FINANCING_ADDRESS,
  KARWAN_VAULT_ADDRESS,
} from '@/features/profile/config';
import {
  buildTransferAuthorization,
  serializeAuthorization,
} from '@/features/factoring/usdcAuthorization';
import { POLinesPanel } from './POLinesPanel';
import { FactoringPositionsPanel } from './FactoringPositionsPanel';

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
      { name: 'requiredStakeUsdc', type: 'uint128' },
    ],
    outputs: [],
  },
] as const;

/// Free stake is what the vault will actually let PO financing reserve. Both
/// freeStakeOf and reserve resolve an agent wallet to its owner, so reading
/// against the escrow's seller returns the same number the contract checks.
const vaultAbi = [
  {
    type: 'function',
    name: 'freeStakeOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
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
const REPAYMENT_WINDOW_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
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
  // This financier's own live offers, keyed by invoice. A second offer on an
  // invoice you already quoted is a re-price, not a new bid, so the card has
  // to say Edit rather than let you stack quotes on the same seller.
  const [myOffers, setMyOffers] = useState<Map<string, FactoringOffer>>(new Map());
  // PO-tab state. Split from the factor tab so a tab switch never
  // re-renders the inactive surface, per Vercel
  // `rerender-split-combined-hooks`.
  const [poAvailable, setPoAvailable] = useState<DirectDeal[] | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  const [fundTarget, setFundTarget] = useState<DirectDeal | null>(null);

  const reloadMyOffers = useCallback(() => {
    if (!auth.isAuthenticated) return;
    api
      .listMyFactoringOffers()
      .then(({ asFinancier }) => {
        const live = new Map<string, FactoringOffer>();
        for (const o of asFinancier) {
          if (o.status === 'offered') live.set(o.invoiceId.toLowerCase(), o);
        }
        setMyOffers(live);
      })
      .catch(() => {
        // A failed read just means the card shows Make offer; the backend
        // supersedes the old quote either way.
      });
  }, [auth.isAuthenticated]);

  useEffect(() => {
    reloadMyOffers();
  }, [reloadMyOffers]);

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
        <SectionTag>FINANCIER</SectionTag>
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
                  : 'bg-transparent text-[var(--lp-dark)] border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)]',
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
          <>
          <FactorInvoicesTab
            available={available}
            loading={loading}
            error={error}
            myOffers={myOffers}
            onOpenOffer={(deal) => setOfferTarget(deal)}
          />
          <FactoringPositionsPanel />
          </>
        ) : (
          <>
            <FundPOsTab
              available={poAvailable}
              loading={poLoading}
              error={poError}
              onOpenFund={(deal) => setFundTarget(deal)}
            />
            <POLinesPanel />
          </>
        )}
      </Band>

      {offerTarget ? (
        <OfferModal
          deal={offerTarget}
          existingOffer={myOffers.get(offerTarget.jobId.toLowerCase()) ?? null}
          isAuthed={auth.isAuthenticated}
          onClose={() => setOfferTarget(null)}
          onPosted={() => {
            setOfferTarget(null);
            reloadMyOffers();
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
  myOffers,
  onOpenOffer,
}: {
  available: DirectDeal[] | null;
  loading: boolean;
  error: string | null;
  myOffers: Map<string, FactoringOffer>;
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
        <InvoiceCard
          key={deal.jobId}
          deal={deal}
          existingOffer={myOffers.get(deal.jobId.toLowerCase()) ?? null}
          onOpenOffer={() => onOpenOffer(deal)}
        />
      ))}
    </div>
  );
}

function InvoiceCard({
  deal,
  existingOffer,
  onOpenOffer,
}: {
  deal: DirectDeal;
  existingOffer: FactoringOffer | null;
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
            <span className="mono text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 border border-[var(--lp-outline)] text-[var(--lp-dark)]">
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
          <div className="flex items-center gap-2.5">
            {existingOffer ? (
              <span className="mono text-[9.5px] uppercase tracking-[0.14em] font-bold text-[var(--lp-text-muted)]">
                Your offer · {(existingOffer.discountBps / 100).toFixed(1)}%
              </span>
            ) : null}
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
              {existingOffer ? 'Edit offer' : 'Make offer'}
            </button>
          </div>
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
  existingOffer,
  isAuthed,
  onClose,
  onPosted,
}: {
  deal: DirectDeal;
  isAuthed: boolean;
  existingOffer: FactoringOffer | null;
  onClose: () => void;
  onPosted: (offer: FactoringOffer) => void;
}) {
  const auth = useAuth();
  const { data: walletClient } = useWalletClient();
  const face = Number(deal.dealAmountUsdc);
  // Price against what the escrow can still PAY, not the invoice face.
  //
  // Face includes the platform fee and every milestone already released to the
  // seller. The assignment can only pay out of what is left, so quoting off face
  // on a part-released invoice offers more than the escrow can ever return. The
  // backend refuses those, and would have let a financier lose the difference.
  const escrowClaimable = deal.claimableUsdc ? Number(deal.claimableUsdc) : face;
  const requested = deal.factoringRequestedAdvanceUsdc
    ? Number(deal.factoringRequestedAdvanceUsdc)
    : escrowClaimable;
  const claimable = Math.min(escrowClaimable, requested);
  const partlyReleased = escrowClaimable < face - 0.000001;
  // Re-pricing an existing quote opens on the rate you already offered, not
  // on the 2% default, so an edit starts from where you left it.
  const [discountBps, setDiscountBps] = useState<number>(existingOffer?.discountBps ?? 200);
  // Mirrors discountBps as a free-text percent so the field can hold a
  // half-typed value without the slider fighting the keyboard.
  const [discountInput, setDiscountInput] = useState(
    ((existingOffer?.discountBps ?? 200) / 100).toFixed(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = claimable * (1 - discountBps / 10_000);
  const repay = claimable;
  const profit = repay - advance;
  const isCircleUser = auth.method === 'circle';

  /// The seller named a floor when they asked for early payout. The backend
  /// refuses anything under it, so say so here rather than letting the offer
  /// round-trip into a 409.
  const sellerFloor = deal.factoringMinAdvanceUsdc
    ? Number(deal.factoringMinAdvanceUsdc)
    : null;
  const belowSellerFloor = sellerFloor !== null && advance < sellerFloor;

  async function submit() {
    if (!isAuthed) {
      setError('Sign in to post an offer.');
      return;
    }
    if (belowSellerFloor) {
      setError(`This seller will not consider less than ${sellerFloor!.toFixed(2)} USDC.`);
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
                  onClick={() => {
                    setDiscountBps(bps);
                    setDiscountInput((bps / 100).toFixed(1));
                  }}
                  className={cn(
                    'mono text-[10px] uppercase tracking-[0.14em] font-bold px-2.5 py-1 border transition-colors',
                    discountBps === bps
                      ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)] border-[var(--lp-accent)]'
                      : 'bg-transparent text-[var(--lp-dark)] border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)]',
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
              {/* Typable as well as draggable. The slider steps 0.5% and can
                  never express a rate a financier actually quoted, like 2.4%.
                  Clamped on blur, not on change, so intermediate keystrokes
                  ("" or ".") don't snap the value out from under the cursor. */}
              <span className="inline-flex items-baseline gap-0.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={20}
                  step={0.1}
                  value={discountInput}
                  onChange={(e) => {
                    setDiscountInput(e.target.value);
                    const pct = Number(e.target.value);
                    if (Number.isFinite(pct) && pct >= 1 && pct <= 20) {
                      setDiscountBps(Math.round(pct * 100));
                    }
                  }}
                  onBlur={() => {
                    const pct = Number(discountInput);
                    const clamped = Number.isFinite(pct) ? Math.min(20, Math.max(1, pct)) : 1;
                    setDiscountBps(Math.round(clamped * 100));
                    setDiscountInput(clamped.toFixed(1));
                  }}
                  aria-label="Custom discount percent"
                  className="w-[3.6rem] bg-transparent text-end mono text-[14px] tabular-nums font-extrabold text-[var(--lp-dark)] border-b border-[var(--lp-outline)] focus:border-[var(--lp-accent)] focus:outline-none"
                />
                <span className="mono text-[14px] font-extrabold text-[var(--lp-dark)]">%</span>
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={discountBps}
              onChange={(e) => {
                setDiscountBps(Number(e.target.value));
                setDiscountInput((Number(e.target.value) / 100).toFixed(1));
              }}
              className="w-full"
            />
            <div className="mt-1 flex justify-between mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              <span>1%</span>
              <span>20%</span>
            </div>
          </div>

          <dl className="pt-3 border-t border-[var(--lp-border-light)] space-y-2.5">
            {partlyReleased ? (
              <>
                <ModalRow label="Invoice face" value={`${face.toFixed(2)} USDC`} />
                <ModalRow label="Still claimable" value={`${claimable.toFixed(2)} USDC`} bold />
              </>
            ) : (
              <ModalRow label="Invoice face" value={`${face.toFixed(2)} USDC`} />
            )}
            <ModalRow label="You pay seller now" value={`${advance.toFixed(2)} USDC`} />
            <ModalRow label="You receive on settlement" value={`${repay.toFixed(2)} USDC`} bold />
            <ModalRow
              label="Your spread"
              value={`+${profit.toFixed(2)} USDC`}
              accent
            />
            {sellerFloor !== null ? (
              <ModalRow
                label="Seller will not go below"
                value={`${sellerFloor.toFixed(2)} USDC`}
              />
            ) : null}
          </dl>

          {partlyReleased ? (
            <p className="mt-2 text-[11px] text-[var(--lp-text-muted)]">
              This invoice has already released {(face - claimable).toFixed(2)} USDC to the seller.
              You are buying what is left, so the numbers above are priced against{' '}
              {claimable.toFixed(2)} USDC, not the {face.toFixed(2)} face.
            </p>
          ) : null}

          {belowSellerFloor ? (
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
              Below the seller minimum. Lower the discount to offer at least{' '}
              {sellerFloor!.toFixed(2)} USDC.
            </p>
          ) : null}

          {error ? (
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || belowSellerFloor}
            className="w-full mono text-[12px] uppercase tracking-[0.14em] font-bold py-3 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-60"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            {submitting
              ? 'Posting…'
              : !isAuthed
                ? 'Sign in to post'
                : existingOffer
                  ? 'Replace offer · 24h'
                  : 'Post offer · 24h'}
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
              [:CAPITAL REQUESTED:]
            </p>
            <p className="mt-1 serif text-[32px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(deal.poFinancingRequestedAdvanceUsdc ?? deal.dealAmountUsdc, { withSuffix: false })}{' '}
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
  const refreshMoney = useMoneyRefresh();
  const face = Number(deal.dealAmountUsdc);
  const requested = deal.poFinancingRequestedAdvanceUsdc
    ? Number(deal.poFinancingRequestedAdvanceUsdc)
    : face;
  // Default principal at 80% of face, repay at 84% (5% fee on principal).
  // Matches the demo scenario in sme-design.md §17 (5% PO financing fee).
  const [principal, setPrincipal] = useState<number>(Math.round(requested * 0.8 * 100) / 100);
  const [repay, setRepay] = useState<number>(Math.round(requested * 0.84 * 100) / 100);
  const [repaymentWindowSeconds, setRepaymentWindowSeconds] = useState<number>(30 * 86_400);
  /// Seller stake reserved against this line and slashed to the financier if
  /// repayment never lands. Without it the only recovery is off-chain.
  const [collateral, setCollateral] = useState<number>(0);
  const [freeStake, setFreeStake] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<{
    tier: string;
    suggestedBps: number;
    suggestedStakeUsdc: string;
    raisedBySize: boolean;
    raisedByContractFloor: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'idle' | 'approving' | 'funding' | 'mirroring'>('idle');
  const [error, setError] = useState<string | null>(null);

  const isCircleUser = auth.method === 'circle';
  const address = auth.address as `0x${string}` | undefined;
  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;

  /// Prefill the collateral from the desk's tier policy rather than making the
  /// financier guess. The suggestion comes from the seller's reputation tier and
  /// the size of the advance; the financier can raise it but not drop below it,
  /// so the ladder means something while risk appetite stays theirs.
  ///
  /// Capped at the seller's free stake, because the vault reverts
  /// InsufficientStake rather than reserving what it can. A seller who cannot
  /// cover the suggestion leaves the line under-secured, which is the honest
  /// state to show rather than a form that is guaranteed to revert.
  useEffect(() => {
    if (!arcClient || !deal.seller) return;
    let live = true;

    const readFree = arcClient
      .readContract({
        address: KARWAN_VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'freeStakeOf',
        args: [deal.seller as `0x${string}`],
      })
      .then((wei) => Number(formatUnits(wei as bigint, ARC_USDC_DECIMALS)))
      .catch(() => 0);

    const readPolicy = api
      .getPOStakePolicy({ invoiceId: deal.jobId, principalUsdc: principal.toFixed(6) })
      .then((p) => p)
      .catch(() => null);

    Promise.all([readFree, readPolicy]).then(([free, policy]) => {
      if (!live) return;
      setFreeStake(free);
      setSuggestion(policy);
      // No policy read means no informed suggestion, so fall back to the old
      // behaviour of securing as much as the seller can carry.
      const target = policy ? Number(policy.suggestedStakeUsdc) : principal;
      setCollateral(Math.floor(Math.min(target, free) * 100) / 100);
    });

    return () => {
      live = false;
    };
    // Principal seeds the initial suggestion only; re-running on every keystroke
    // would fight the financier editing the collateral field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcClient, deal.seller, deal.jobId]);
  const spread = repay - principal;
  const validRepay = repay > principal && repay <= requested;

  /// The desk's suggestion, capped at what the seller can actually reserve. A
  /// seller short of the suggested amount should not produce a form that cannot
  /// be submitted, so the floor drops to their free stake and the copy says why.
  const suggestedRaw = suggestion ? Number(suggestion.suggestedStakeUsdc) : 0;
  const suggestedFloor =
    freeStake === null ? 0 : Math.floor(Math.min(suggestedRaw, freeStake) * 100) / 100;
  const shortOfSuggestion = freeStake !== null && suggestedRaw > freeStake;
  const belowSuggestion = collateral < suggestedFloor;

  /// Two ways to be invalid. Above the seller's free stake the vault reverts
  /// InsufficientStake rather than reserving what it can, so block the submit
  /// instead of letting the financier pay gas to find out. Below the suggested
  /// floor is a policy choice: the tier ladder is the desk's, the appetite above
  /// it is the financier's.
  const validCollateral =
    collateral >= 0 && (freeStake === null || collateral <= freeStake) && !belowSuggestion;

  async function submit() {
    if (!isAuthed || !address) {
      setError('Sign in to fund a PO line.');
      return;
    }
    if (!validRepay) {
      setError('Repay must be greater than principal and at most the PO value.');
      return;
    }
    if (!validCollateral) {
      setError(
        belowSuggestion
          ? `Collateral is below the ${suggestion?.tier.toUpperCase() ?? 'suggested'} rate of ${suggestedFloor.toFixed(2)} USDC.`
          : 'Collateral is above the seller free stake. Funding would revert.',
      );
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
          repaymentWindowSeconds,
          requiredStakeUsdc: collateral.toFixed(6),
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
            BigInt(repaymentWindowSeconds),
            parseUnits(collateral.toFixed(6), ARC_USDC_DECIMALS),
          ],
          chain: walletClient.chain,
          account: address,
        });
        await arcClient.waitForTransactionReceipt({ hash: fundHash });
        // Principal has left the financier's wallet in this transaction, so
        // the balance on screen is already stale. Do not make them wait for
        // the backend to tell us what the receipt just did.
        refreshMoney();

        setStep('mirroring');
        const r = await api.fundPOLine({
          invoiceId: deal.jobId,
          principalUsdc: principal.toFixed(6),
          repayUsdc: repay.toFixed(6),
          repaymentWindowSeconds,
          requiredStakeUsdc: collateral.toFixed(6),
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

          <ModalField label="Seller collateral">
            <input
              type="number"
              min={suggestedFloor}
              max={freeStake ?? undefined}
              step={0.01}
              value={collateral}
              onChange={(e) => setCollateral(Number(e.target.value))}
              disabled={submitting || freeStake === 0}
              className="form-input form-input-num"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              {freeStake === null
                ? 'Checking the seller stake.'
                : freeStake === 0
                  ? 'This seller has no free stake. The line will be unsecured.'
                  : collateral > freeStake
                    ? `Only ${freeStake.toLocaleString()} USDC is free. Funding will revert above that.`
                    : belowSuggestion
                      ? `Below the ${suggestion?.tier.toUpperCase()} rate of ${suggestion?.suggestedStakeUsdc} USDC. Raise it or leave it at the suggestion.`
                      : collateral > 0
                        ? `Slashed to you, up to the shortfall, if the settlement falls short. ${freeStake.toLocaleString()} USDC free.`
                        : `Unsecured. ${freeStake.toLocaleString()} USDC of seller stake is available.`}
            </p>
            {suggestion && freeStake !== null && freeStake > 0 ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                {suggestion.raisedByContractFloor
                  ? `${suggestion.tier.toUpperCase()} seller, but the contract floor is higher and sets this figure. You can ask for more.`
                  : suggestion.suggestedBps === 0
                    ? `${suggestion.tier.toUpperCase()} seller: no collateral required at this size.`
                    : `${suggestion.tier.toUpperCase()} seller: ${(suggestion.suggestedBps / 100).toFixed(0)}% of principal suggested${suggestion.raisedBySize ? ', raised because the advance is large' : ''}. You can ask for more.`}
                {shortOfSuggestion
                  ? ` This seller can only cover ${freeStake.toLocaleString()} USDC of it.`
                  : ''}
              </p>
            ) : null}
          </ModalField>

          <ModalField label="Repayment window">
            <div className="flex gap-2 flex-wrap">
              {REPAYMENT_WINDOW_OPTIONS.map((opt) => (
                <button
                  key={opt.seconds}
                  type="button"
                  disabled={submitting}
                  onClick={() => setRepaymentWindowSeconds(opt.seconds)}
                  className={cn(
                    'mono text-[10px] uppercase tracking-[0.14em] font-bold px-2.5 py-1 border transition-colors',
                    repaymentWindowSeconds === opt.seconds
                      ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)] border-[var(--lp-accent)]'
                      : 'bg-transparent text-[var(--lp-dark)] border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)]',
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
            <ModalRow label="Seller receives now" value={`${principal.toFixed(2)} USDC`} />
            <ModalRow
              label="You receive on settlement"
              value={`${repay.toFixed(2)} USDC`}
              bold
            />
            <ModalRow label="Your spread" value={`+${spread.toFixed(2)} USDC`} accent />
            <ModalRow
              label="If settlement falls short"
              value={
                collateral > 0
                  ? `Slash the gap from collateral after ${Math.round(repaymentWindowSeconds / 86_400)}d`
                  : `Unsecured. Dispute only, after ${Math.round(repaymentWindowSeconds / 86_400)}d`
              }
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
            disabled={submitting || !validRepay || !validCollateral || onWrongChain}
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
