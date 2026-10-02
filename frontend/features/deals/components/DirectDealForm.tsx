'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { api, ApiError, type Partner, type TrustView } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { cn } from '@/shared/utils/cn';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { TermsBuilder, DEFAULT_TERMS } from '../terms/TermsBuilder';
import { cleanLines, composeTerms, termsIssues, type TermsDraft } from '../terms/composeTerms';
import { TERMS_COPY } from '../terms/termsCopy';
import { DueChips } from './DueChips';
import { CreationReview } from './CreationReview';
import { validAmount, validWhole } from '../creationValidation';
import { primeCreatedDirectDeal } from '../creationHandoff';
import { splitDeadline } from '../deadlineSplit';
import { lookupContact, parseContact, type ContactMatch } from '../counterpartyInput';
import { fill } from '../workspace/presentation';
import { useReportDealAmount } from '@/features/balances/dealAmount';
import { AcceptWithin, formatWindow } from './AcceptWithin';
import { protectionLines } from '../protection';
import { EmailSuggestion } from '@/shared/components/EmailSuggestion';

const MAX_DEADLINE_DAYS = 180;
const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
/// Paytag rollout flag. Must match the backend's PAYTAG_ENABLED; when the backend
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
  const rs = c.requestSteps;
  const { locale } = useLocale();
  const [reviewing, setReviewing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const queryClient = useQueryClient();
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

  // One box takes an email, a Karwan tag, a Paytag or a wallet address.
  const [counterparty, setCounterparty] = useState(initialSeller || (search.get('sellerEmail') ?? ''));
  /// Trusted-match opt-in. When true, the seller's accept panel will surface a
  /// stake requirement. Default off, most casual deals don't need it.
  const [requireStake, setRequireStake] = useState(false);
  /// Stake percentage when requireStake is on. Slider 50..100 in 5% steps,
  /// default 50%. Translates to on-chain reservationBps = pct * 100.
  const [requireStakePct, setRequireStakePct] = useState(50);
  /// Explicit opt-in for the Chainlink CRE delivery-evidence lane. Ordinary
  /// deals remain lightweight; selecting this records the requirement in the
  /// agreement before either party accepts it.
  // Numeric fields always start empty; the placeholder "0" renders instead
  // of any autofilled number. The only exception is when the user arrives
  // from a listing's "Make offer" deep link with ?amount= in the URL, which
  // pre-fills from the listing's asking price; otherwise it stays blank.
  const [amount, setAmount] = useState<number | ''>(initialAmount ?? '');
  useReportDealAmount(typeof amount === 'number' ? amount : null);
  const [deadlineValue, setDeadlineValue] = useState<number | ''>('');
  const [deadlineUnit, setDeadlineUnit] = useState<'min' | 'hr' | 'd'>('d');
  /// Seller has this long to accept before the deal auto-expires (pre-accept,
  /// no rep hit). Buyer picks a preset; 24h is the human default.
  const [acceptanceHours, setAcceptanceHours] = useState<number>(24);
  // Asked in three short steps: who, price and time, then the terms.
  const [step, setStep] = useState<0 | 1 | 2>(0);
  // The agreement as checkable parts. Direct deals fund in two parts today.
  const [terms, setTerms] = useState<TermsDraft>(() =>
    initialTerms.trim()
      ? { ...DEFAULT_TERMS, parts: [{ pct: 100, what: initialTerms.trim() }] }
      : DEFAULT_TERMS,
  );
  // Opened from an offer: start from the terms the seller published and their
  // ready-in time.
  const listingId = search.get('listing');
  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    api.getListing(listingId)
      .then(({ listing }) => {
        if (cancelled) return;
        const draft = listing.termsDraft;
        if (draft) {
          setTerms({
            conditions: draft.conditions.length ? draft.conditions : [''],
            proof: draft.proof,
            parts: draft.parts.map((part) => ({ pct: part.pct, what: part.what ?? (part.covers?.kind === 'item' ? part.covers.item : '') })),
            reviewWindowDays: draft.reviewWindowDays,
          });
        }
        if (listing.readyInDays) {
          setDeadlineValue(listing.readyInDays);
          setDeadlineUnit('d');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listingId]);
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

  const contact = parseContact(counterparty);
  const sellerAddress = contact.kind === 'address' ? contact.address : null;
  const sameWallet = !!sellerAddress && !!address && sellerAddress.toLowerCase() === address.toLowerCase();

  /// The second box takes an email, a Karwan tag or a Paytag. A tag is looked
  /// up as a Karwan tag first, then as a Paytag. Paytag is P2P only, so it is
  /// not offered when this deal would land in the finance lane (a business
  /// trading goods/mixed): a handle anyone can claim must not decide where
  /// credit moves. A Karwan tag is an account, so it is allowed everywhere.
  const paytagAllowed = PAYTAG_ENABLED && !(isBusiness && tradeType !== 'service');
  const [contactMatch, setContactMatch] = useState<ContactMatch | null>(null);
  const [contactState, setContactState] = useState<'idle' | 'looking' | 'missing' | 'self' | 'error'>('idle');

  // Debounced so the lookup fires when they stop typing, not per keystroke.
  const tagQuery = contact.kind === 'tag' ? contact : null;
  const tagKey = tagQuery ? `${tagQuery.tag}:${paytagAllowed}` : null;
  useEffect(() => {
    if (!tagQuery) {
      setContactMatch(null);
      setContactState('idle');
      return;
    }
    let live = true;
    setContactMatch(null);
    setContactState('looking');
    const t = setTimeout(() => {
      lookupContact(tagQuery, { paytagAllowed, karwan: api.resolveKarwanTag, paytag: api.resolvePaytag }).then(
        (result) => {
          if (!live) return;
          if (result === 'self') setContactState('self');
          else if (result) {
            setContactMatch(result);
            setContactState('idle');
          } else setContactState('missing');
        },
        () => {
          if (live) setContactState('error');
        },
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // tagKey carries the tag and whether Paytag is allowed.
  }, [tagKey]);

  // Look the counterparty up once per address. Seeding overwrites the company
  // fields because the partner's own card is more authoritative than anything
  // the buyer would type about them; edits after the lookup stick, since the
  // effect only re-runs when the address itself changes.
  const seededFor = useRef<string | null>(null);
  const lookupAddr = isBusiness && sellerAddress && !sameWallet ? sellerAddress.toLowerCase() : null;
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
  const counterpartyValid = (!!sellerAddress && !sameWallet) || contact.kind === 'email' || !!contactMatch;
  const amountValid = validAmount(amount);
  // Single-input deadline with a min/hr/day unit toggle. Bounds per unit
  // mirror the buyer brief form so behaviour is identical across surfaces.
  // Empty value = open-ended (no delivery deadline, no unilateral cancel for
  // the buyer; seller has no time pressure).
  const deadlineMax =
    deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : MAX_DEADLINE_DAYS;
  const deadlineValid =
    deadlineValue === '' ||
    validWhole(deadlineValue, 1, deadlineMax);
  const termsValid = termsIssues(terms).length === 0;

  const canSubmit =
    isConnected &&
    counterpartyValid &&
    amountValid &&
    deadlineValid &&
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
  const { days: submitDays, hours: submitHours } = splitDeadline(totalSeconds);
  const dueLabel =
    totalSeconds > 0
      ? new Date(Date.now() + totalSeconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : null;
  const agreementText = composeTerms(terms, { priceUsdc: amountValid ? (amount as number) : null, dueLabel }, TERMS_COPY[locale].text);
  const recipient =
    contactMatch?.kind === 'karwan'
      ? contactMatch.displayName
      : contactMatch?.kind === 'paytag'
        ? `@${contactMatch.tag}`
        : contact.kind === 'email'
          ? contact.email
          : sellerAddress
            ? shortAddress(sellerAddress)
            : '';
  const stepReady = step === 0 ? counterpartyValid : step === 1 ? amountValid && deadlineValid : termsValid;

  // What the trust engine will ask on this deal, shown on review instead of switches.
  const [protection, setProtection] = useState<TrustView | undefined>(undefined);
  const knownSeller = contactMatch?.kind === 'karwan' ? contactMatch.address : sellerAddress ?? undefined;
  useEffect(() => {
    if (!reviewing || !address || !amountValid) return;
    let live = true;
    api.directDealProtection({ buyerAddress: address, sellerAddress: knownSeller, dealAmountUsdc: amount as number, terms: agreementText })
      .then((result) => { if (live) setProtection(result.protection); })
      .catch(() => { if (live) setProtection(undefined); });
    return () => { live = false; };
  }, [reviewing, address, knownSeller, amount, amountValid, agreementText]);

  function goForward() {
    if (step < 2) setStep((step + 1) as 1 | 2);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 2) {
      if (stepReady) goForward();
      return;
    }
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
        ...(sellerAddress
          ? { sellerAddress }
          : contactMatch?.kind === 'karwan'
            ? { sellerAddress: contactMatch.address }
            : contactMatch?.kind === 'paytag'
              ? { sellerPaytag: contactMatch.tag }
              : { sellerEmail: counterparty.trim().toLowerCase() }),
        dealAmountUsdc: amount as number,
        deadlineDays: submitDays,
        deadlineHours: submitHours,
        acceptanceWindowHours: acceptanceHours,
        terms: agreementText,
        firstReleasePct: terms.parts[0].pct,
        milestonePcts: terms.parts.map((part) => part.pct),
        reviewWindowDays: terms.reviewWindowDays,
        requireStake,
        requireStakePct: requireStake ? requireStakePct : undefined,
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
      // The create response is already a confirmed, durable deal. Prime both
      // viewer-scoped caches before navigation so the deal page renders that
      // snapshot immediately while its normal background read reconciles.
      primeCreatedDirectDeal(queryClient, r.deal, address);
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
      <div className="flex items-center gap-3" aria-live="polite">
        <span aria-hidden className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                'block h-2 rounded-full transition-all duration-[var(--dur-small)]',
                i === step ? 'w-6 bg-[var(--lp-dark)]' : i < step ? 'w-2 bg-[var(--lp-accent)]' : 'w-2 bg-[var(--lp-border-light)]',
              )}
            />
          ))}
        </span>
        <span className="text-[13px] font-semibold text-[var(--lp-text-sub)]">
          {rs.stepOf.replace('{n}', String(step + 1))} · {[rs.seller, rs.price, rs.payment][step]}
        </span>
      </div>

      <div hidden={step !== 0} className="space-y-6">
      <FieldSection title={c.seller}>
        <FormLabel label={dd.counterparty.oneBoxLabel} hint={dd.counterparty.contactHint}>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder={dd.counterparty.oneBoxPlaceholder}
            disabled={submitting}
            className="form-input"
          />
          {contact.kind === 'email' && <EmailSuggestion email={counterparty} onApply={setCounterparty} className="mt-1.5" />}
          {contact.kind === 'email' && <p className="mt-2 text-[13px] text-[var(--lp-dark)]">{fill(dd.counterparty.emailFound, { email: contact.email })}</p>}
          {sellerAddress && !sameWallet && <p className="mt-2 text-[13px] text-[var(--lp-dark)]">{fill(dd.counterparty.addressFound, { short: shortAddress(sellerAddress) })}</p>}
          {sameWallet && <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">{dd.counterparty.walletSelfWarning}</span>}
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
          {contact.kind === 'tag' && contactState === 'looking' && (
            <span className="mono text-[11px] text-[var(--lp-text-muted)] mt-1.5 inline-block">
              {fill(dd.counterparty.contactLooking, { tag: contact.tag })}
            </span>
          )}
          {contactMatch && (
            <p className="mt-2 text-[13px] text-[var(--lp-dark)]">
              {contactMatch.kind === 'karwan'
                ? fill(dd.counterparty.contactKarwan, { name: contactMatch.displayName, tag: contactMatch.tag })
                : fill(dd.counterparty.contactPaytag, { tag: contactMatch.tag, masked: contactMatch.maskedAddress })}
            </p>
          )}
          {contact.kind === 'tag' && contactState === 'missing' && (
            <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
              {fill(paytagAllowed ? dd.counterparty.contactNotFoundPaytag : dd.counterparty.contactNotFound, { tag: contact.tag })}
            </span>
          )}
          {contactState === 'self' && <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">{dd.counterparty.contactSelf}</span>}
          {contactState === 'error' && <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">{dd.counterparty.contactError}</span>}
          {contact.kind === 'invalid' && counterparty.trim().length > 3 && !(/^0x[a-f0-9]*$/i.test(counterparty.trim()) && counterparty.trim().length < 42) && (
            <span className="mono text-[11px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
              {/^0x/i.test(counterparty.trim()) ? dd.counterparty.walletInvalid : dd.counterparty.contactInvalid}
            </span>
          )}
        </FormLabel>
      </FieldSection>
      </div>

      <div hidden={step !== 1} className="space-y-6">
      <FieldSection title={c.priceDeadline}>
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
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--lp-dark)]">
            {dd.terms.deadlineLabel}
            <Hint>{dd.terms.deadlineHint}</Hint>
          </p>
          <DueChips
            optional
            value={deadlineValue}
            unit={deadlineUnit}
            maxDays={MAX_DEADLINE_DAYS}
            disabled={submitting}
            onChange={(value, unit) => {
              setDeadlineValue(value);
              setDeadlineUnit(unit);
            }}
          />
        </div>
        {deadlineValue === '' ? <p className="text-[14px] leading-6 text-[var(--lp-text-sub)]">{c.noDeadline}</p> : null}
      </FieldSection>
      </div>

      <div hidden={step !== 2} className="space-y-6">
      <TermsBuilder
        value={terms}
        onChange={setTerms}
        priceUsdc={amountValid ? (amount as number) : null}
        dueLabel={dueLabel}
        disabled={submitting}
      />

      {/* TRADE CONTEXT. Business-only surface on the SME Trades rail. Hidden
          for individuals so a P2P direct deal stays the simple service flow. */}
      {SME_TRADES_ENABLED && isBusiness && (
      <FieldSection title={tt.sectionTitle}>
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
          <div role="group" aria-label={dd.terms.acceptanceWindowLabel} className="space-y-2">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
              {dd.terms.acceptanceWindowLabel}
              <Hint>{dd.terms.acceptanceWindowHint}</Hint>
            </p>
            <AcceptWithin hours={acceptanceHours} onChange={setAcceptanceHours} disabled={submitting} />
          </div>

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
        />
        <div className="min-w-0">
          <span
            className="text-[14px] font-semibold inline-flex items-center gap-1.5"
            style={{ color: 'var(--lp-dark)' }}
          >
            {c.security}
            <Hint>{dd.trustedMatch.body}</Hint>
          </span>
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
        </div>
      </details>
      </div>
      </fieldset>

      {reviewing ? <CreationReview busy={submitting} onEdit={() => {
        setReviewing(false);
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus());
      }} rows={[
        {
          label: c.seller,
          value:
            contactMatch?.kind === 'karwan'
              ? `${contactMatch.displayName} · @${contactMatch.tag}`
              : contactMatch?.kind === 'paytag'
                ? `@${contactMatch.tag}`
                : sellerAddress ?? counterparty.trim(),
        },
        { label: dd.terms.amountLabel, value: `${amount} USDC` },
        { label: dd.terms.deadlineLabel, value: deadlineValue === '' ? c.noDeadline : `${submitDays * 24 + submitHours} ${dd.preview.unitHr}` },
        { label: c.payment, value: terms.parts.map((part) => `${part.pct}%`).join(' / ') },
        ...(cleanLines(terms.conditions).length ? [{ label: TERMS_COPY[locale].conditions, value: cleanLines(terms.conditions).map((line) => `• ${line}`).join('\n') }] : []),
        { label: TERMS_COPY[locale].agreement, value: agreementText },
        { label: c.responseWindow, value: formatWindow(acceptanceHours, t.postJob.unitPickerLabels) },
        {
          label: t.dealWorkspace.protection.title,
          value: protectionLines(
            protection,
            'buyer',
            t.dealWorkspace.protection,
            requireStake || protection?.stakeRequired ? Math.max(requireStake ? requireStakePct : 0, protection?.stakeRequired ? 50 : 0) : undefined,
          ).join('\n'),
        },
        ...(SME_TRADES_ENABLED && isBusiness && tradeType !== 'service' ? [{ label: c.extra, value: [tt.types[tradeType], incoterms, tt.paymentTermLabels[paymentTerms], companyName, companySector, companyRegion].filter(Boolean).join(' · ') }] : []),
        ...(documentRefs.length ? [{ label: c.documents, value: documentRefs.map(d => d.label).join('\n') }] : []),
      ]}>
        <p>{c.directNext}</p>
        <p className="mt-2 text-[var(--lp-text-sub)]">{c.currencyNote}</p>
      </CreationReview> : null}

      {/* SUBMIT */}
      {!reviewing ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as 0 | 1)}
              disabled={submitting}
              className="inline-flex min-h-12 items-center rounded-full px-4 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)]"
            >
              {rs.back}
            </button>
          ) : null}
          {step < 2 ? (
            <button
              type="button"
              onClick={goForward}
              disabled={!stepReady || submitting}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--lp-band-dark)] transition-colors hover:bg-[var(--lp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
            >
              {rs.continue}
            </button>
          ) : null}
        </div>
      ) : null}
      <div hidden={step < 2 && !reviewing} className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--lp-border-light)]">
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
          {submitting ? dd.submit.opening : reviewing ? fill(rs.sendTo, { name: recipient }) : c.review}
          {!submitting && <Icon name="send" size={16} directional />}
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
  title,
  children,
}: {
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
