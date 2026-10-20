'use client';
import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useWalletClient, usePublicClient, useChainId } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type DirectDeal, type FactoringOffer, type POFinancingLine } from '@/core/api';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { Band } from '@/shared/components/Bands';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { PageTour } from '@/shared/guide/PageTour';
import { FINANCIER_DESK_TOUR_ID, FINANCIER_DESK_STEPS } from '@/shared/guide/tours';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { chainErrorMessage } from '@/shared/utils/chainError';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import type { Messages } from '@/shared/i18n/messages/en';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import { ALERT, FIELD, LINK, PRIMARY, SECONDARY } from '@/shared/ui/controls';
import {
  ARC_CHAIN_ID,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  KARWAN_PO_FINANCING_ADDRESS,
  KARWAN_VAULT_ADDRESS,
  PO_FINANCING_ENABLED,
} from '@/features/profile/config';
import {
  buildTransferAuthorization,
  serializeAuthorization,
} from '@/features/factoring/usdcAuthorization';
import { resolveFactoringAdvanceRecipient } from '@/features/factoring/advanceRecipient';
import { buildFactoringQuote } from '@/features/factoring/factoringQuote';
import { showFilters, termKey } from '../deskModel';
import { POLinesPanel } from './POLinesPanel';
import { FactoringPositionsPanel } from './FactoringPositionsPanel';

type Copy = Messages['financierDashboard'];

/// Turn a thrown signing or submit error into one short human line. A wallet
/// rejection is the common case and reads calmly; our own backend writes its
/// detail for a person, so that one passes through; everything else goes
/// through the shared chain mapper, which never shows viem's own sentences.
function friendlyError(e: unknown, chainCopy: Messages['chainErrors'], declined: string, fallback: string): string {
  if (e instanceof ApiError) {
    return typeof e.detail === 'string' && e.detail.trim() ? e.detail : e.message;
  }
  const msg = (e as Error)?.message ?? '';
  if (/user rejected|user denied|rejected the request|denied (the )?signature/i.test(msg)) return declined;
  return chainErrorMessage(e, chainCopy, fallback);
}

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

const REPAYMENT_EXTENSION_OPTIONS: ReadonlyArray<{ labelKey: 'days7' | 'days30' | 'days45'; seconds: number }> = [
  { labelKey: 'days7', seconds: 7 * 86_400 },
  { labelKey: 'days30', seconds: 30 * 86_400 },
  { labelKey: 'days45', seconds: 45 * 86_400 },
];

const SECTORS = ['agriculture', 'textiles', 'electronics', 'logistics', 'manufacturing', 'services', 'other'] as const;

/// Suggested discounts by seller tier, per sme-design.md section 8.2. The
/// financier can type any rate; these are starting points.
const TIER_DISCOUNT_HINT: ReadonlyArray<{ tier: 'elite' | 'strong' | 'established'; bps: number }> = [
  { tier: 'elite', bps: 100 },
  { tier: 'strong', bps: 200 },
  { tier: 'established', bps: 400 },
];

const SECTION_TITLE = 'text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] text-[var(--lp-dark)]';
const LABEL = 'text-[14px] font-medium text-[var(--lp-text-sub)]';
const TOGGLE =
  'inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

function useDate() {
  const { locale } = useLocale();
  return useCallback(
    (ms: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms)),
    [locale],
  );
}

function usdc(value: string | number): string {
  return `${formatUsdc(value, { withSuffix: false })} USDC`;
}

export function FinancierDashboard() {
  const t = useTranslations().financierDashboard;
  const auth = useAuth();
  const [sectorFilter, setSectorFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [available, setAvailable] = useState<DirectDeal[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [offerTarget, setOfferTarget] = useState<DirectDeal | null>(null);
  // This financier's own live offers, keyed by invoice. A second offer on an
  // invoice you already quoted is a re-price, so the row says Edit rather than
  // letting you stack quotes on the same seller.
  const [myOffers, setMyOffers] = useState<Map<string, FactoringOffer>>(new Map());
  const [poAvailable, setPoAvailable] = useState<DirectDeal[] | null>(null);
  const [poLoadFailed, setPoLoadFailed] = useState(false);
  const [fundTarget, setFundTarget] = useState<DirectDeal | null>(null);

  const reloadMyOffers = useCallback(() => {
    if (!auth.isAuthenticated) return;
    api
      .listMyFactoringOffers()
      .then(({ asFinancier }) => {
        const live = new Map<string, FactoringOffer>();
        for (const o of asFinancier) {
          if (o.status === 'offered' || o.status === 'pending_receipt') live.set(o.invoiceId.toLowerCase(), o);
        }
        setMyOffers(live);
      })
      .catch(() => {
        // A failed read only means the row shows Make an offer; the backend
        // supersedes the old quote either way.
      });
  }, [auth.isAuthenticated]);

  useEffect(() => {
    reloadMyOffers();
  }, [reloadMyOffers]);

  const loadInvoices = useCallback(() => {
    let cancelled = false;
    setLoadFailed(false);
    api
      .listFactoringAvailable({ sector: sectorFilter || undefined, region: regionFilter || undefined })
      .then((r) => {
        if (!cancelled) setAvailable(r.deals);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sectorFilter, regionFilter]);

  useEffect(() => loadInvoices(), [loadInvoices]);

  const loadOrders = useCallback(() => {
    if (!PO_FINANCING_ENABLED) return () => {};
    let cancelled = false;
    setPoLoadFailed(false);
    api
      .listPOFinancingAvailable({})
      .then((r) => {
        if (!cancelled) setPoAvailable(r.deals);
      })
      .catch(() => {
        if (!cancelled) setPoLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadOrders(), [loadOrders]);

  const filterActive = !!(sectorFilter || regionFilter);

  return (
    <div className="product-surface min-h-[70vh]">
      <PageTour id={FINANCIER_DESK_TOUR_ID} steps={FINANCIER_DESK_STEPS} />
      <Band tone="light" compact>
        <div className="mx-auto max-w-[940px]">
          <header className="border-b border-[var(--lp-border-light)] pb-6">
            <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">
              {t.title}
            </h1>
            <p className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-[var(--lp-text-sub)]">{t.intro}</p>
            {ARC_NETWORK === 'testnet' && <p className="mt-3 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.testnet}</p>}
          </header>

          <FactoringPositionsPanel />
          {PO_FINANCING_ENABLED && <POLinesPanel />}

          <section aria-labelledby="open-invoices" className="pt-8">
            <h2 id="open-invoices" className={SECTION_TITLE}>
              {t.open.title}
            </h2>
            {showFilters(available?.length ?? 0, filterActive) && (
              <Filters
                t={t}
                sector={sectorFilter}
                region={regionFilter}
                onSector={setSectorFilter}
                onRegion={setRegionFilter}
                onClear={() => {
                  setSectorFilter('');
                  setRegionFilter('');
                }}
              />
            )}
            <InvoiceList
              t={t}
              available={available}
              failed={loadFailed}
              myOffers={myOffers}
              onOpenOffer={setOfferTarget}
            />
          </section>

          {PO_FINANCING_ENABLED && (
            <section aria-labelledby="open-orders" className="pt-10">
              <h2 id="open-orders" className={SECTION_TITLE}>
                {t.po.title}
              </h2>
              <OrderList t={t} available={poAvailable} failed={poLoadFailed} onOpenFund={setFundTarget} />
            </section>
          )}
        </div>
      </Band>

      {offerTarget ? (
        <OfferSheet
          deal={offerTarget}
          existingOffer={myOffers.get(offerTarget.jobId.toLowerCase()) ?? null}
          isAuthed={auth.isAuthenticated}
          onClose={() => setOfferTarget(null)}
          onPosted={() => {
            setOfferTarget(null);
            reloadMyOffers();
            loadInvoices();
          }}
        />
      ) : null}
      {fundTarget ? (
        <FundSheet
          deal={fundTarget}
          isAuthed={auth.isAuthenticated}
          onClose={() => setFundTarget(null)}
          onFunded={() => {
            setFundTarget(null);
            loadOrders();
          }}
        />
      ) : null}
    </div>
  );
}

function Filters({
  t,
  sector,
  region,
  onSector,
  onRegion,
  onClear,
}: {
  t: Copy;
  sector: string;
  region: string;
  onSector: (v: string) => void;
  onRegion: (v: string) => void;
  onClear: () => void;
}) {
  const regionId = useId();
  return (
    <div role="group" aria-label={t.filters.label} className="mt-4 space-y-3" data-guide="financier-filters">
      <div role="radiogroup" aria-label={t.filters.sector} className="flex flex-wrap gap-2">
        {['', ...SECTORS].map((key) => {
          const on = sector === key;
          return (
            <button
              key={key || 'any'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSector(key)}
              className={cn(
                TOGGLE,
                on
                  ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-bg)]'
                  : 'border-[var(--lp-outline-strong)] text-[var(--lp-dark)]',
              )}
            >
              {key ? t.filters.sectors[key as (typeof SECTORS)[number]] : t.filters.any}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={regionId} className={LABEL}>
          {t.filters.region}
        </label>
        <input
          id={regionId}
          type="text"
          value={region}
          onChange={(e) => onRegion(e.target.value)}
          placeholder={t.filters.regionPlaceholder}
          className={cn(FIELD, 'max-w-[240px]')}
        />
        {sector || region ? (
          <button type="button" onClick={onClear} className={LINK}>
            {t.filters.clear}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy>
      <div className="h-[88px] rounded-md bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
      <div className="h-[88px] rounded-md bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 border-y border-[var(--lp-border-light)] py-8">
      <p className="text-[16px] font-semibold text-[var(--lp-dark)]">{title}</p>
      <p className="mt-1 max-w-[56ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{body}</p>
    </div>
  );
}

function sellerName(deal: DirectDeal, t: Copy): string {
  return deal.counterpartyCompany?.name?.trim() || t.open.anySeller;
}

function sellerMeta(deal: DirectDeal, t: Copy): string {
  const c = deal.counterpartyCompany;
  const sector = c?.sector && (SECTORS as readonly string[]).includes(c.sector)
    ? t.filters.sectors[c.sector as (typeof SECTORS)[number]]
    : c?.sector;
  return [deal.sellerTier ? t.open.tier[deal.sellerTier] : null, sector, c?.region].filter(Boolean).join(' · ');
}

function InvoiceList({
  t,
  available,
  failed,
  myOffers,
  onOpenOffer,
}: {
  t: Copy;
  available: DirectDeal[] | null;
  failed: boolean;
  myOffers: Map<string, FactoringOffer>;
  onOpenOffer: (deal: DirectDeal) => void;
}) {
  if (failed) return <p role="alert" className={cn(ALERT, 'mt-4')}>{t.open.loadError}</p>;
  if (available === null) return <ListSkeleton />;
  if (available.length === 0) return <EmptyState title={t.open.emptyTitle} body={t.open.emptyBody} />;
  return (
    <ul className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
      {available.map((deal) => (
        <InvoiceRow
          key={deal.jobId}
          t={t}
          deal={deal}
          existingOffer={myOffers.get(deal.jobId.toLowerCase()) ?? null}
          onOpenOffer={() => onOpenOffer(deal)}
        />
      ))}
    </ul>
  );
}

function InvoiceRow({
  t,
  deal,
  existingOffer,
  onOpenOffer,
}: {
  t: Copy;
  deal: DirectDeal;
  existingOffer: FactoringOffer | null;
  onOpenOffer: () => void;
}) {
  const receiptPending = existingOffer?.status === 'pending_receipt';
  const meta = sellerMeta(deal, t);
  return (
    <li className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-guide="financier-deal">
      <div className="min-w-0">
        <p dir="auto" className="truncate text-[16px] font-semibold text-[var(--lp-dark)]">{sellerName(deal, t)}</p>
        {meta && <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">{meta}</p>}
        <p className="mt-3 text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
          {usdc(deal.dealAmountUsdc)}
        </p>
        <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">
          {[
            t.open.terms[termKey(deal.paymentTerms)],
            deal.factoringRequestedAdvanceUsdc
              ? t.open.asksEarly.replace('{amount}', formatUsdc(deal.factoringRequestedAdvanceUsdc, { withSuffix: false }))
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
        {receiptPending ? (
          <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.open.receiptPending}</p>
        ) : (
          <button
            type="button"
            onClick={onOpenOffer}
            className={SECONDARY}
            data-guide="financier-offer"
          >
            {existingOffer ? t.open.editOffer : t.open.makeOffer}
          </button>
        )}
        {existingOffer && !receiptPending ? (
          <p className="text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">
            {t.open.yourOffer.replace('{rate}', (existingOffer.discountBps / 100).toFixed(1))}
          </p>
        ) : null}
        <Link
          href={`/credit-passport/${deal.seller}`}
          className={LINK}
          data-guide="financier-passport"
        >
          {t.open.record}
        </Link>
      </div>
    </li>
  );
}

function OrderList({
  t,
  available,
  failed,
  onOpenFund,
}: {
  t: Copy;
  available: DirectDeal[] | null;
  failed: boolean;
  onOpenFund: (deal: DirectDeal) => void;
}) {
  if (failed) return <p role="alert" className={cn(ALERT, 'mt-4')}>{t.po.loadError}</p>;
  if (available === null) return <ListSkeleton />;
  if (available.length === 0) return <EmptyState title={t.po.emptyTitle} body={t.po.emptyBody} />;
  return (
    <ul className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
      {available.map((deal) => {
        const meta = sellerMeta(deal, t);
        return (
          <li key={deal.jobId} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p dir="auto" className="truncate text-[16px] font-semibold text-[var(--lp-dark)]">{sellerName(deal, t)}</p>
              {meta && <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">{meta}</p>}
              <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">{t.po.capitalRequested}</p>
              <p className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
                {usdc(deal.poFinancingRequestedAdvanceUsdc ?? deal.dealAmountUsdc)}
              </p>
              <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">{t.po.repayOnPod}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
              <button type="button" onClick={() => onOpenFund(deal)} className={SECONDARY}>
                {t.po.fundLine}
              </button>
              <Link href={`/credit-passport/${deal.seller}`} className={LINK}>
                {t.open.record}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const OFFER_EXPIRES_HOURS = 24;

function SheetHeader({ id, title, onClose, closeLabel, busy }: { id: string; title: string; onClose: () => void; closeLabel: string; busy: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--lp-border-light)] px-5 py-4">
      <h2 id={id} className="text-[18px] font-semibold text-[var(--lp-dark)]">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label={closeLabel}
        className="inline-flex size-11 items-center justify-center rounded-[10px] text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--lp-dark)] disabled:opacity-40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function OfferSheet({
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
  const titleId = useId();
  const rateId = useId();
  const { data: walletClient } = useWalletClient();
  // Re-pricing an existing quote opens on the rate already offered, so an edit
  // starts from where you left it.
  const [discountBps, setDiscountBps] = useState<number>(existingOffer?.discountBps ?? 200);
  // The typed percent, kept apart from discountBps so a half-typed value is
  // not snapped out from under the cursor.
  const [discountInput, setDiscountInput] = useState(((existingOffer?.discountBps ?? 200) / 100).toFixed(1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The seller asks for financing against a portion of the future settlement.
  // That portion is not a prior payment: a 200 USDC request on a 500 USDC
  // invoice never reads as if the other 300 USDC was already released.
  const quote = buildFactoringQuote({
    invoiceValueUsdc: deal.dealAmountUsdc,
    escrowAvailableUsdc: deal.claimableUsdc,
    requestedSettlementUsdc: deal.factoringRequestedAdvanceUsdc,
    discountBps,
  });
  const advance = Number(quote.advanceUsdc);
  const isCircleUser = auth.method === 'circle';

  /// The seller named a floor when they asked for early payout. The backend
  /// refuses anything under it, so say so here rather than round-trip a 409.
  const sellerFloor = deal.factoringMinAdvanceUsdc ? Number(deal.factoringMinAdvanceUsdc) : null;

  // The advance is paid from this wallet when the seller accepts, so the offer
  // only goes out once the wallet holds it (backend routes/factoringFunding.ts).
  const [funding, setFunding] = useState<{ walletUsdc: string; shortfallUsdc: string } | null>(null);
  useEffect(() => {
    if (!isAuthed || !(Number(quote.advanceUsdc) > 0)) return;
    let live = true;
    const timer = window.setTimeout(() => {
      api.factoringFunding(quote.advanceUsdc).then((r) => { if (live) setFunding(r); }).catch(() => { if (live) setFunding(null); });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [isAuthed, quote.advanceUsdc]);
  const shortfall = funding && Number(funding.shortfallUsdc) > 0 ? funding.shortfallUsdc : null;
  const belowSellerFloor = sellerFloor !== null && advance < sellerFloor;
  const nothingToAdvance = advance <= 0;

  function setPercent(pct: number) {
    setDiscountBps(Math.round(pct * 100));
    setDiscountInput(pct.toFixed(1));
  }

  async function submit() {
    if (!isAuthed) {
      setError(t.offer.signIn);
      return;
    }
    if (belowSellerFloor) {
      setError(t.offer.belowFloor.replace('{amount}', sellerFloor!.toFixed(2)));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Wallet financiers sign the advance authorization now (USDC EIP-3009, no
      // gas, no transfer yet). The relay submits it the moment the seller
      // accepts, so the advance lands without the financier online. Email
      // financiers skip this; the backend signs from their identity wallet.
      let advanceAuthorization;
      if (!isCircleUser) {
        if (!walletClient || !auth.address) {
          setError(t.offer.connectWallet);
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
          valueUsdc: quote.advanceUsdc,
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
        offeredAdvanceUsdc: quote.advanceUsdc,
        expectedReturnUsdc: quote.settlementReturnUsdc,
        expiresInHours: OFFER_EXPIRES_HOURS,
        advanceAuthorization,
      });
      onPosted(r.offer);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ADVANCE_NOT_FUNDED') {
        api.factoringFunding(quote.advanceUsdc).then(setFunding).catch(() => {});
        return;
      }
      setError(friendlyError(e, chainCopy, t.declined, t.offer.error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConfirmSheetShell open labelledBy={titleId} busy={submitting} onClose={onClose}>
      <SheetHeader id={titleId} title={t.offer.title} onClose={onClose} closeLabel={t.close} busy={submitting} />
      <div className="space-y-6 p-5 md:p-6">
        <div>
          <p className={LABEL}>{t.offer.faceValue}</p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
            {usdc(deal.dealAmountUsdc)}
          </p>
        </div>

        <div>
          <p className={LABEL}>{t.offer.quickDiscount}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIER_DISCOUNT_HINT.map(({ tier, bps }) => {
              const on = discountBps === bps;
              return (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPercent(bps / 100)}
                  className={cn(
                    TOGGLE,
                    on
                      ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-bg)]'
                      : 'border-[var(--lp-outline-strong)] text-[var(--lp-dark)]',
                  )}
                >
                  {t.open.tier[tier]} · {(bps / 100).toFixed(0)}%
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={rateId} className={LABEL}>
              {t.offer.customDiscount}
            </label>
            <span className="inline-flex items-center gap-1">
              <input
                id={rateId}
                type="number"
                inputMode="decimal"
                min={1}
                max={20}
                step={0.1}
                value={discountInput}
                onChange={(e) => {
                  setDiscountInput(e.target.value);
                  const pct = Number(e.target.value);
                  if (Number.isFinite(pct) && pct >= 1 && pct <= 20) setDiscountBps(Math.round(pct * 100));
                }}
                onBlur={() => {
                  const pct = Number(discountInput);
                  setPercent(Number.isFinite(pct) ? Math.min(20, Math.max(1, pct)) : 1);
                }}
                aria-label={t.offer.customDiscountAria}
                className="min-h-11 w-[4.5rem] rounded-[8px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] px-2 text-end text-[16px] font-semibold tabular-nums text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
              <span className="text-[16px] font-semibold text-[var(--lp-dark)]">%</span>
            </span>
          </div>
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={discountBps}
            onChange={(e) => setPercent(Number(e.target.value) / 100)}
            aria-label={t.offer.customDiscountAria}
            className="mt-3 w-full accent-[var(--accent)]"
          />
          <div className="mt-1 flex justify-between text-[14px] tabular-nums text-[var(--lp-text-sub)]">
            <span>1%</span>
            <span>20%</span>
          </div>
        </div>

        <dl className="space-y-3 border-t border-[var(--lp-border-light)] pt-4">
          <SheetRow label={t.offer.settlementAssigned} value={usdc(quote.settlementAssignedUsdc)} />
          <SheetRow label={t.offer.youPayNow} value={usdc(quote.advanceUsdc)} strong />
          <SheetRow label={t.offer.youReceiveOnSettlement} value={usdc(quote.settlementReturnUsdc)} strong />
          <SheetRow label={t.offer.yourSpread} value={`+${usdc(quote.spreadUsdc)}`} />
          {sellerFloor !== null ? <SheetRow label={t.offer.sellerFloor} value={usdc(sellerFloor)} /> : null}
        </dl>

        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.offer.fundingSummaryTemplate
            .replace('{advance}', formatUsdc(quote.advanceUsdc, { withSuffix: false }))
            .replace('{settlement}', formatUsdc(quote.settlementAssignedUsdc, { withSuffix: false }))}{' '}
          {t.offer.openFor}
        </p>

        {nothingToAdvance ? (
          <p role="alert" className={ALERT}>
            {t.offer.nothingToAdvance}
          </p>
        ) : null}
        {belowSellerFloor ? (
          <p role="alert" className={ALERT}>
            {t.offer.belowFloor.replace('{amount}', sellerFloor!.toFixed(2))}
          </p>
        ) : null}
        {shortfall && funding ? (
          <div role="status" className="rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">
            <p className="text-[15px] text-[var(--lp-dark)]">
              {t.offer.fundFirst.replace('{wallet}', formatUsdc(funding.walletUsdc, { withSuffix: false })).replace('{amount}', formatUsdc(shortfall, { withSuffix: false }))}
            </p>
            <Link href="/bridge?direction=in" className={cn(SECONDARY, 'mt-3 w-full')}>
              {t.offer.fundFirstCta.replace('{amount}', formatUsdc(shortfall, { withSuffix: false }))}
            </Link>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className={ALERT}>
            {error}
          </p>
        ) : null}

        <button type="button" onClick={submit} disabled={submitting || belowSellerFloor || nothingToAdvance || !!shortfall} className={cn(PRIMARY, 'w-full')}>
          {submitting
            ? t.offer.posting
            : !isAuthed
              ? t.signInToPost
              : existingOffer
                ? t.offer.replaceOffer
                : t.offer.postOffer}
        </button>
      </div>
    </ConfirmSheetShell>
  );
}

function SheetRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[14px] text-[var(--lp-text-sub)]">{label}</dt>
      <dd className={cn('whitespace-nowrap text-end text-[15px] tabular-nums text-[var(--lp-dark)]', strong && 'font-semibold')}>{value}</dd>
    </div>
  );
}

function FundSheet({
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
  const date = useDate();
  const titleId = useId();
  const principalId = useId();
  const repayId = useId();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const refreshMoney = useMoneyRefresh();
  const face = Number(deal.dealAmountUsdc);
  const requested = deal.poFinancingRequestedAdvanceUsdc ? Number(deal.poFinancingRequestedAdvanceUsdc) : face;
  const nowUnix = Math.floor(Date.now() / 1000);
  const settlementDelaySeconds = deal.deadlineUnix ? Math.max(0, deal.deadlineUnix - nowUnix) : 0;
  const minimumRepaymentWindowSeconds = Math.max(7 * 86_400, settlementDelaySeconds + 7 * 86_400);
  const minimumRepaymentAtMs = (nowUnix + minimumRepaymentWindowSeconds) * 1000;
  // Default principal at 80% of the request, repay at 84% (a 5% fee on
  // principal), the demo scenario in sme-design.md section 17.
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
  const amount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  async function submit() {
    if (!isAuthed || !address) {
      setError(t.po.signIn);
      return;
    }
    if (!validRepay) {
      setError(t.po.repayInvalid);
      return;
    }
    if (collateral === null || collateral <= 0) {
      setError(t.po.stakePending);
      return;
    }
    if (stakeBalance && collateral > stakeBalance.free) {
      setError(t.po.stakeTooLow);
      return;
    }
    setSubmitting(true);
    setError(null);
    setStep('idle');
    try {
      if (isCircleUser) {
        // Email accounts: the backend signs approve and fund from the identity
        // wallet, returns both hashes and mirrors the line.
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
        if (!walletClient || !arcClient) throw new Error('Wallet not ready');
        const principalWei = parseUnits(principal.toFixed(6), ARC_USDC_DECIMALS);
        const repayWei = parseUnits(repay.toFixed(6), ARC_USDC_DECIMALS);
        const collateralWei = parseUnits(collateral.toFixed(6), ARC_USDC_DECIMALS);

        // Only approve when the existing allowance is short, so a repeat
        // funder does not pay for a redundant approve.
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

        // Never ask the wallet to broadcast what the live contracts already
        // say will revert: stale PO state, missing escrow wiring, allowance or
        // collateral drift, self-funding. The person reads why before paying gas.
        await arcClient.simulateContract({
          address: KARWAN_PO_FINANCING_ADDRESS,
          abi: poFinancingAbi,
          functionName: 'fund',
          args: [deal.jobId as `0x${string}`, principalWei, repayWei, BigInt(repaymentWindowSeconds), collateralWei],
          account: address,
        });

        setStep('funding');
        const fundHash = await walletClient.writeContract({
          address: KARWAN_PO_FINANCING_ADDRESS,
          abi: poFinancingAbi,
          functionName: 'fund',
          args: [deal.jobId as `0x${string}`, principalWei, repayWei, BigInt(repaymentWindowSeconds), collateralWei],
          chain: walletClient.chain,
          account: address,
        });
        await requireConfirmedTx(arcClient, fundHash, chainCopy.reverted);
        // Principal left the wallet in this transaction, so the balance on
        // screen is already stale.
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
      setError(friendlyError(e, chainCopy, t.declined, t.po.error));
    } finally {
      setSubmitting(false);
      setStep('idle');
    }
  }

  const protection =
    stakeBalance === null || collateral === null
      ? t.po.stakeChecking
      : stakeBalance.total <= 0
        ? t.po.stakeNone
        : stakeBalance.free <= 0
          ? t.po.stakeCommitted.replace('{total}', amount(stakeBalance.total))
          : collateral <= stakeBalance.free
            ? t.po.stakeCovers.replace('{collateral}', amount(collateral)).replace('{total}', amount(stakeBalance.total))
            : t.po.stakeShort.replace('{collateral}', amount(collateral)).replace('{free}', amount(stakeBalance.free));

  return (
    <ConfirmSheetShell open labelledBy={titleId} busy={submitting} onClose={onClose}>
      <SheetHeader id={titleId} title={t.po.sheetTitle} onClose={onClose} closeLabel={t.close} busy={submitting} />
      <div className="space-y-6 p-5 md:p-6">
        <div>
          <p className={LABEL}>{t.po.orderValue}</p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">{usdc(deal.dealAmountUsdc)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={principalId} className={LABEL}>
              {t.po.principal}
            </label>
            <input
              id={principalId}
              type="number"
              min={0}
              step={0.01}
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              disabled={submitting}
              className={cn(FIELD, 'mt-2 tabular-nums')}
            />
          </div>
          <div>
            <label htmlFor={repayId} className={LABEL}>
              {t.po.repayOnSettlement}
            </label>
            <input
              id={repayId}
              type="number"
              min={0}
              step={0.01}
              value={repay}
              onChange={(e) => setRepay(Number(e.target.value))}
              disabled={submitting}
              className={cn(FIELD, 'mt-2 tabular-nums')}
            />
          </div>
        </div>

        <div>
          <p className={LABEL}>{t.po.sellerProtection}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-dark)]">{protection}</p>
        </div>

        <div>
          <p className={LABEL}>{t.po.repaymentDeadline}</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[14px] text-[var(--lp-text-sub)]">{t.po.expectedDelivery}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-[var(--lp-dark)]">
                {deal.deadlineUnix ? date(deal.deadlineUnix * 1000) : t.po.notDated}
              </dd>
            </div>
            <div>
              <dt className="text-[14px] text-[var(--lp-text-sub)]">{t.po.earliestRepayment}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-[var(--lp-dark)]">{date(minimumRepaymentAtMs)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.po.earliestNote}</p>
          <div role="radiogroup" aria-label={t.po.repaymentDeadline} className="mt-3 grid grid-cols-3 gap-2">
            {REPAYMENT_EXTENSION_OPTIONS.map((opt) => {
              const on = repaymentWindowSeconds === minimumRepaymentWindowSeconds + opt.seconds;
              return (
                <button
                  key={opt.seconds}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={submitting}
                  onClick={() => setRepaymentWindowSeconds(minimumRepaymentWindowSeconds + opt.seconds)}
                  className={cn(
                    'min-h-11 min-w-0 rounded-[10px] border px-2 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                    on
                      ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-bg)]'
                      : 'border-[var(--lp-outline-strong)] text-[var(--lp-dark)]',
                  )}
                >
                  <span className="block text-[14px] font-semibold">{t.extensions[opt.labelKey]}</span>
                  <span className="mt-0.5 block text-[14px] opacity-80">{date(minimumRepaymentAtMs + opt.seconds * 1000)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <dl className="space-y-3 border-t border-[var(--lp-border-light)] pt-4">
          <SheetRow label={t.po.sellerReceivesNow} value={usdc(principal)} />
          <SheetRow label={t.po.youReceiveOnSettlement} value={usdc(repay)} strong />
          <SheetRow label={t.po.yourSpread} value={`+${usdc(spread)}`} />
        </dl>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          <span className="font-medium text-[var(--lp-dark)]">{t.po.ifSettlementFallsShort}.</span>{' '}
          {t.po.shortfallNote.replace('{date}', date((nowUnix + repaymentWindowSeconds) * 1000))}
        </p>

        {error ? (
          <p role="alert" className={ALERT}>
            {error}
          </p>
        ) : null}

        <button type="button" onClick={submit} disabled={submitting || !validRepay || onWrongChain} className={cn(PRIMARY, 'w-full')}>
          {step === 'approving'
            ? t.po.approving
            : step === 'funding'
              ? t.po.funding
              : step === 'mirroring'
                ? t.po.confirming
                : submitting
                  ? t.working
                  : onWrongChain
                    ? t.switchToArc
                    : isAuthed
                      ? t.po.fundLine
                      : t.signInToFund}
        </button>
      </div>
    </ConfirmSheetShell>
  );
}
