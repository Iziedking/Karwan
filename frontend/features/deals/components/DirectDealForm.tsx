'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { api, ApiError, type Partner } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { CreationReview } from './CreationReview';
import { validAmount, validWhole } from '../creationValidation';
import type { Messages } from '@/shared/i18n/messages/en';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
/// A Paytag handle, with or without the leading @. Kept deliberately narrow so
/// a half-typed address never gets mistaken for a handle and fired at the API.
const PAYTAG_RE = /^@?[a-zA-Z0-9_-]{1,32}$/;
/// P2P rollout flag. Must match the backend's PAYTAG_ENABLED; when the backend
/// is off it rejects the handle anyway, this just keeps the field honest.
const PAYTAG_ENABLED = process.env.NEXT_PUBLIC_PAYTAG_ENABLED === '1';

// SME trade-finance constants. Hoisted per Vercel `rendering-hoist-jsx`.
type TradeType = 'service' | 'goods' | 'mixed';
type IncotermsCode = 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
type PaymentTermsCode = 'immediate' | 'net30' | 'net60' | 'net90';
type DocumentKind = 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
type TradeSourceChannel = 'karwan' | 'email' | 'tiktok' | 'instagram' | 'facebook' | 'x' | 'linkedin' | 'other';

// Shared with the request form: one trade vocabulary, in `tradeTerms`, rather
// than two copies whose glosses had already drifted apart.
const INCOTERM_CODES_DD = ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'] as const;
const PAYMENT_TERM_CODES_DD = ['immediate', 'net30', 'net60', 'net90'] as const;
const SECTORS_DD: ReadonlyArray<string> = [
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
];
const DOC_KIND_LABEL_DD: Record<DocumentKind, string> = {
  invoice: 'INVOICE',
  po: 'PO',
  bol: 'BoL',
  coo: 'CoO',
  pod: 'PoD',
  other: 'OTHER',
};


async function sha256OfFileDD(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hashBuffer);
  let hex = '0x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

function inferDocKindDD(name: string): DocumentKind {
  const lower = name.toLowerCase();
  if (lower.includes('invoice')) return 'invoice';
  if (lower.includes('po') || lower.includes('purchase')) return 'po';
  if (lower.includes('bol') || lower.includes('bill')) return 'bol';
  if (lower.includes('coo') || lower.includes('origin')) return 'coo';
  if (lower.includes('pod') || lower.includes('delivery')) return 'pod';
  return 'other';
}

export function DirectDealForm() {
  const t = useTranslations();
  const tt = t.tradeTerms;
  const dd = t.directDeal;
  const c = t.dealCreation;
  const [reviewing, setReviewing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  // Source of truth covers both wagmi web3 users and Circle passkey/email
  // users. Direct-deal create is backend-signed (the buyer agent DCW opens
  // escrow), so no actual wallet signature is needed here either way. The
  // form just needs the user's identity address.
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  // The trade-context band (goods/Incoterms/payment terms/company/docs) is a
  // business surface. Individuals never see it, so a P2P direct deal stays the
  // simple service flow.
  const { isBusinessWorkspace: isBusiness } = useWorkspaceContext();
  // "Make offer" links from a listing detail land here with seller/amount/terms
  // pre-filled. Read once on mount; further changes come from user input.
  const search = useSearchParams();
  const initialSeller = search.get('seller') ?? '';
  const initialAmountRaw = search.get('amount');
  const initialAmount =
    initialAmountRaw != null && Number.isFinite(Number(initialAmountRaw))
      ? Number(initialAmountRaw)
      : undefined;
  const initialTerms = search.get('terms') ?? '';
  const initialSourceChannel = search.get('source');
  const sourceChannels: ReadonlyArray<TradeSourceChannel> = [
    'karwan',
    'email',
    'tiktok',
    'instagram',
    'facebook',
    'x',
    'linkedin',
    'other',
  ];
  const sourceChannel: TradeSourceChannel = sourceChannels.includes(initialSourceChannel as TradeSourceChannel)
    ? (initialSourceChannel as TradeSourceChannel)
    : 'karwan';
  const sourceReference = search.get('sourceRef');

  const [seller, setSeller] = useState(initialSeller);
  /// Counterparty mode. 'wallet' takes a 0x address (existing flow); 'email'
  /// takes an email and mints a one-shot shareable invite link instead. Funding
  /// stays parked until the recipient claims the link.
  const [counterpartyMode, setCounterpartyMode] = useState<'wallet' | 'email'>(search.get('sellerEmail') ? 'email' : 'wallet');
  const [counterpartyEmail, setCounterpartyEmail] = useState(search.get('sellerEmail') ?? '');
  /// Trusted-match opt-in. When true, the seller's accept panel will surface a
  /// stake requirement. Default off, most casual deals don't need it.
  const [requireStake, setRequireStake] = useState(false);
  /// Stake percentage when requireStake is on. Slider 50..100 in 5% steps,
  /// default 50%. Translates to on-chain reservationBps = pct * 100.
  const [requireStakePct, setRequireStakePct] = useState(50);
  /// Explicit opt-in for the Chainlink CRE delivery-evidence lane. Ordinary
  /// deals remain lightweight; selecting this records the requirement in the
  /// agreement before either party accepts it.
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [highSignal, setHighSignal] = useState(false);
  const [highSignalSubject, setHighSignalSubject] = useState<'seller' | 'buyer' | 'both'>('seller');
  // Numeric fields always start empty; the placeholder "0" renders instead
  // of any autofilled number. The only exception is when the user arrives
  // from a listing's "Make offer" deep link with ?amount= in the URL, which
  // pre-fills from the listing's asking price; otherwise it stays blank.
  const [amount, setAmount] = useState<number | ''>(initialAmount ?? '');
  const [deadlineValue, setDeadlineValue] = useState<number | ''>('');
  const [deadlineUnit, setDeadlineUnit] = useState<'min' | 'hr' | 'd'>('d');
  /// Seller has this long to accept before the deal auto-expires (pre-accept,
  /// no rep hit). Buyer picks a preset; 24h is the human default.
  const [acceptanceHours, setAcceptanceHours] = useState<number>(24);
  const [firstPct, setFirstPct] = useState<number | ''>('');
  const [terms, setTerms] = useState(initialTerms);
  // SME trade-finance state. Split into one useState per picker per the
  // Vercel `rerender-split-combined-hooks` rule. Default tradeType is
  // 'service' so the existing service-flow deal experience is unchanged.
  const [tradeType, setTradeType] = useState<'service' | 'goods' | 'mixed'>('service');
  const [incoterms, setIncoterms] = useState<
    'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP' | null
  >(null);
  const [paymentTerms, setPaymentTerms] = useState<
    'immediate' | 'net30' | 'net60' | 'net90'
  >('immediate');
  const [companyName, setCompanyName] = useState('');
  const [companySector, setCompanySector] = useState('');
  const [companyRegion, setCompanyRegion] = useState('');
  const [documentRefs, setDocumentRefs] = useState<
    Array<{
      hash: string;
      kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
      label: string;
    }>
  >([]);
  const [hashingFile, setHashingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /// The counterparty's company card, when the address belongs to a registered
  /// business. Seeds the trade-context block so a buyer coming from /partners
  /// never retypes what the partner already published.
  const [partner, setPartner] = useState<Partner | null>(null);

  const sellerValid = ADDR_RE.test(seller.trim());
  const sameWallet =
    sellerValid && address && seller.trim().toLowerCase() === address.toLowerCase();

  /// The counterparty field takes a wallet address OR a Paytag handle, the way
  /// a wallet takes an ENS name: you paste whatever they handed you. Paytag is
  /// P2P only, so it is offered only when this deal would NOT land in the
  /// finance lane (a business trading goods/mixed). A handle is a nickname that
  /// anyone can claim, and the finance lane moves credit against a verified
  /// business, so it keeps demanding a real address.
  const paytagAllowed = PAYTAG_ENABLED && !(isBusiness && tradeType !== 'service');
  const sellerLooksLikePaytag =
    paytagAllowed &&
    counterpartyMode === 'wallet' &&
    !sellerValid &&
    PAYTAG_RE.test(seller.trim());

  const [paytagHit, setPaytagHit] = useState<{ handle: string; maskedAddress: string } | null>(
    null,
  );
  const [paytagMissing, setPaytagMissing] = useState(false);
  const [paytagLooking, setPaytagLooking] = useState(false);

  // Debounced so the lookup fires when they stop typing, not per keystroke.
  const paytagQuery = sellerLooksLikePaytag ? seller.trim().replace(/^@/, '').toLowerCase() : null;
  useEffect(() => {
    if (!paytagQuery) {
      setPaytagHit(null);
      setPaytagMissing(false);
      setPaytagLooking(false);
      return;
    }
    let live = true;
    setPaytagLooking(true);
    const t = setTimeout(() => {
      api
        .resolvePaytag(paytagQuery)
        .then((r) => {
          if (!live) return;
          if (r.found && r.handle && r.maskedAddress) {
            setPaytagHit({ handle: r.handle, maskedAddress: r.maskedAddress });
            setPaytagMissing(false);
          } else {
            setPaytagHit(null);
            setPaytagMissing(true);
          }
        })
        .catch(() => {
          if (!live) return;
          setPaytagHit(null);
          setPaytagMissing(true);
        })
        .finally(() => {
          if (live) setPaytagLooking(false);
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [paytagQuery]);

  // Look the counterparty up once per address. Seeding overwrites the company
  // fields because the partner's own card is more authoritative than anything
  // the buyer would type about them; edits after the lookup stick, since the
  // effect only re-runs when the address itself changes.
  const seededFor = useRef<string | null>(null);
  const lookupAddr =
    isBusiness && counterpartyMode === 'wallet' && sellerValid && !sameWallet
      ? seller.trim().toLowerCase()
      : null;
  useEffect(() => {
    if (!lookupAddr || seededFor.current === lookupAddr) return;
    let live = true;
    api
      .getPartner(lookupAddr)
      .then(({ partner: p }) => {
        if (!live) return;
        seededFor.current = lookupAddr;
        setPartner(p);
        setCompanyName(p.name);
        setCompanySector(p.sector ?? '');
        setCompanyRegion(p.region ?? '');
      })
      .catch(() => {
        // Not a registered business, or no company card. Leave the block blank
        // so the buyer can describe the counterparty themselves.
        if (live) setPartner(null);
      });
    return () => {
      live = false;
    };
  }, [lookupAddr]);
  // Loose email pattern. Backend re-validates via zod.
  const emailValid =
    counterpartyEmail.trim().length > 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartyEmail.trim());
  const counterpartyValid =
    counterpartyMode === 'wallet'
      ? (sellerValid && !sameWallet) || !!paytagHit
      : emailValid;
  const amountValid = validAmount(amount);
  // Single-input deadline with a min/hr/day unit toggle. Bounds per unit
  // mirror the buyer brief form so behaviour is identical across surfaces.
  // Empty value = open-ended (no delivery deadline, no unilateral cancel for
  // the buyer; seller has no time pressure).
  const deadlineMax =
    deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : 180;
  const deadlineValid =
    deadlineValue === '' ||
    validWhole(deadlineValue, 1, deadlineMax);
  const pctValid = validWhole(firstPct, 1, 99);
  const termsValid = terms.trim().length > 0;

  const canSubmit =
    isConnected &&
    counterpartyValid &&
    amountValid &&
    deadlineValid &&
    pctValid &&
    termsValid &&
    !submitting && !hashingFile;

  const previewUnitLabel =
    deadlineUnit === 'min'
      ? dd.preview.unitMin
      : deadlineUnit === 'hr'
        ? dd.preview.unitHr
        : dd.preview.unitDays;
  // Convert the (value, unit) pair into the days+hours pair the API accepts.
  // Minutes round up to the next hour so the on-chain deadlineUnix is never
  // shorter than what the user picked.
  const totalSeconds =
    typeof deadlineValue === 'number'
      ? deadlineUnit === 'min'
        ? deadlineValue * 60
        : deadlineUnit === 'hr'
          ? deadlineValue * 3600
          : deadlineValue * 86400
      : 0;
  const submitDays = Math.floor(totalSeconds / 86400);
  const submitHours = Math.ceil((totalSeconds % 86400) / 3600);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address || inFlight.current) return;
    if (!reviewing) { setReviewing(true); return; }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const counterpartyCompany =
        companyName || companySector || companyRegion
          ? {
              name: companyName.trim() || undefined,
              sector: companySector || undefined,
              region: companyRegion.trim() || undefined,
            }
          : undefined;
      const r = await api.createDirectDeal({
        buyerAddress: address!,
        ...(counterpartyMode === 'wallet'
          ? paytagHit
            ? { sellerPaytag: paytagHit.handle }
            : { sellerAddress: seller.trim() }
          : { sellerEmail: counterpartyEmail.trim().toLowerCase() }),
        dealAmountUsdc: amount as number,
        deadlineDays: submitDays,
        deadlineHours: submitHours,
        acceptanceWindowHours: acceptanceHours,
        terms: terms.trim(),
        firstReleasePct: firstPct as number,
        requireStake,
        requireStakePct: requireStake ? requireStakePct : undefined,
        evidenceRequired,
        verificationPolicy: highSignal ? 'high_signal' : 'standard',
        verificationSubject: highSignal ? highSignalSubject : undefined,
        tradeType: tradeType !== 'service' ? tradeType : undefined,
        incoterms: tradeType !== 'service' && incoterms ? incoterms : undefined,
        paymentTerms: tradeType !== 'service' ? paymentTerms : undefined,
        counterpartyCompany: tradeType !== 'service' ? counterpartyCompany : undefined,
        documentRefs: documentRefs.length > 0 ? documentRefs : undefined,
        sourceContext: {
          channel: sourceChannel,
          ...(sourceReference ? { reference: sourceReference } : {}),
        },
      });
      sfx.send();
      // Land on the deal page in both modes. The detail page surfaces
      // PendingInviteCopy when the deal has a pending email counterparty, so
      // the buyer sees the same copy-link affordance, but at a real URL they
      // can revisit and bookmark instead of a one-off form state. The
      // form-bound invite banner was easy to scroll past on a long-form page
      // so the buyer would tap Open Deal and never realise the link existed.
      router.push(`/deals/${r.deal.jobId}`);
    } catch (err) {
      // The refusals a user can act on come back with a `detail` written for a
      // person: an email that is their own account, or one connected to two
      // accounts. A generic prefix hid the reason and left them retrying.
      const detail = err instanceof ApiError ? err.detail : undefined;
      setError(typeof detail === 'string' && detail.trim() ? detail : dd.errorPrefix);
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  if (!isConnected) {
    return (
      <p className="text-[13px] text-[var(--lp-text-sub)]">{dd.notConnected}</p>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-7">
      <fieldset hidden={reviewing} disabled={submitting || reviewing} className="space-y-7 min-w-0">
      {/* COUNTERPARTY */}
      <FieldSection
        eyebrow={dd.counterparty.eyebrow}
        title={c.seller}
      >
        <div role="group" aria-label={c.seller} className="flex flex-wrap gap-2">
          {(['wallet', 'email'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={counterpartyMode === mode}
              onClick={() => setCounterpartyMode(mode)} disabled={submitting}
              className="min-h-11 rounded-xl border px-4 text-[14px] font-semibold"
              style={{ background: counterpartyMode === mode ? 'var(--lp-control-active-bg)' : 'transparent', color: counterpartyMode === mode ? 'var(--lp-control-active-ink)' : 'var(--lp-dark)', borderColor: 'var(--lp-outline)' }}>
              {mode === 'email' ? c.email : paytagAllowed ? c.wallet : dd.counterparty.walletLabel}
            </button>
          ))}
        </div>
        {counterpartyMode === 'wallet' ? (
          <FormLabel
            label={paytagAllowed ? dd.counterparty.walletOrPaytagLabel : dd.counterparty.walletLabel}
            hint={paytagAllowed ? dd.counterparty.walletOrPaytagHint : dd.counterparty.walletHint}
          >
            <input
              type="text"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              placeholder={
                paytagAllowed
                  ? dd.counterparty.walletOrPaytagPlaceholder
                  : dd.counterparty.walletPlaceholder
              }
              disabled={submitting}
              className="form-input form-input-mono"
            />
            {paytagLooking && (
              <span className="mono text-[11px] text-[var(--lp-text-muted)] mt-1.5 inline-block">
                {dd.counterparty.paytagLooking}
              </span>
            )}
            {paytagHit && (
              <p className="mt-2 mono text-[12px] text-[var(--lp-dark)]">
                <span style={{ color: 'var(--lp-accent)' }}>@{paytagHit.handle}</span>
                <span className="text-[var(--lp-text-muted)]"> · {paytagHit.maskedAddress}</span>
              </p>
            )}
            {paytagMissing && !paytagLooking && (
              <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
                {dd.counterparty.paytagNotFound}
              </span>
            )}
            {seller.length > 0 && !sellerValid && !sellerLooksLikePaytag && (
              <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
                {paytagAllowed
                  ? dd.counterparty.walletOrPaytagInvalid
                  : dd.counterparty.walletInvalid}
              </span>
            )}
            {sameWallet && (
              <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
                {dd.counterparty.walletSelfWarning}
              </span>
            )}
            {partner && (
              <div
                className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5"
                style={{
                  background: 'var(--lp-light)',
                  border: '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 2,
                }}
              >
                <span className="font-sans text-[13.5px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
                  {partner.name}
                </span>
                {partner.verified && (
                  <span
                    className="inline-flex items-center gap-1 mono text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5"
                    style={{
                      background: 'color-mix(in oklab, #1f7a4c 14%, transparent)',
                      color: '#1f7a4c',
                      borderRadius: 3,
                    }}
                  >
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Verified
                  </span>
                )}
                {(partner.sector || partner.region) && (
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    {[partner.sector, partner.region].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            )}
          </FormLabel>
        ) : (
          <FormLabel
            label={dd.counterparty.emailLabel}
            hint={dd.counterparty.emailHint}
          >
            <input
              type="email"
              value={counterpartyEmail}
              onChange={(e) => setCounterpartyEmail(e.target.value)}
              placeholder={dd.counterparty.emailPlaceholder}
              disabled={submitting}
              className="form-input"
            />
            {counterpartyEmail.length > 3 && !emailValid && (
              <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
                {dd.counterparty.emailInvalid}
              </span>
            )}
          </FormLabel>
        )}
      </FieldSection>

      {/* DELIVERABLE */}
      <FieldSection eyebrow={dd.deliverable.eyebrow} title={c.delivery}>
        <FormLabel label={dd.deliverable.termsLabel} hint={dd.deliverable.termsHint}>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={3}
            disabled={submitting}
            placeholder={
              tradeType === 'goods'
                ? 'e.g. 500 kg organic shea butter, FOB Lagos, packed in 25 kg drums.'
                : tradeType === 'mixed'
                  ? 'e.g. Equipment install on site, including shipping and commissioning.'
                  : dd.deliverable.termsPlaceholder
            }
            className="form-input form-textarea"
          />
        </FormLabel>
      </FieldSection>

      {/* TERMS */}
      <FieldSection eyebrow={dd.terms.eyebrow} title={c.priceDeadline}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <FormLabel label={dd.terms.amountLabel} unit="USDC">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              disabled={submitting}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="form-input form-input-num"
            />
          </FormLabel>
          <FormLabel
            label={dd.terms.deadlineLabel}
            unit={previewUnitLabel}
            hint={dd.terms.deadlineHint}
          >
            <div className="flex items-stretch gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={deadlineMax}
                step={1}
                value={deadlineValue}
                disabled={submitting}
                onChange={(e) =>
                  setDeadlineValue(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="0"
                className="form-input form-input-num flex-1 min-w-0"
              />
              <DeadlineUnitPicker
                value={deadlineUnit}
                disabled={submitting}
                ariaLabel={dd.deadlineUnitAria}
                labels={dd.unitPickerLabels}
                onChange={(next) => {
                  // When switching units, reset to empty so the user picks a
                  // sensible number for the new unit. The buyer form seeds
                  // sample values; the direct-deal form stays empty per the
                  // "no autofills" rule.
                  setDeadlineUnit(next);
                  setDeadlineValue('');
                }}
              />
            </div>
          </FormLabel>
        </div>
        {deadlineValue === '' ? <p className="text-[14px] leading-6 text-[var(--lp-text-sub)]">{c.noDeadline}</p> : null}
      </FieldSection>

      <FieldSection eyebrow={dd.terms.eyebrow} title={c.payment}>
        <p className="text-[14px] leading-6 text-[var(--lp-text-sub)]">{c.splitHelp}</p>
        <div className="max-w-sm">
          <FormLabel
            label={dd.terms.deliveryPctLabel}
            unit="%"
            hint={c.splitHelp}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              step={1}
              value={firstPct}
              disabled={submitting}
              onChange={(e) => setFirstPct(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="form-input form-input-num"
            />
          </FormLabel>

        </div>
        {pctValid ? <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{c.splitRemaining.replace('{n}', String(100 - Number(firstPct)))}</p> : null}
      </FieldSection>

      {/* TRADE CONTEXT. Business-only surface on the SME Trades rail. Hidden
          for individuals so a P2P direct deal stays the simple service flow. */}
      {SME_TRADES_ENABLED && isBusiness && (
      <FieldSection eyebrow="[:TRADE CONTEXT:]" title={tt.sectionTitle}>
        <FormLabel label={tt.tradeType}>
          <div className="flex gap-2 flex-wrap">
            {(['service', 'goods', 'mixed'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={submitting}
                onClick={() => setTradeType(opt)}
                className={cn(
                  'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                  tradeType === opt
                    ? 'bg-[var(--lp-control-active-bg)] text-[var(--lp-control-active-ink)] border-[var(--lp-control-active-border)]'
                    : 'bg-transparent text-[var(--lp-dark)] border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)]',
                )}
                style={{
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  borderBottomLeftRadius: 6,
                  borderBottomRightRadius: 2,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </FormLabel>
        {tradeType !== 'service' ? (
          <>
            <FormLabel label={tt.incoterms} hint={tt.incotermsHint}>
              <div className="flex gap-2 flex-wrap">
                {INCOTERM_CODES_DD.map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={submitting}
                    title={tt.incotermGloss[code]}
                    onClick={() => setIncoterms(code)}
                    className={cn(
                      'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                      incoterms === code
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
                    {code}
                  </button>
                ))}
              </div>
            </FormLabel>
            <FormLabel label={tt.paymentTerms} hint={tt.paymentTermsHint}>
              <div className="flex gap-2 flex-wrap">
                {PAYMENT_TERM_CODES_DD.map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={submitting}
                    onClick={() => setPaymentTerms(code)}
                    className={cn(
                      'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                      paymentTerms === code
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
                    {tt.paymentTermLabels[code]}
                  </button>
                ))}
              </div>
            </FormLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormLabel label="Company">
                <input
                  type="text"
                  value={companyName}
                  disabled={submitting}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={tt.counterpartyPlaceholder}
                  className="form-input"
                  maxLength={120}
                />
              </FormLabel>
              <FormLabel label="Sector">
                <select
                  value={companySector}
                  disabled={submitting}
                  onChange={(e) => setCompanySector(e.target.value)}
                  className="form-input"
                >
                  <option value="">—</option>
                  {SECTORS_DD.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Region">
                <input
                  type="text"
                  value={companyRegion}
                  disabled={submitting}
                  onChange={(e) => setCompanyRegion(e.target.value)}
                  placeholder={tt.counterpartyRegionPlaceholder}
                  className="form-input"
                  maxLength={80}
                />
              </FormLabel>
            </div>
            <FormLabel
              label={c.documents}
              hint="Files stay on your device. Karwan records a tamper-evident receipt after the deal is accepted."
            >
              <input
                type="file"
                disabled={submitting || hashingFile}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setHashingFile(true);
                  try {
                    const hash = await sha256OfFileDD(file);
                    const kind = inferDocKindDD(file.name);
                    setDocumentRefs((prev) =>
                      prev.find((d) => d.hash === hash)
                        ? prev
                        : [...prev, { hash, kind, label: file.name }],
                    );
                  } finally {
                    setHashingFile(false);
                    e.target.value = '';
                  }
                }}
                className="form-input"
              />
              {hashingFile ? (
                <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mt-2">
                  Hashing…
                </p>
              ) : null}
              {documentRefs.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {documentRefs.map((d) => (
                    <li
                      key={d.hash}
                      className="flex items-center gap-3 px-3 py-2 border border-[var(--lp-field-border)] bg-[var(--lp-bg)]"
                      style={{
                        borderTopLeftRadius: 6,
                        borderTopRightRadius: 6,
                        borderBottomLeftRadius: 6,
                        borderBottomRightRadius: 2,
                      }}
                    >
                      <span className="mono text-[9px] uppercase tracking-[0.16em] font-bold px-1.5 py-0.5 bg-[var(--lp-dark)] text-[var(--lp-bg)]">
                        {DOC_KIND_LABEL_DD[d.kind]}
                      </span>
                      <span className="flex-1 truncate text-[12px] text-[var(--lp-dark)]">
                        {d.label}
                      </span>
                      <code className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)] hidden sm:inline">
                        {d.hash.slice(0, 10)}…{d.hash.slice(-6)}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          setDocumentRefs((prev) => prev.filter((x) => x.hash !== d.hash))
                        }
                        className="text-[14px] leading-none px-1 text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
                        aria-label={tt.removeDocument}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </FormLabel>
          </>
        ) : null}
      </FieldSection>
      )}

      <details className="border-y border-[var(--lp-border-light)]">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between py-3 text-[15px] font-semibold text-[var(--lp-dark)]">{c.optional}<span aria-hidden>＋</span></summary>
        <div className="space-y-4 pb-5">
          <FormLabel
            label={dd.terms.acceptanceWindowLabel}
            hint={dd.terms.acceptanceWindowHint}
          >
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { label: dd.terms.presets.fifteenMin, value: 0.25 },
                  { label: dd.terms.presets.oneHr, value: 1 },
                  { label: dd.terms.presets.sixHr, value: 6 },
                  { label: dd.terms.presets.dayOne, value: 24 },
                  { label: dd.terms.presets.threeDays, value: 72 },
                  { label: dd.terms.presets.sevenDays, value: 168 },
                ] as const
              ).map((opt) => {
                const active = acceptanceHours === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={submitting}
                    onClick={() => setAcceptanceHours(opt.value)}
                    className="min-h-11 px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: active ? 'var(--lp-control-active-bg)' : 'var(--lp-card)',
                      color: active ? 'var(--lp-control-active-ink)' : 'var(--lp-text-sub)',
                      border: active
                        ? '1px solid var(--lp-control-active-border)'
                        : '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 7,
                      borderTopRightRadius: 7,
                      borderBottomLeftRadius: 7,
                      borderBottomRightRadius: 2,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </FormLabel>

      {/* TRUSTED MATCH toggle. When on, the seller will see a stake
          requirement on their accept panel. Off-default, most direct deals
          are casual and don't need slashable insurance. Chain-side gating
          arrives in the next escrow redeploy; the flag is captured today
          so old deals already carry it then. */}
      <label
        className={cn(
          'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
          requireStake
            ? 'bg-[color-mix(in_oklab,var(--lp-accent)_10%,transparent)] border-[color-mix(in_oklab,var(--lp-accent)_35%,transparent)]'
            : 'bg-[var(--lp-light)] border-[var(--lp-border-light)] hover:border-[var(--lp-text-muted)]',
        )}
        style={{
          border: '1px solid',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 3,
        }}
      >
        <input
          type="checkbox"
          checked={requireStake}
          onChange={(e) => setRequireStake(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
          aria-describedby="require-stake-help"
        />
        <div className="min-w-0">
          <span
            className="text-[14px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: 'var(--lp-dark)' }}
          >
            {c.security}
            <Hint>{dd.trustedMatch.body}</Hint>
          </span>
          <p
            id="require-stake-help"
            className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]"
          >
            {c.securityHelp}
          </p>
          {requireStake && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={requireStakePct}
                onChange={(e) => setRequireStakePct(Number(e.target.value))}
                disabled={submitting}
                className="flex-1 min-w-[180px] accent-[var(--lp-accent)]"
                aria-label={dd.trustedMatch.sliderAria}
              />
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-sans text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
                  {requireStakePct}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  {dd.trustedMatch.pctCaption}
                </span>
              </div>
              {typeof amount === 'number' && amount > 0 && (
                <p className="basis-full mono text-[11px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
                  {dd.trustedMatch.stakeNoteTemplate.replace(
                    '{amount}',
                    ((amount * requireStakePct) / 100).toFixed(2),
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </label>

      <label
        className={cn(
          'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
          evidenceRequired
            ? 'bg-[color-mix(in_oklab,var(--lp-accent)_10%,transparent)] border-[color-mix(in_oklab,var(--lp-accent)_35%,transparent)]'
            : 'bg-[var(--lp-light)] border-[var(--lp-border-light)] hover:border-[var(--lp-text-muted)]',
        )}
        style={{
          border: '1px solid',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 3,
        }}
      >
        <input
          type="checkbox"
          checked={evidenceRequired}
          onChange={(e) => setEvidenceRequired(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
          aria-describedby="delivery-evidence-help"
        />
        <div className="min-w-0">
          <span
            className="text-[14px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: 'var(--lp-dark)' }}
          >
            {c.evidence}
            <Hint>
              {c.evidenceHelp}
            </Hint>
          </span>
          <p
            id="delivery-evidence-help"
            className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]"
          >
            {c.evidenceHelp}
          </p>
        </div>
      </label>

      <div
        className={cn(
          'px-4 py-3 transition-colors',
          highSignal
            ? 'bg-[color-mix(in_oklab,var(--lp-accent)_10%,transparent)] border-[color-mix(in_oklab,var(--lp-accent)_35%,transparent)]'
            : 'bg-[var(--lp-light)] border-[var(--lp-border-light)]',
        )}
        style={{
          border: '1px solid',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 3,
        }}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={highSignal}
            onChange={(e) => setHighSignal(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0"
            aria-describedby="high-signal-help"
          />
          <span className="min-w-0">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)] inline-flex items-center gap-1.5">
              {c.identity}
              <Hint>
                {c.identityHelp}
              </Hint>
            </span>
            <span id="high-signal-help" className="mt-1.5 block text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
              {c.identityHelp}
            </span>
          </span>
        </label>
        {highSignal ? (
          <div className="mt-3 flex flex-wrap gap-2 ps-7" role="radiogroup" aria-label={c.who}>
            {(['seller', 'buyer', 'both'] as const).map((subject) => (
              <button
                key={subject}
                type="button"
                role="radio"
                aria-checked={highSignalSubject === subject}
                onClick={() => setHighSignalSubject(subject)}
                disabled={submitting}
                className="min-h-11 px-3 py-2 mono text-[10px] font-bold uppercase tracking-[0.12em] border transition-colors"
                style={{
                  background: highSignalSubject === subject ? 'var(--lp-control-active-bg)' : 'transparent',
                  color: highSignalSubject === subject ? 'var(--lp-control-active-ink)' : 'var(--lp-text-sub)',
                  borderColor: highSignalSubject === subject ? 'var(--lp-control-active-border)' : 'var(--lp-outline)',
                  borderRadius: 7,
                }}
              >
                {subject === 'both' ? c.both : subject === 'seller' ? c.sellerRole : c.buyerRole}
              </button>
            ))}
          </div>
        ) : null}
      </div>


        </div>
      </details>
      </fieldset>

      {reviewing ? <CreationReview busy={submitting} onEdit={() => {
        setReviewing(false);
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus());
      }} rows={[
        { label: c.seller, value: counterpartyMode === 'email' ? counterpartyEmail : seller },
        { label: c.delivery, value: terms },
        { label: dd.terms.amountLabel, value: `${amount} USDC` },
        { label: dd.terms.deadlineLabel, value: deadlineValue === '' ? c.noDeadline : `${submitDays * 24 + submitHours} ${dd.preview.unitHr}` },
        { label: c.payment, value: `${firstPct}% / ${100 - Number(firstPct)}%` },
        { label: c.responseWindow, value: `${acceptanceHours} ${dd.preview.unitHr}` },
        { label: c.safeguards, value: [
          requireStake ? `${c.security}: ${requireStakePct}%` : '',
          evidenceRequired ? c.evidenceHelp : '',
          highSignal ? `${c.identity}: ${highSignalSubject === 'both' ? c.both : highSignalSubject === 'seller' ? c.sellerRole : c.buyerRole}. ${c.identityHelp}` : '',
        ].filter(Boolean).join('\n') || c.none },
        ...(SME_TRADES_ENABLED && isBusiness && tradeType !== 'service' ? [{ label: c.extra, value: [tt.types[tradeType], incoterms, tt.paymentTermLabels[paymentTerms], companyName, companySector, companyRegion].filter(Boolean).join(' · ') }] : []),
        ...(documentRefs.length ? [{ label: c.documents, value: documentRefs.map(d => d.label).join('\n') }] : []),
      ]}>
        <p>{c.directNext}</p>
        <p className="mt-2 text-[var(--lp-text-sub)]">{c.currencyNote}</p>
      </CreationReview> : null}

      {/* SUBMIT */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--lp-border-light)]">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'group inline-flex items-center gap-2 px-[22px] py-[13px] text-[14px] font-semibold',
            'transition-[transform,box-shadow] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
            !canSubmit
              ? 'bg-[var(--lp-light)] text-[var(--lp-text-muted)] cursor-not-allowed border border-[var(--lp-border-light)]'
              : 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_0_rgba(0,0,0,0.22)] hover:shadow-[0_5px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)]',
          )}
          style={{
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {submitting && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              className="animate-spin"
              aria-hidden
            >
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? dd.submit.opening : reviewing ? c.confirmDirect : c.review}
          {!submitting && (
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          )}
        </button>
        {!submitting && !reviewing && (
          <p className="text-[14px] leading-6 text-[var(--lp-text-sub)]">
            {canSubmit ? c.directNext : c.required}
          </p>
        )}
      </div>

      {error && (
        <p className="mono text-[12px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]">
          {error}
        </p>
      )}

    </form>
  );
}

function FieldSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--lp-dark)]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function FormLabel({
  label,
  unit,
  hint,
  children,
}: {
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 justify-between">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--lp-dark)]">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
        {unit && (
          <span className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]/70">
            {unit}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function DeadlineUnitPicker({
  value,
  disabled,
  onChange,
  ariaLabel,
  labels,
}: {
  value: 'min' | 'hr' | 'd';
  disabled?: boolean;
  onChange: (next: 'min' | 'hr' | 'd') => void;
  ariaLabel: string;
  labels: Messages['directDeal']['unitPickerLabels'];
}) {
  const options: Array<{ key: 'min' | 'hr' | 'd'; label: string }> = [
    { key: 'min', label: labels.min },
    { key: 'hr', label: labels.hr },
    { key: 'd', label: labels.day },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 p-0.5 shrink-0"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 9,
        borderTopRightRadius: 9,
        borderBottomLeftRadius: 9,
        borderBottomRightRadius: 2,
      }}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className="min-h-11 min-w-11 px-2.5 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: active ? 'var(--lp-control-active-bg)' : 'transparent',
              color: active ? 'var(--lp-control-active-ink)' : 'var(--lp-text-sub)',
              borderTopLeftRadius: 7,
              borderTopRightRadius: 7,
              borderBottomLeftRadius: 7,
              borderBottomRightRadius: 2,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
