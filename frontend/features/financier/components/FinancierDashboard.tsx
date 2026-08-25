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
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { chainErrorMessage } from '@/shared/utils/chainError';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import type { Messages } from '@/shared/i18n/messages/en';
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
import { resolveFactoringAdvanceRecipient } from '@/features/factoring/advanceRecipient';
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
function friendlyError(e: unknown, chainCopy: Messages['chainErrors']): string {
  // An ApiError's detail is written for a person by our own backend, so it is
  // the one message worth passing through.
  if (e instanceof ApiError) {
    return typeof e.detail === 'string' && e.detail.trim() ? e.detail : e.message;
  }
  const msg = (e as Error)?.message ?? '';
  if (/user rejected|user denied|rejected the request|denied (the )?signature/i.test(msg)) {
    return 'You declined the signature, so the offer was not posted.';
  }
  // Everything else goes through the shared mapper. It used to return the first
  // line of the raw message, which put viem's own sentences on the card and,
  // for a confirmation that had not arrived yet, told the financier their
  // funding had failed when the transaction was on chain.
  return chainErrorMessage(e, chainCopy, 'Could not post the offer. Please try again.');
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

const vaultBalanceAbi = [
  {
    type: 'function',
    name: 'activeStakeOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
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

const TABS: ReadonlyArray<{ id: Tab; available: boolean }> = [
  { id: 'factor', available: true },
  { id: 'po', available: true },
];

/// `seconds` is the data; the label and the detail beside it are copy and are
/// resolved from the locale at render.
const REPAYMENT_EXTENSION_OPTIONS: ReadonlyArray<{
  labelKey: 'days7' | 'days30' | 'days45';
  detailKey: 'shortCushion' | 'standard' | 'extended';
  seconds: number;
}> = [
  { labelKey: 'days7', detailKey: 'shortCushion', seconds: 7 * 86_400 },
  { labelKey: 'days30', detailKey: 'standard', seconds: 30 * 86_400 },
  { labelKey: 'days45', detailKey: 'extended', seconds: 45 * 86_400 },
];

function formatDeadline(timestampMs: number): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(timestampMs));
}

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
  const t = useTranslations().financierDashboard;
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
        <SectionTag>{t.sectionTag}</SectionTag>
        <HeroHeadline size="md">
          {t.headline}<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
{t.intro}
        </p>
        {/* TAB BAR */}
        <div className="mt-7 flex gap-2 flex-wrap" data-guide="financier-tabs">
          {TABS.map((tab_) => (
            <button
              key={tab_.id}
              type="button"
              disabled={!tab_.available}
              onClick={() => tab_.available && setTab(tab_.id)}
              className={cn(
                'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                tab === tab_.id
                  ? 'bg-[var(--lp-dark)] text-[var(--lp-bg)] border-[var(--lp-dark)]'
                  : 'bg-transparent text-[var(--lp-dark)] border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)]',
                !tab_.available && 'opacity-40 cursor-not-allowed',
              )}
              style={{
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {t.tabs[tab_.id]}
              {!tab_.available ? <span className="ms-2 opacity-60">{t.soon}</span> : null}
            </button>
          ))}
        </div>
        {/* FILTERS: only when on factor tab */}
        {tab === 'factor' ? (
          <div className="mt-6 flex gap-3 flex-wrap items-center" data-guide="financier-filters">
            <FilterSelect
              label={t.filters.sector}
              value={sectorFilter}
              onChange={setSectorFilter}
              options={SECTOR_FILTERS}
            />
            <FilterText
              label={t.filters.region}
              value={regionFilter}
              onChange={setRegionFilter}
              placeholder={t.filters.regionPlaceholder}
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
                {t.filters.clear}
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
  const t = useTranslations().financierDashboard;
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
        tag={t.emptyFactoring.tag}
        body={t.emptyFactoring.body}
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
  const t = useTranslations().financierDashboard;
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
                title={t.sellerTierTitle}
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
            {t.sellerPassport} ↗
          </Link>
          <div className="flex items-center gap-2.5">
            {existingOffer ? (
              <span className="mono text-[9.5px] uppercase tracking-[0.14em] font-bold text-[var(--lp-text-muted)]">
                {t.yourOffer} · {(existingOffer.discountBps / 100).toFixed(1)}%
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
              {existingOffer ? t.editOffer : t.makeOffer}
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
  const t = useTranslations().financierDashboard;
  const chainCopy = useTranslations().chainErrors;
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
        const advanceRecipient = resolveFactoringAdvanceRecipient(deal);
        if (!advanceRecipient) {
          setError(t.offer.recipientUnavailable);
          return;
        }
        const typed = buildTransferAuthorization({
          from: auth.address as `0x${string}`,
          to: advanceRecipient,
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
      setError(friendlyError(e, chainCopy));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center px-3"
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
            aria-label={t.close}
          >
            ×
          </button>
        </div>
        <div className="p-5 md:p-6 space-y-5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {t.offer.faceValue}
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
              {t.offer.quickDiscount}
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
                      ? 'bg-[var(--lp-accent)] text-[var(--accent-ink)] border-[var(--lp-accent)]'
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
                {t.offer.customDiscount}
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
                  aria-label={t.offer.customDiscountAria}
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
                <ModalRow label={t.offer.invoiceFace} value={`${face.toFixed(2)} USDC`} />
                <ModalRow label={t.offer.stillClaimable} value={`${claimable.toFixed(2)} USDC`} bold />
              </>
            ) : (
              <ModalRow label={t.offer.invoiceFace} value={`${face.toFixed(2)} USDC`} />
            )}
            <ModalRow label={t.offer.youPayNow} value={`${advance.toFixed(2)} USDC`} />
            <ModalRow label={t.offer.youReceiveOnSettlement} value={`${repay.toFixed(2)} USDC`} bold />
            <ModalRow
              label={t.offer.yourSpread}
              value={`+${profit.toFixed(2)} USDC`}
              accent
            />
            {sellerFloor !== null ? (
              <ModalRow
                label={t.offer.sellerFloor}
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
                ? t.signInToPost
                : existingOffer
                  ? `${t.offer.replaceOffer} · 24h`
                  : `${t.offer.postOffer} · 24h`}
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
  const t = useTranslations().financierDashboard;
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
        tag={t.emptyPo.tag}
        body={t.emptyPo.body}
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
  const t = useTranslations().financierDashboard;
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
              {t.po.repayOnPod}
            </p>
            <p className="mt-1 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-dark)]">
              {t.po.buyerOrAttester}
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
            {t.sellerPassport} ↗
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
  const t = useTranslations().financierDashboard;
  const chainCopy = useTranslations().chainErrors;
  const auth = useAuth();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const refreshMoney = useMoneyRefresh();
  const face = Number(deal.dealAmountUsdc);
  const requested = deal.poFinancingRequestedAdvanceUsdc
    ? Number(deal.poFinancingRequestedAdvanceUsdc)
    : face;
  const nowUnix = Math.floor(Date.now() / 1000);
  const settlementDelaySeconds = deal.deadlineUnix ? Math.max(0, deal.deadlineUnix - nowUnix) : 0;
  const minimumRepaymentWindowSeconds = Math.max(7 * 86_400, settlementDelaySeconds + 7 * 86_400);
  const minimumRepaymentAtMs = (nowUnix + minimumRepaymentWindowSeconds) * 1000;
  // Default principal at 80% of face, repay at 84% (5% fee on principal).
  // Matches the demo scenario in sme-design.md §17 (5% PO financing fee).
  const [principal, setPrincipal] = useState<number>(Math.round(requested * 0.8 * 100) / 100);
  const [repay, setRepay] = useState<number>(Math.round(requested * 0.84 * 100) / 100);
  const [repaymentWindowSeconds, setRepaymentWindowSeconds] = useState<number>(minimumRepaymentWindowSeconds + 30 * 86_400);
  const [collateral, setCollateral] = useState<number | null>(null);
  const [stakeBalance, setStakeBalance] = useState<{ total: number; free: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'idle' | 'approving' | 'funding' | 'mirroring'>('idle');
  const [error, setError] = useState<string | null>(null);

  const isCircleUser = auth.method === 'circle';
  const address = auth.address as `0x${string}` | undefined;
  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;

  useEffect(() => {
    if (!arcClient || !deal.seller) return;
    let live = true;
    Promise.all([
      arcClient.readContract({
        address: KARWAN_VAULT_ADDRESS,
        abi: vaultBalanceAbi,
        functionName: 'activeStakeOf',
        args: [deal.seller as `0x${string}`],
      }),
      arcClient.readContract({
        address: KARWAN_VAULT_ADDRESS,
        abi: vaultBalanceAbi,
        functionName: 'freeStakeOf',
        args: [deal.seller as `0x${string}`],
      }),
    ])
      .then(([totalWei, freeWei]) => {
        if (live) {
          setStakeBalance({
            total: Number(formatUnits(totalWei as bigint, ARC_USDC_DECIMALS)),
            free: Number(formatUnits(freeWei as bigint, ARC_USDC_DECIMALS)),
          });
        }
      })
      .catch(() => {
        if (live) setStakeBalance(null);
      });
    return () => {
      live = false;
    };
  }, [arcClient, deal.seller]);

  useEffect(() => {
    let live = true;
    api
      .getPOStakePolicy({ invoiceId: deal.jobId, principalUsdc: principal.toFixed(6) })
      .then((policy) => {
        if (live) setCollateral(Number(policy.suggestedStakeUsdc));
      })
      .catch(() => {
        if (live) setCollateral(null);
      });
    return () => {
      live = false;
    };
  }, [deal.jobId, principal]);

  const spread = repay - principal;
  const validRepay = principal > 0 && principal <= requested && repay > principal && repay <= face;

  async function submit() {
    if (!isAuthed || !address) {
      setError('Sign in to fund a PO line.');
      return;
    }
    if (!validRepay) {
      setError('Repay must be greater than principal and at most the PO value.');
      return;
    }
    if (collateral === null || collateral <= 0) {
      setError('Seller protection is still being checked. Please try again in a moment.');
      return;
    }
    if (stakeBalance && collateral > stakeBalance.free) {
      setError('The seller does not have enough available stake for this offer.');
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
        const collateralWei = parseUnits(collateral.toFixed(6), ARC_USDC_DECIMALS);

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
          await requireConfirmedTx(arcClient, approveHash, chainCopy.reverted);
        }

        // Do not ask the wallet to broadcast a transaction the live contracts
        // already say will revert. This catches stale PO state, missing escrow
        // wiring, allowance/collateral capability drift, and self-funding with a
        // readable error before the user pays gas.
        await arcClient.simulateContract({
          address: KARWAN_PO_FINANCING_ADDRESS,
          abi: poFinancingAbi,
          functionName: 'fund',
          args: [
            deal.jobId as `0x${string}`,
            principalWei,
            repayWei,
            BigInt(repaymentWindowSeconds),
            collateralWei,
          ],
          account: address,
        });

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
            collateralWei,
          ],
          chain: walletClient.chain,
          account: address,
        });
        await requireConfirmedTx(arcClient, fundHash, chainCopy.reverted);
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
      setError(friendlyError(e, chainCopy));
    } finally {
      setSubmitting(false);
      setStep('idle');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center px-3 overflow-y-auto"
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
            <ModalField label={t.po.principal}>
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
            <ModalField label={t.po.repayOnSettlement}>
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

          <ModalField label={t.po.sellerProtection}>
            <div className="border border-[var(--lp-border-light)] bg-white/55 px-3 py-3 text-[13px] text-[var(--lp-text-sub)]">
              {stakeBalance === null || collateral === null
                ? 'Checking the seller’s available stake…'
                : stakeBalance.total > 0
                  ? stakeBalance.free > 0
                    ? collateral <= stakeBalance.free
                      ? `${collateral.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC will be set aside from the seller’s ${stakeBalance.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC stake. If repayment falls short, up to that amount can cover the unpaid balance.`
                      : `This offer needs ${collateral.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC of seller protection, but only ${stakeBalance.free.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC is available.`
                    : `The seller has ${stakeBalance.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC staked, but it is already committed elsewhere.`
                  : 'The seller has no available stake to help cover a repayment shortfall.'}
            </div>
          </ModalField>

          <ModalField label={t.po.repaymentDeadline}>
            <div className="border border-[var(--lp-border-light)] bg-white/55 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {t.po.expectedDelivery}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--lp-dark)]">
                    {deal.deadlineUnix ? formatDeadline(deal.deadlineUnix * 1000) : t.po.notDated}
                  </p>
                </div>
                <div>
                  <p className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {t.po.earliestRepayment}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--lp-dark)]">
                    {formatDeadline(minimumRepaymentAtMs)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--lp-text-sub)]">
                {t.po.earliestNote}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {REPAYMENT_EXTENSION_OPTIONS.map((opt) => (
                <button
                  key={opt.seconds}
                  type="button"
                  disabled={submitting}
                  onClick={() => setRepaymentWindowSeconds(minimumRepaymentWindowSeconds + opt.seconds)}
                  className={cn(
                    'min-w-0 px-2 py-2.5 text-start border transition-colors',
                    repaymentWindowSeconds === minimumRepaymentWindowSeconds + opt.seconds
                      ? 'bg-[var(--lp-dark)] text-white border-[var(--lp-dark)]'
                      : 'bg-transparent text-[var(--lp-dark)] border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)]',
                  )}
                  style={{
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 6,
                    borderBottomRightRadius: 2,
                  }}
                >
                  <span className="block mono text-[9px] uppercase tracking-[0.1em] font-bold">
                    {t.extensions[opt.labelKey]}
                  </span>
                  <span className={cn(
                    'mt-1 block text-[10px]',
                    repaymentWindowSeconds === minimumRepaymentWindowSeconds + opt.seconds
                      ? 'text-white/60'
                      : 'text-[var(--lp-text-muted)]',
                  )}>
                    {formatDeadline(minimumRepaymentAtMs + opt.seconds * 1000)}
                  </span>
                </button>
              ))}
            </div>
          </ModalField>

          <dl className="pt-3 border-t border-[var(--lp-border-light)] space-y-2.5">
            <ModalRow label={t.po.sellerReceivesNow} value={`${principal.toFixed(2)} USDC`} />
            <ModalRow
              label={t.po.youReceiveOnSettlement}
              value={`${repay.toFixed(2)} USDC`}
              bold
            />
            <ModalRow label={t.po.yourSpread} value={`+${spread.toFixed(2)} USDC`} accent />
            <ModalRow
              label={t.po.ifSettlementFallsShort}
              value={`You can report the unpaid balance after ${formatDeadline((nowUnix + repaymentWindowSeconds) * 1000)}. Recovery is not automatic.`}
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
                    ? t.working
                    : onWrongChain
                      ? t.switchToArc
                      : isAuthed
                        ? t.po.fundLine
                        : t.signInToFund}
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
