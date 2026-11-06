'use client';
import { MoneyInput, type MoneyInputHandle } from '@/features/money/components/MoneyInput';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLiveFeatures } from '@/shared/hooks/useLiveFeatures';
import { KindPicker } from './KindPicker';
import { kindChoices, preselectedKind, type KindChoice, workKindHref } from '../kindChoices';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { api, ApiError, type Partner, type TrustView } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { cn } from '@/shared/utils/cn';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { TermsBuilder, TermsBlockerNote, DEFAULT_TERMS, chip, chipOn, chipOff } from '../terms/TermsBuilder';
import { durationText } from '../durationText';
import { composeTerms, termsIssues, type TermsDraft } from '../terms/composeTerms';
import { TERMS_COPY } from '../terms/termsCopy';
import { DueChips } from './DueChips';
import { CreationReview } from './CreationReview';
import { AttachField } from '@/features/attachments/AttachField';
import type { PickedAttachment } from '@/features/attachments/attachments';
import { attachCopy } from '@/shared/i18n/messages/attachCopy';
import { FoldRow } from './FoldRow';
import { Button } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { validAmount, validWhole } from '../creationValidation';
import { primeCreatedDirectDeal } from '../creationHandoff';
import { splitDeadline } from '../deadlineSplit';
import { lookupContact, parseContact, type ContactMatch } from '../counterpartyInput';
import { fill } from '../workspace/presentation';
import { useReportDealAmount } from '@/features/balances/dealAmount';
import { AcceptWithin, formatWindow } from './AcceptWithin';
import { protectionLines } from '../protection';
import { EmailSuggestion } from '@/shared/components/EmailSuggestion';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

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
const SECTORS_DD = [
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
] as const;
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
  const mt = useMoneyText({ compact: true });
  const t = useTranslations();
  const tt = t.tradeTerms;
  const wf = t.work.dealForm;
  const sectorLabels = t.smeCompany.sectors;
  const dd = t.directDeal;
  const c = t.dealCreation;
  const rs = c.requestSteps;
  const rf = t.requestFlow;
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
  const priceField = useRef<MoneyInputHandle>(null);
  useReportDealAmount(typeof amount === 'number' ? amount : null);
  const [deadlineValue, setDeadlineValue] = useState<number | ''>('');
  const [deadlineUnit, setDeadlineUnit] = useState<'min' | 'hr' | 'd'>('d');
  /// Seller has this long to accept before the deal auto-expires (pre-accept,
  /// no rep hit). Buyer picks a preset; 24h is the human default.
  const [acceptanceHours, setAcceptanceHours] = useState<number>(24);
  // One screen (view 48, 9b). One payment for what is delivered, unless Pay
  // in parts is opened for milestones.
  const [delivered, setDelivered] = useState(initialTerms.trim());
  const [inParts, setInParts] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
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
          if (draft.parts.length > 1) setInParts(true);
          else setDelivered(draft.parts[0]?.what ?? '');
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
  const [goodsWay, setGoodsWay] = useState<'shipped' | 'in_person'>('shipped');
  // How do you want to pay? comes first unless a link or a listing already says (view 44, K1).
  const [kind, setKind] = useState<KindChoice | null>(() => preselectedKind({ kind: search.get('kind') }) ?? (search.get('listing') ? 'one' : null));
  function applyKind(next: KindChoice) {
    if (next === 'shipped' || next === 'in_person') {
      setTradeType('goods');
      setGoodsWay(next === 'in_person' ? 'in_person' : 'shipped');
    }
    if (next === 'stages') {
      setInParts(true);
      setTerms((current) => ({ ...current, parts: [{ pct: 50, what: current.parts[0]?.what ?? '' }, { pct: 50, what: '' }] }));
    }
  }
  useEffect(() => {
    if (kind) applyKind(kind);
    // Once, for a kind the link asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // By the hour opens the hourly form with the person and what was typed (view 32),
  // and shows only where hourly work runs.
  const { hourlyWork } = useLiveFeatures();
  const byTheHourHref = (() => {
    const q = new URLSearchParams();
    if (contactMatch?.tag) q.set('to', `@${contactMatch.tag}`);
    else if (counterparty.trim().startsWith('@')) q.set('to', counterparty.trim());
    return `/work/new${q.size ? `?${q}` : ''}`;
  })();

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
  const dealTerms: TermsDraft = inParts ? terms : { ...terms, parts: [{ pct: 100, what: delivered.trim().slice(0, 240) }] };
  const termsValid = termsIssues(dealTerms).length === 0;

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
  const agreementText = composeTerms(dealTerms, { priceUsdc: amountValid ? (amount as number) : null, dueLabel }, TERMS_COPY[locale].text);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address || inFlight.current) return;
    if (!reviewing) {
      // View 56: what was agreed, in words, becomes the parts the contract
      // protects. A draft that fails or finds one part keeps one payment.
      if (!inParts && delivered.trim()) {
        setPreparing(true);
        try {
          const { draft } = await api.dealDraft(delivered.trim());
          if (draft.parts.length > 1) {
            setTerms((current) => ({ ...current, parts: draft.parts }));
            setInParts(true);
            setDrafted(true);
          }
        } catch {
          /* one payment, as before */
        } finally {
          setPreparing(false);
        }
      }
      setReviewing(true);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      // The price as typed in the buyer's currency is kept with the deal (view 55).
      const quote = await priceField.current?.quote();
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
        dealAmountUsdc: quote?.usdc ?? (amount as number),
        ...(quote ? { quote: quote.token } : {}),
        deadlineDays: submitDays,
        deadlineHours: submitHours,
        acceptanceWindowHours: acceptanceHours,
        terms: agreementText,
        firstReleasePct: dealTerms.parts[0].pct,
        milestonePcts: dealTerms.parts.map((part) => part.pct),
        reviewWindowDays: terms.reviewWindowDays,
        requireStake,
        requireStakePct: requireStake ? requireStakePct : undefined,
        tradeType: tradeType !== 'service' ? tradeType : undefined,
        goodsWay: tradeType !== 'service' ? goodsWay : undefined,
        incoterms: isBusiness && tradeType !== 'service' && incoterms ? incoterms : undefined,
        paymentTerms: isBusiness && tradeType !== 'service' ? paymentTerms : undefined,
        counterpartyCompany: isBusiness && tradeType !== 'service' ? counterpartyCompany : undefined,
        documentRefs: documentRefs.length > 0 ? documentRefs : undefined,
        attachments: attachments.length > 0 ? attachments.map(({ name, dataUrl }) => ({ name, dataUrl })) : undefined,
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
      <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">{dd.notConnected}</p>
    );
  }

  if (!kind) {
    return (
      <KindPicker
        choices={kindChoices({ hourlyWork, withPerson: !!initialSeller })}
        withWho={initialSeller ? `@${initialSeller.replace(/^@/, '')}` : undefined}
        onPick={(next) => {
          if (next === 'hourly' || next === 'monthly') return router.push(workKindHref(next, counterparty));
          if (next === 'contest') return router.push('/contests/new');
          applyKind(next);
          setKind(next);
        }}
      />
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-7">
      <fieldset hidden={reviewing} disabled={submitting || reviewing} className="space-y-6 min-w-0">
      {/* One screen (Figma, Batch 9 · Start a deal): who, what, how much and
          by when, then the settings most people leave as they are. */}
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
          {contact.kind === 'email' && <p className="mt-2 text-[14px] text-[var(--lp-dark)]">{fill(dd.counterparty.emailFound, { email: contact.email })}</p>}
          {sellerAddress && !sameWallet && <p className="mt-2 text-[14px] text-[var(--lp-dark)]">{fill(dd.counterparty.addressFound, { short: shortAddress(sellerAddress) })}</p>}
          {sameWallet && <span className="mono text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">{dd.counterparty.walletSelfWarning}</span>}
          {partner && (
            <div
              className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5"
              style={{
                background: 'var(--lp-light)',
                border: '1px solid var(--lp-border-light)',
                borderRadius: 10,
              }}
            >
              <span className="text-[14px] font-semibold text-[var(--lp-dark)]">
                {partner.name}
              </span>
              {partner.verified && (
                <span
                  className="inline-flex items-center gap-1 text-[14px] font-semibold px-1.5 py-0.5"
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
                  {tt.verified}
                </span>
              )}
              {(partner.sector || partner.region) && (
                <span className="text-[14px] text-[var(--lp-text-muted)]">
                  {[partner.sector, partner.region].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          )}
          {contact.kind === 'tag' && contactState === 'looking' && (
            <span className="mono text-[14px] text-[var(--lp-text-muted)] mt-1.5 inline-block">
              {fill(dd.counterparty.contactLooking, { tag: contact.tag })}
            </span>
          )}
          {contactMatch && (
            <p className="mt-2 text-[14px] text-[var(--lp-dark)]">
              {contactMatch.kind === 'karwan'
                ? fill(dd.counterparty.contactKarwan, { name: contactMatch.displayName, tag: contactMatch.tag })
                : fill(dd.counterparty.contactPaytag, { tag: contactMatch.tag, masked: contactMatch.maskedAddress })}
            </p>
          )}
          {contact.kind === 'tag' && contactState === 'missing' && (
            <span className="mono text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
              {fill(paytagAllowed ? dd.counterparty.contactNotFoundPaytag : dd.counterparty.contactNotFound, { tag: contact.tag })}
            </span>
          )}
          {contactState === 'self' && <span className="mono text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">{dd.counterparty.contactSelf}</span>}
          {contactState === 'error' && <span className="mono text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">{dd.counterparty.contactError}</span>}
          {contact.kind === 'invalid' && counterparty.trim().length > 3 && !(/^0x[a-f0-9]*$/i.test(counterparty.trim()) && counterparty.trim().length < 42) && (
            <span className="mono text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))] mt-1.5 inline-block">
              {/^0x/i.test(counterparty.trim()) ? dd.counterparty.walletInvalid : dd.counterparty.contactInvalid}
            </span>
          )}
        </FormLabel>

      {inParts ? null : (
        <FormLabel label={t.editDealModal.deliverLabel}>
          <textarea
            value={delivered}
            rows={3}
            maxLength={240}
            disabled={submitting}
            onChange={(e) => setDelivered(e.target.value)}
            className="form-input form-textarea"
          />
        </FormLabel>
      )}

      <AttachField on="deal" value={attachments} onChange={setAttachments} disabled={submitting} />

      <div className="space-y-2">
        <p className="text-[14px] font-medium text-[var(--ink)]">{wf.whatItIs}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={wf.whatItIs}>
          {(['service', 'goods'] as const).map((opt) => {
            const on = opt === 'service' ? tradeType === 'service' : tradeType !== 'service';
            return (
              <button key={opt} type="button" aria-pressed={on} disabled={submitting}
                onClick={() => setTradeType(opt === 'service' ? 'service' : tradeType === 'mixed' ? 'mixed' : 'goods')}
                className={cn(chip, on ? chipOn : chipOff)}>
                {opt === 'service' ? wf.service : wf.goods}
              </button>
            );
          })}
        </div>
        {tradeType !== 'service' ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={wf.goods}>
            {(['shipped', 'in_person'] as const).map((way) => (
              <button key={way} type="button" aria-pressed={goodsWay === way} disabled={submitting} onClick={() => setGoodsWay(way)}
                className={cn(chip, goodsWay === way ? chipOn : chipOff)}>
                {way === 'shipped' ? wf.shipped : wf.inPerson}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{wf.howYouPay}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={wf.howYouPay}>
              <button type="button" aria-pressed disabled={submitting} className={cn(chip, chipOn)}>{wf.fixed}</button>
              {hourlyWork ? <Link href={byTheHourHref} className={cn(chip, chipOff, 'inline-flex items-center')}>{wf.byTheHour}</Link> : null}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <FormLabel label={dd.terms.amountLabel}>
            <MoneyInput value={amount} disabled={submitting} onChange={(usdc) => setAmount(usdc ?? '')} handle={priceField} />
          </FormLabel>
        <div>
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--lp-dark)]">
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
          {deadlineValue === '' ? <p className="text-[14px] leading-6 text-[var(--lp-text-sub)] font-medium">{c.noDeadline}</p> : null}
        </div>
      </div>

      <div className={cn(CARD_CLASS, 'divide-y divide-[var(--line)] overflow-hidden')}>
        {inParts ? (
        <FoldRow
          label={rf.payInParts}
          fact={inParts ? terms.parts.map((part) => `${part.pct}%`).join(' / ') : t.offerFlow.onePayment}
          open={inParts}
          onToggle={(open) => {
            setInParts(open);
            if (open && !terms.parts[0]?.what.trim() && delivered.trim()) {
              setTerms((current) => ({ ...current, parts: current.parts.map((part, i) => (i === 0 ? { ...part, what: delivered.trim() } : part)) }));
            }
          }}
          payInParts
        >
          <TermsBuilder
            value={terms}
            onChange={setTerms}
            priceUsdc={amountValid ? (amount as number) : null}
            dueLabel={dueLabel}
            disabled={submitting}
          />
        </FoldRow>
        ) : null}
        <FoldRow
          label={dd.terms.acceptanceWindowLabel}
          fact={formatWindow(acceptanceHours, t.postJob.unitPickerLabels)}
          open={acceptOpen}
          onToggle={setAcceptOpen}
        >
          <div role="group" aria-label={dd.terms.acceptanceWindowLabel} className="space-y-2">
            <p className="text-[14px] text-[var(--ink-secondary)]">{dd.terms.acceptanceWindowHint}</p>
            <AcceptWithin hours={acceptanceHours} onChange={setAcceptanceHours} disabled={submitting} />
          </div>
        </FoldRow>
      </div>

      {/* TRADE CONTEXT. Business-only surface on the SME Trades rail. Hidden
          for individuals so a P2P direct deal stays the simple service flow. */}
      {SME_TRADES_ENABLED && isBusiness && (
      <FieldSection title={tt.sectionTitle}>
        {tradeType !== 'service' ? (
        <FormLabel label={tt.tradeType}>
          <div className="flex gap-2 flex-wrap">
            {(['goods', 'mixed'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={submitting}
                onClick={() => setTradeType(opt)}
                className={cn(chip, tradeType === opt ? chipOn : chipOff)}
              >
                {tt.types[opt]}
              </button>
            ))}
          </div>
        </FormLabel>
        ) : null}
        {tradeType !== 'service' ? (
          <>
            <FormLabel label={tt.incoterms} hint={tt.incotermsHint}>
              <div className="flex gap-2 flex-wrap">
                {INCOTERM_CODES_DD.map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={submitting}
                    onClick={() => setIncoterms(code)}
                    className={cn(chip, incoterms === code ? chipOn : chipOff)}
                  >
                    {code}
                  </button>
                ))}
              </div>
              {incoterms ? <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{incoterms}: {tt.incotermGloss[incoterms]}</p> : null}
            </FormLabel>
            <FormLabel label={tt.paymentTerms} hint={tt.paymentTermsHint}>
              <div className="flex gap-2 flex-wrap">
                {PAYMENT_TERM_CODES_DD.map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={submitting}
                    onClick={() => setPaymentTerms(code)}
                    className={cn(chip, paymentTerms === code ? chipOn : chipOff)}
                  >
                    {tt.paymentTermLabels[code]}
                  </button>
                ))}
              </div>
            </FormLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormLabel label={tt.theirCompany}>
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
              <FormLabel label={tt.theirSector}>
                <div className="flex flex-wrap gap-2">
                  {SECTORS_DD.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={submitting}
                      aria-pressed={companySector === s}
                      onClick={() => setCompanySector(companySector === s ? '' : s)}
                      className={cn(chip, companySector === s ? chipOn : chipOff)}
                    >
                      {sectorLabels[s]}
                    </button>
                  ))}
                </div>
              </FormLabel>
              <FormLabel label={tt.theirRegion}>
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
              hint={tt.documentsHint}
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
              
              {documentRefs.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {documentRefs.map((d) => (
                    <li
                      key={d.hash}
                      className="flex items-center gap-3 px-3 py-2 border border-[var(--lp-field-border)] bg-[var(--lp-bg)]"
                      style={{
                        borderRadius: 6,
                      }}
                    >
                      <span className="shrink-0 rounded-full bg-[var(--lp-light)] px-2.5 py-0.5 text-[14px] font-semibold text-[var(--lp-dark)]">
                        {DOC_KIND_LABEL_DD[d.kind]}
                      </span>
                      <span className="flex-1 truncate text-[14px] text-[var(--lp-dark)]">
                        {d.label}
                      </span>
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
        { label: dd.terms.amountLabel, value: mt.text(amount) },
        { label: dd.terms.deadlineLabel, value: deadlineValue === '' ? c.noDeadline : durationText({ days: submitDays, hours: submitHours }, { day: TERMS_COPY[locale].day, days: TERMS_COPY[locale].days, hr: dd.preview.unitHr, min: dd.preview.unitMin }) },
        { label: c.payment, value: dealTerms.parts.length > 1 ? dealTerms.parts.map((part) => rf.partLine.replace('{pct}', String(part.pct)).replace('{what}', part.what)).join('\n') : '100%' },
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
        ...(attachments.length ? [{ label: attachCopy[locale].reviewRow, value: attachments.map((a) => a.name).join('\n') }] : []),
      ]}>
        {drafted ? <p data-drafted className="mb-2 text-[var(--ink-secondary)]">{rf.drafted}</p> : null}
        <p>{c.directNext}</p>
        <p className="mt-2 text-[var(--lp-text-sub)]">{c.currencyNote}</p>
      </CreationReview> : null}

      {/* SUBMIT: Review, checked once more, then sent (Figma, Batch 9 · Review deal). */}
      <div className="space-y-3 border-t border-[var(--line)] pt-5">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          loading={submitting || preparing}
          loadingLabel={dd.submit.opening}
          className="w-full sm:w-auto"
        >
          {reviewing ? fill(rs.sendTo, { name: recipient }) : c.review}
        </Button>
        {!submitting && !reviewing && (
          // Milestone notes only make sense once Pay in parts is open.
          termsValid || canSubmit || !inParts ? (
            <p className="text-[14px] leading-6 text-[var(--ink-secondary)] font-medium">
              {canSubmit ? c.directNext : c.required}
            </p>
          ) : (
            <TermsBlockerNote terms={dealTerms} />
          )
        )}
      </div>

      {error && (
        <p className="mono text-[14px] text-[color-mix(in_srgb,var(--lp-dark)_75%,var(--neg))]">
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
        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--lp-dark)]">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
        {unit && (
          <span className="text-[14px] text-[var(--lp-text-muted)]/70">
            {unit}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
