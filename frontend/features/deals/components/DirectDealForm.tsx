'use client';
import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';
import { feeBreakdown } from '../config';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

// SME trade-finance constants. Hoisted per Vercel `rendering-hoist-jsx`.
type TradeType = 'service' | 'goods' | 'mixed';
type IncotermsCode = 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
type PaymentTermsCode = 'immediate' | 'net30' | 'net60' | 'net90';
type DocumentKind = 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';

const INCOTERMS_DD: ReadonlyArray<{ code: IncotermsCode; gloss: string }> = [
  { code: 'EXW', gloss: 'Buyer collects from factory.' },
  { code: 'FCA', gloss: 'Seller delivers to a named carrier.' },
  { code: 'FOB', gloss: 'Seller loads on the named vessel.' },
  { code: 'CIF', gloss: 'Seller pays freight + insurance to port.' },
  { code: 'DAP', gloss: 'Seller delivers; buyer clears customs.' },
  { code: 'DDP', gloss: 'Seller delivers + clears customs.' },
];
const PAYMENT_TERMS_DD: ReadonlyArray<{ code: PaymentTermsCode; label: string }> = [
  { code: 'immediate', label: 'IMMEDIATE' },
  { code: 'net30', label: 'NET 30' },
  { code: 'net60', label: 'NET 60' },
  { code: 'net90', label: 'NET 90' },
];
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
  const dd = t.directDeal;
  const router = useRouter();
  // Source of truth covers both wagmi web3 users and Circle passkey/email
  // users. Direct-deal create is backend-signed (the buyer agent DCW opens
  // escrow), so no actual wallet signature is needed here either way. The
  // form just needs the user's identity address.
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
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

  const [seller, setSeller] = useState(initialSeller);
  /// Counterparty mode. 'wallet' takes a 0x address (existing flow); 'email'
  /// takes an email and mints a one-shot shareable invite link instead. Funding
  /// stays parked until the recipient claims the link.
  const [counterpartyMode, setCounterpartyMode] = useState<'wallet' | 'email'>('wallet');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  /// Trusted-match opt-in. When true, the seller's accept panel will surface a
  /// stake requirement. Default off — most casual deals don't need it.
  const [requireStake, setRequireStake] = useState(false);
  /// Stake percentage when requireStake is on. Slider 50..100 in 5% steps,
  /// default 50%. Translates to on-chain reservationBps = pct * 100.
  const [requireStakePct, setRequireStakePct] = useState(50);
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

  const sellerValid = ADDR_RE.test(seller.trim());
  const sameWallet =
    sellerValid && address && seller.trim().toLowerCase() === address.toLowerCase();
  // Loose email pattern. Backend re-validates via zod.
  const emailValid =
    counterpartyEmail.trim().length > 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartyEmail.trim());
  const counterpartyValid =
    counterpartyMode === 'wallet' ? sellerValid && !sameWallet : emailValid;
  const amountValid = typeof amount === 'number' && amount > 0;
  // Single-input deadline with a min/hr/day unit toggle. Bounds per unit
  // mirror the buyer brief form so behaviour is identical across surfaces.
  // Empty value = open-ended (no delivery deadline, no unilateral cancel for
  // the buyer; seller has no time pressure).
  const deadlineMax =
    deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : 180;
  const deadlineValid =
    deadlineValue === '' ||
    (typeof deadlineValue === 'number' &&
      deadlineValue >= 1 &&
      deadlineValue <= deadlineMax);
  const pctValid = typeof firstPct === 'number' && firstPct >= 1 && firstPct <= 99;
  const termsValid = terms.trim().length > 0;

  const canSubmit =
    isConnected &&
    counterpartyValid &&
    amountValid &&
    deadlineValid &&
    pctValid &&
    termsValid &&
    !submitting;

  const fee = amountValid ? feeBreakdown(amount as number) : null;
  const previewAmount = typeof amount === 'number' ? amount : 0;
  const previewPct = typeof firstPct === 'number' ? firstPct : 0;
  const previewDeadlineValue = typeof deadlineValue === 'number' ? deadlineValue : 0;
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
    if (!canSubmit || !address) return;
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
          ? { sellerAddress: seller.trim() }
          : { sellerEmail: counterpartyEmail.trim().toLowerCase() }),
        dealAmountUsdc: amount as number,
        deadlineDays: submitDays,
        deadlineHours: submitHours,
        acceptanceWindowHours: acceptanceHours,
        terms: terms.trim(),
        firstReleasePct: firstPct as number,
        requireStake,
        requireStakePct: requireStake ? requireStakePct : undefined,
        tradeType: tradeType !== 'service' ? tradeType : undefined,
        incoterms: tradeType !== 'service' && incoterms ? incoterms : undefined,
        paymentTerms: tradeType !== 'service' ? paymentTerms : undefined,
        counterpartyCompany: tradeType !== 'service' ? counterpartyCompany : undefined,
        documentRefs: documentRefs.length > 0 ? documentRefs : undefined,
      });
      sfx.send();
      // Land on the deal page in both modes. The detail page surfaces
      // PendingInviteCopy when the deal has a pending email counterparty, so
      // the buyer sees the same copy-link affordance — but at a real URL they
      // can revisit and bookmark instead of a one-off form state. The
      // form-bound invite banner was easy to scroll past on a long-form page
      // so the buyer would tap Open Deal and never realise the link existed.
      router.push(`/deals/${r.deal.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.detail) setError(String(err.detail));
      else setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <p className="text-[13px] text-[var(--lp-text-sub)]">{dd.notConnected}</p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      {/* DEAL PREVIEW */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--lp-band-dark)',
          color: 'white',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-40 grid-drift"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 100% 0%, black, transparent 70%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 80% at 100% 0%, black, transparent 70%)',
          }}
        />
        <div className="relative px-6 py-6">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
            {dd.preview.eyebrow}
          </p>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="font-sans text-[clamp(2.5rem,6vw,3.75rem)] font-extrabold tabular-nums tracking-[-0.03em] leading-none">
              {previewAmount}
            </span>
            <span className="mono text-[12px] uppercase tracking-[0.12em] text-white/55">
              USDC
            </span>
            <span aria-hidden className="ms-2 mb-1 w-px h-7 bg-white/20" />
            <span className="font-sans text-[clamp(1.5rem,3.4vw,2rem)] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
              {previewDeadlineValue}
            </span>
            <span className="mono text-[12px] uppercase tracking-[0.12em] text-white/55">
              {previewUnitLabel}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] mono text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                data-instrument-blink
                className="w-[6px] h-[6px]"
                style={{
                  background: 'var(--lp-accent)',
                  animation: 'instrumentBlink 1.6s ease-in-out infinite',
                }}
              />
              {dd.preview.deliveryPctTemplate.replace('{n}', String(previewPct))}
            </span>
            <span aria-hidden className="w-px h-3 bg-white/20" />
            <span>
              {dd.preview.verificationPctTemplate.replace('{n}', String(100 - previewPct))}
            </span>
            <span aria-hidden className="w-px h-3 bg-white/20" />
            <span>{dd.preview.directEscrow}</span>
          </div>
        </div>
      </div>

      {/* COUNTERPARTY */}
      <FieldSection
        eyebrow={dd.counterparty.eyebrow}
        title={
          counterpartyMode === 'wallet'
            ? dd.counterparty.titleWallet
            : dd.counterparty.titleEmail
        }
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className="text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
            {counterpartyMode === 'wallet'
              ? dd.counterparty.helperWallet
              : dd.counterparty.helperEmail}
          </p>
          <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={counterpartyMode === 'email'}
              onChange={(e) => setCounterpartyMode(e.target.checked ? 'email' : 'wallet')}
              disabled={submitting}
              className="accent-[var(--lp-accent)]"
            />
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-sub)]">
              {dd.counterparty.sendByEmailLabel}
            </span>
          </label>
        </div>
        {counterpartyMode === 'wallet' ? (
          <FormLabel
            label={dd.counterparty.walletLabel}
            hint={dd.counterparty.walletHint}
          >
            <input
              type="text"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              placeholder={dd.counterparty.walletPlaceholder}
              disabled={submitting}
              className="form-input form-input-mono"
            />
            {seller.length > 0 && !sellerValid && (
              <span className="mono text-[11px] text-[#7a1f1a] mt-1.5 inline-block">
                {dd.counterparty.walletInvalid}
              </span>
            )}
            {sameWallet && (
              <span className="mono text-[11px] text-[#7a1f1a] mt-1.5 inline-block">
                {dd.counterparty.walletSelfWarning}
              </span>
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
              <span className="mono text-[11px] text-[#7a1f1a] mt-1.5 inline-block">
                {dd.counterparty.emailInvalid}
              </span>
            )}
          </FormLabel>
        )}
      </FieldSection>

      {/* TERMS */}
      <FieldSection eyebrow={dd.terms.eyebrow} title={dd.terms.title}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <FormLabel
            label={dd.terms.deliveryPctLabel}
            unit="%"
            hint={dd.terms.deliveryPctHint}
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
          <FormLabel
            label={dd.terms.acceptanceWindowLabel}
            hint={dd.terms.acceptanceWindowHint}
          >
            <div className="flex flex-wrap gap-1.5">
              {(
                [
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
                    className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: active ? 'var(--lp-dark)' : 'var(--lp-light)',
                      color: active ? 'var(--lp-light)' : 'var(--lp-text-sub)',
                      border: '1px solid var(--lp-border-light)',
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
        </div>
      </FieldSection>

      {/* DELIVERABLE */}
      <FieldSection eyebrow={dd.deliverable.eyebrow} title={dd.deliverable.title}>
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
                  ? 'e.g. Equipment install on site — includes shipping + commissioning.'
                  : dd.deliverable.termsPlaceholder
            }
            className="form-input form-textarea"
          />
        </FormLabel>
      </FieldSection>

      {/* TRADE CONTEXT */}
      <FieldSection eyebrow="[:TRADE CONTEXT:]" title="Goods or service">
        <FormLabel label="Trade type">
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
                    ? 'bg-[var(--lp-dark)] text-[var(--lp-bg)] border-[var(--lp-dark)]'
                    : 'bg-transparent text-[var(--lp-dark)] border-black/15 hover:border-black/40',
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
            <FormLabel label="Incoterms 2020" hint="The trade rule each side commits to.">
              <div className="flex gap-2 flex-wrap">
                {INCOTERMS_DD.map((it) => (
                  <button
                    key={it.code}
                    type="button"
                    disabled={submitting}
                    title={it.gloss}
                    onClick={() => setIncoterms(it.code)}
                    className={cn(
                      'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                      incoterms === it.code
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
                    {it.code}
                  </button>
                ))}
              </div>
            </FormLabel>
            <FormLabel label="Payment terms" hint="When the buyer pays after delivery.">
              <div className="flex gap-2 flex-wrap">
                {PAYMENT_TERMS_DD.map((pt) => (
                  <button
                    key={pt.code}
                    type="button"
                    disabled={submitting}
                    onClick={() => setPaymentTerms(pt.code)}
                    className={cn(
                      'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border transition-colors',
                      paymentTerms === pt.code
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
                    {pt.label}
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
                  placeholder="e.g. Acme Imports Ltd"
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
                  placeholder="e.g. Dubai, AE"
                  className="form-input"
                  maxLength={80}
                />
              </FormLabel>
            </div>
            <FormLabel
              label="Documents"
              hint="Hashes anchor on chain after the deal is accepted. Files stay on your device."
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
                      className="flex items-center gap-3 px-3 py-2 border border-black/10 bg-[var(--lp-bg)]"
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
                        aria-label="Remove document"
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

      {/* FUNDING BREAKDOWN */}
      {fee && (
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          <div className="px-5 py-4 border-b border-[var(--lp-border-light)]">
            <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
              {dd.funding.header}
            </p>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            <FeeLine label={dd.funding.youFundLabel} value={fee.fundedAmount} strong />
            <FeeLine label={dd.funding.sellerReceivesLabel} value={fee.sellerNet} />
            <FeeLine label={dd.funding.platformFeeLabel} value={fee.feeTotal} faint />
          </div>
          <div className="px-5 py-3 border-t border-[var(--lp-border-light)] mono text-[11px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
            {dd.funding.footerTemplate
              .replace('{delivery}', String(previewPct))
              .replace('{verification}', String(100 - previewPct))}
          </div>
        </div>
      )}

      {/* TRUSTED MATCH toggle. When on, the seller will see a stake
          requirement on their accept panel. Off-default — most direct deals
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
            className="mono text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: requireStake ? 'var(--lp-band-dark)' : 'var(--lp-dark)' }}
          >
            {dd.trustedMatch.eyebrow}
          </span>
          <p
            id="require-stake-help"
            className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]"
          >
            {dd.trustedMatch.body}
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

      {/* SUBMIT */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--lp-border-light)]">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em]',
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
          {submitting ? dd.submit.opening : dd.submit.open}
          {!submitting && (
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          )}
        </button>
        {!submitting && (
          <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
            {dd.submit.fundsCaption}
          </p>
        )}
      </div>

      {error && (
        <p className="mono text-[12px] text-[#7a1f1a]">
          {dd.errorPrefix} {error}
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
        <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
          {eyebrow}
        </p>
        <h3 className="font-sans text-[17px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
          {title}
        </h3>
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
        <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
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
            className="px-2.5 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: active ? 'var(--lp-dark)' : 'transparent',
              color: active ? 'var(--lp-light)' : 'var(--lp-text-sub)',
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

function FeeLine({
  label,
  value,
  strong,
  faint,
}: {
  label: string;
  value: number;
  strong?: boolean;
  faint?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={cn(
          'mono text-[11px] uppercase tracking-[0.1em]',
          faint ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums tracking-tight',
          strong
            ? 'font-sans font-extrabold text-[20px] text-[var(--lp-dark)]'
            : 'font-mono text-[13px] text-[var(--lp-dark)]',
        )}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}
