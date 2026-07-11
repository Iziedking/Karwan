'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { TopUpFromGateway } from '@/features/gateway/TopUpFromGateway';
import { api, ApiError } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { sfx } from '@/shared/utils/sfx';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { cn } from '@/shared/utils/cn';
import { looksLikeWrongSide } from '@/shared/utils/intentDetect';
import { PageTour } from '@/shared/guide/PageTour';
import { useGuide } from '@/shared/guide/GuideProvider';
import { BUYER_TOUR_ID, BUYER_STEPS } from '@/shared/guide/tours';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { isBusinessAccount } from '@/features/account/accountKind';

// SME trade-finance constants. Hoisted to module scope per the Vercel
// `rendering-hoist-jsx` rule: these never change, so re-creating the
// arrays on every render would just waste cycles + GC pressure.
type TradeType = 'service' | 'goods' | 'mixed';
type IncotermsCode = 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
type PaymentTermsCode = 'immediate' | 'net30' | 'net60' | 'net90';
type DocumentKind = 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';

const INCOTERMS: ReadonlyArray<{ code: IncotermsCode; gloss: string }> = [
  { code: 'EXW', gloss: 'Buyer collects from factory.' },
  { code: 'FCA', gloss: 'Seller delivers to a named carrier.' },
  { code: 'FOB', gloss: 'Seller loads on the named vessel.' },
  { code: 'CIF', gloss: 'Seller pays freight + insurance to port.' },
  { code: 'DAP', gloss: 'Seller delivers; buyer clears customs.' },
  { code: 'DDP', gloss: 'Seller delivers + clears customs.' },
];

const PAYMENT_TERMS: ReadonlyArray<{ code: PaymentTermsCode; label: string }> = [
  { code: 'immediate', label: 'IMMEDIATE' },
  { code: 'net30', label: 'NET 30' },
  { code: 'net60', label: 'NET 60' },
  { code: 'net90', label: 'NET 90' },
];

const SECTORS: ReadonlyArray<string> = [
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
];

const DOC_KIND_LABELS: Record<DocumentKind, string> = {
  invoice: 'INVOICE',
  po: 'PO',
  bol: 'BoL',
  coo: 'CoO',
  pod: 'PoD',
  other: 'OTHER',
};

/// Browser sha256 via Web Crypto. Returns 0x-prefixed 32-byte hex.
/// Native API, zero bundle cost, runs off main thread internally on
/// most engines. No dynamic-import needed for the hasher itself.
async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hashBuffer);
  let hex = '0x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

function inferDocKindFromFilename(name: string): DocumentKind {
  const lower = name.toLowerCase();
  if (lower.includes('invoice')) return 'invoice';
  if (lower.includes('po') || lower.includes('purchase')) return 'po';
  if (lower.includes('bol') || lower.includes('bill')) return 'bol';
  if (lower.includes('coo') || lower.includes('origin')) return 'coo';
  if (lower.includes('pod') || lower.includes('delivery')) return 'pod';
  return 'other';
}

/// Parse a comma-separated milestone split ("30, 70") into validated
/// percentages. Escrow releases the deal amount in these tranches as the work
/// lands, so the parts must total 100. Allows 2 to 5 milestones, each a whole
/// number from 1 to 99.
function parseMilestoneSplit(text: string): { pcts: number[] | null; error: string | null } {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);
  if (parts.length < 2 || parts.length > 5) return { pcts: null, error: 'Use 2 to 5 milestones.' };
  if (parts.some((n) => !Number.isInteger(n) || n < 1 || n > 99))
    return { pcts: null, error: 'Each part is a whole number from 1 to 99.' };
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum !== 100) return { pcts: null, error: `Parts must total 100. Now ${sum}.` };
  return { pcts: parts, error: null };
}

const SPLIT_PRESETS = ['50, 50', '30, 70', '40, 30, 30'] as const;

export function PostJobForm() {
  const t = useTranslations().postJob;
  const router = useRouter();
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const { activate, activating, agents } = useActivation();
  const buyerAgent = agents?.buyer;
  const { profile, loading: profileLoading } = useUserProfile();
  const { recordAction } = useGuide();
  // Initial values from URL query params. BriefComposer sets these after the
  // natural-language extractor lands so the form mounts pre-filled. Parsing
  // is defensive: bad values fall through to the empty defaults.
  const search = useSearchParams();
  const initialBrief = search.get('brief') ?? '';
  const initialBudgetRaw = search.get('budget');
  const initialBudget =
    initialBudgetRaw != null && Number.isFinite(Number(initialBudgetRaw))
      ? Number(initialBudgetRaw)
      : null;
  const initialToleranceRaw = search.get('tolerance');
  const initialTolerance =
    initialToleranceRaw != null && Number.isFinite(Number(initialToleranceRaw))
      ? Number(initialToleranceRaw)
      : null;
  const initialTrustedMatch = search.get('trustedMatch') === '1';
  const [brief, setBrief] = useState(initialBrief);
  const [budget, setBudget] = useState<number | ''>(initialBudget ?? '');
  // Deadline split: a raw `value` and a `unit`. Submit converts to seconds.
  // Defaults adapt per unit so switching feels natural (5d → 2h → 15m).
  const [deadlineUnit, setDeadlineUnit] = useState<'min' | 'hr' | 'd'>('d');
  const [deadlineValue, setDeadlineValue] = useState<number | ''>('');
  const [tolerance, setTolerance] = useState<number | ''>(initialTolerance ?? '');
  // Trusted Match: when on, the agent loop weights seller reputation + stake
  // above price and gates bids on the seller's free stake covering the deal's
  // insurance reservation. For higher-value or one-shot deals.
  const [trustedMatch, setTrustedMatch] = useState(initialTrustedMatch);
  // Custom milestone split. Off = the buyer profile default (50/50) stands.
  // On = these tranches are carried into escrow when the agent finds a deal.
  const [customSplit, setCustomSplit] = useState(false);
  const [splitText, setSplitText] = useState('50, 50');
  // SME trade-finance state. Split into separate hooks per the Vercel
  // `rerender-split-combined-hooks` rule. Each picker mutates only its own
  // slice so a sector change never re-renders unrelated inputs.
  const [tradeType, setTradeType] = useState<TradeType>('service');
  const [incoterms, setIncoterms] = useState<IncotermsCode | null>(null);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermsCode>('immediate');
  // Sourcing profile: the KIND of supplier and WHERE, not a named counterparty.
  // This is an auction — the agent finds the partner — so there is no company
  // name here (that lives on the direct-deal flow). Sector + region drive the
  // agent's partner matching and the financier's deal filtering.
  const [companySector, setCompanySector] = useState('');
  const [companyRegion, setCompanyRegion] = useState('');
  const [documentRefs, setDocumentRefs] = useState<
    Array<{ hash: string; kind: DocumentKind; label: string }>
  >([]);
  const [hashingFile, setHashingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!submitting) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startedAt.current == null) return;
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [submitting]);

  const [insufficientBalance, setInsufficientBalance] = useState(false);
  // Symmetric check to the seller form. If a buyer brief reads as an offer
  // ("I sell..."), warn before posting so it doesn't end up on the wrong
  // surface. Brief has no title field, so we pass the brief itself as both
  // title + body. the regex set handles either case.
  const [intentWarned, setIntentWarned] = useState(false);
  const intentCheck = looksLikeWrongSide(brief, '', 'request');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !address ||
      !brief ||
      typeof budget !== 'number' ||
      typeof deadlineValue !== 'number'
    )
      return;
    if (intentCheck.wrong && !intentWarned) {
      setIntentWarned(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    setInsufficientBalance(false);
    try {
      // SME trade-finance payload. Only included when the user actually
      // engaged the goods / mixed flow; service deals stay on the legacy
      // shape so the auction surface doesn't see noise. No counterparty NAME in
      // an auction (the agent finds the partner); sector + region describe the
      // supplier the agent should match, and carry through to financier filtering.
      const sourcingProfile =
        companySector || companyRegion
          ? {
              sector: companySector || undefined,
              region: companyRegion.trim() || undefined,
            }
          : undefined;
      const r = await api.postJob({
        posterAddress: address,
        brief,
        budgetUsdc: budget,
        deadlineSeconds: deadlineToSeconds(deadlineValue, deadlineUnit),
        negotiationMaxIncreasePct: typeof tolerance === 'number' ? tolerance : undefined,
        trustedMatch,
        // Only sent when the buyer opted into a custom split; otherwise the
        // backend uses the buyer profile default. Guarded valid by `disabled`.
        milestonePcts: customSplit ? parseMilestoneSplit(splitText).pcts ?? undefined : undefined,
        tradeType: tradeType !== 'service' ? tradeType : undefined,
        incoterms: tradeType !== 'service' && incoterms ? incoterms : undefined,
        paymentTerms: tradeType !== 'service' ? paymentTerms : undefined,
        counterpartyCompany: tradeType !== 'service' ? sourcingProfile : undefined,
        documentRefs: documentRefs.length > 0 ? documentRefs : undefined,
      });
      sfx.send();
      recordAction('post-job');
      router.push(`/jobs/${r.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'insufficient buyer balance') {
        setInsufficientBalance(true);
        setError(err.detail ? String(err.detail) : t.errors.insufficientBalanceFallback);
      } else if (err instanceof ApiError && err.detail) {
        setError(String(err.detail));
      } else {
        setError((err as Error).message);
      }
      setSubmitting(false);
    }
  }

  const split = parseMilestoneSplit(splitText);
  const disabled =
    submitting || !brief.trim() || !budget || !deadlineValue || (customSplit && !split.pcts);
  const buttonLabel = submitting
    ? elapsed < 8
      ? t.submit.submittingShort
      : elapsed < 30
        ? t.submit.waitingArcTemplate.replace('{seconds}', String(elapsed))
        : t.submit.waitingCircleTemplate.replace('{seconds}', String(elapsed))
    : t.submit.postOnChain;

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--lp-text-sub)]">
          {t.notConnected}
        </p>
      </div>
    );
  }

  if (!profileLoading && !profile?.buyer) {
    return (
      <div
        className="p-6 space-y-3"
        style={{
          background: 'var(--lp-light)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 4,
        }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {t.noBuyerProfile.eyebrow}
        </p>
        <h3 className="font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em]">
          {t.noBuyerProfile.title}
        </h3>
        <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed">
          {t.noBuyerProfile.body}
        </p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 mt-2 px-[18px] py-[10px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.22)] hover:shadow-[0_4px_0_rgba(0,0,0,0.22)]"
          style={{
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          {t.noBuyerProfile.cta}
        </Link>
      </div>
    );
  }

  const previewAmount = typeof budget === 'number' ? budget : 0;
  const previewDeadline = typeof deadlineValue === 'number' ? deadlineValue : 0;
  const previewUnitLabel =
    deadlineUnit === 'min'
      ? t.preview.unitMinShort
      : deadlineUnit === 'hr'
        ? t.preview.unitHrShort
        : t.preview.unitDaysShort;
  const previewTol = typeof tolerance === 'number' ? tolerance : 0;
  const ceiling =
    typeof budget === 'number' && typeof tolerance === 'number'
      ? (budget * (1 + tolerance / 100)).toFixed(2)
      : null;
  // The SME trade-context band (goods/Incoterms/payment terms/company/docs) is
  // a business surface. Individuals on P2P never see it, so their request stays
  // the simple service flow. Businesses keep it, including when they post a
  // service request to hire a person (tradeType defaults to 'service').
  const isBusiness = isBusinessAccount(profile);

  return (
    <>
    <PageTour id={BUYER_TOUR_ID} steps={BUYER_STEPS} />
    <form onSubmit={submit} className="space-y-7">
      {/* DEAL PREVIEW. big editorial display */}
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
            {t.preview.eyebrow}
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
              {previewDeadline}
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
              {t.preview.tolerancePrefix} {previewTol}%
            </span>
            {ceiling && (
              <>
                <span aria-hidden className="w-px h-3 bg-white/20" />
                <span>{t.preview.ceilingPrefix} {ceiling} USDC</span>
              </>
            )}
            <span aria-hidden className="w-px h-3 bg-white/20" />
            <span>{t.preview.milestoneCaption}</span>
          </div>
        </div>
      </div>

      {/* THE WORK */}
      <FieldSection eyebrow={t.sectionWork.eyebrow} title={t.sectionWork.title} dataGuide="buyer-brief">
        <FormLabel
          label={t.sectionWork.requestLabel}
          hint={t.sectionWork.requestHint}
        >
          <textarea
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              setIntentWarned(false);
            }}
            rows={4}
            disabled={submitting}
            placeholder={
              tradeType === 'goods'
                ? 'e.g. 500 kg organic shea butter, FOB Lagos, packed in 25 kg drums, payment net 30.'
                : tradeType === 'mixed'
                  ? 'e.g. Equipment install on site, 2 weeks, includes shipping + commissioning.'
                  : t.sectionWork.requestPlaceholder
            }
            className="form-input form-textarea"
          />
        </FormLabel>
      </FieldSection>

      {/* TRADE CONTEXT. Business-only surface on the SME Trades rail. Hidden
          for individuals so the P2P request stays the simple service flow. */}
      {SME_TRADES_ENABLED && isBusiness && (
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
            <FormLabel label="Incoterms 2020" hint="The trade-rule each side commits to.">
              <div className="flex gap-2 flex-wrap">
                {INCOTERMS.map((it) => (
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
                {PAYMENT_TERMS.map((pt) => (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormLabel
                label="Sourcing sector"
                hint="The kind of supplier you want. Your agent matches partners on this."
              >
                <select
                  value={companySector}
                  disabled={submitting}
                  onChange={(e) => setCompanySector(e.target.value)}
                  className="form-input"
                >
                  <option value="">—</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel
                label="Sourcing region"
                hint="Where you want to source from. Weighted in matching and shown to financiers."
              >
                <input
                  type="text"
                  value={companyRegion}
                  disabled={submitting}
                  onChange={(e) => setCompanyRegion(e.target.value)}
                  placeholder="e.g. South Asia, or Dubai, AE"
                  className="form-input"
                  maxLength={80}
                />
              </FormLabel>
            </div>
            <FormLabel
              label="Documents"
              hint="Hashes anchor on chain when the deal is accepted. Files stay on your device."
            >
              <input
                type="file"
                disabled={submitting || hashingFile}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setHashingFile(true);
                  try {
                    const hash = await sha256OfFile(file);
                    const kind = inferDocKindFromFilename(file.name);
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
                        {DOC_KIND_LABELS[d.kind]}
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
      )}

      {/* TERMS */}
      <FieldSection eyebrow={t.sectionTerms.eyebrow} title={t.sectionTerms.title}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormLabel
            label={t.sectionTerms.budgetLabel}
            unit="USDC"
            hint={t.sectionTerms.budgetHint}
            dataGuide="buyer-budget"
          >
            <input
              type="number"
              min={1}
              step={1}
              value={budget}
              disabled={submitting}
              onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="form-input form-input-num"
            />
          </FormLabel>
          <FormLabel
            label={t.sectionTerms.deadlineLabel}
            unit={previewUnitLabel.toLowerCase()}
            hint={t.sectionTerms.deadlineHint}
            dataGuide="buyer-deadline"
          >
            <div className="flex items-stretch gap-2">
              <input
                type="number"
                min={1}
                max={deadlineUnit === 'min' ? 1440 : deadlineUnit === 'hr' ? 72 : 90}
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
                onChange={(next) => {
                  // Pick a sensible default when the unit changes so the field
                  // never lands on something nonsensical (90 minutes vs 90 days).
                  const defaults = { min: 15, hr: 2, d: 5 } as const;
                  setDeadlineUnit(next);
                  setDeadlineValue(defaults[next]);
                }}
              />
            </div>
          </FormLabel>
          <FormLabel
            label={t.sectionTerms.toleranceLabel}
            unit="%"
            hint={t.sectionTerms.toleranceHint}
            dataGuide="buyer-tolerance"
          >
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={tolerance}
              disabled={submitting}
              onChange={(e) => setTolerance(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="form-input form-input-num"
            />
          </FormLabel>
        </div>
      </FieldSection>

      {/* TRUSTED MATCH toggle. The agent loop flips ranking to reputation +
          stake first, price second, and gates bids on the seller's free
          stake covering this deal's insurance reservation. Off by default
          (Normal mode is fine for sub-$50 day-to-day deals). */}
      <label
        className={cn(
          'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
          trustedMatch
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
          checked={trustedMatch}
          onChange={(e) => setTrustedMatch(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
          aria-describedby="trusted-match-help"
        />
        <div className="min-w-0">
          <span
            className="mono text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: trustedMatch ? 'var(--lp-band-dark)' : 'var(--lp-dark)' }}
          >
            [:{t.trustedMatch.eyebrow}:]
          </span>
          <p
            id="trusted-match-help"
            className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]"
          >
            {t.trustedMatch.body}
          </p>
        </div>
      </label>

      {/* CUSTOM MILESTONE SPLIT. Off by default = the buyer profile split
          (50/50) stands. On = the buyer sets how escrow releases in tranches
          as the work lands; carried into escrow when the agent finds a deal. */}
      <div
        className={cn(
          'px-4 py-3 transition-colors',
          customSplit
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
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={customSplit}
            onChange={(e) => setCustomSplit(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
            aria-describedby="milestone-split-help"
          />
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 mono text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: customSplit ? 'var(--lp-band-dark)' : 'var(--lp-dark)' }}
            >
              [:CUSTOM MILESTONE SPLIT:]
              <Hint>
                Milestone split sets how your payment releases in stages as the work lands. 50, 50 pays
                half at the first milestone and half on final delivery. The parts must add up to 100.
              </Hint>
            </span>
            <p
              id="milestone-split-help"
              className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]"
            >
              Off, deals release 50 then 50. Tick to set your own stages, applied when a deal is found.
            </p>
          </div>
        </label>

        {customSplit && (
          <div className="mt-3.5 sm:ms-7 space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {SPLIT_PRESETS.map((preset) => {
                const active = splitText.replace(/\s/g, '') === preset.replace(/\s/g, '');
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={submitting}
                    onClick={() => setSplitText(preset)}
                    className={cn(
                      'mono text-[11px] uppercase tracking-[0.12em] font-bold px-2.5 py-1.5 border transition-colors',
                      active
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
                    {preset}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={splitText}
              disabled={submitting}
              onChange={(e) => setSplitText(e.target.value)}
              placeholder="50, 50"
              aria-invalid={!split.pcts}
              aria-label="Milestone split percentages, comma separated"
              className="form-input"
            />
            {split.pcts ? (
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                {split.pcts
                  .map(
                    (p, i) =>
                      `M${i + 1} ${p}%${
                        typeof budget === 'number' && budget > 0
                          ? ` (${((budget * p) / 100).toFixed(2)} USDC)`
                          : ''
                      }`,
                  )
                  .join('  ·  ')}
              </p>
            ) : (
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-[#7a1f1a]">{split.error}</p>
            )}
          </div>
        )}
      </div>

      {/* INTENT WARNING. surfaces if the brief reads as a seller offer
          ("I sell..."). User can click submit again to post anyway. */}
      {intentCheck.wrong && intentWarned && (
        <div
          className="px-4 py-3"
          style={{
            background: 'rgba(178, 84, 37, 0.10)',
            border: '1px solid rgba(178, 84, 37, 0.35)',
            color: '#b25425',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5">
            [:{t.intentWarning.eyebrow}:]
          </p>
          <p className="text-[12.5px] leading-snug text-[var(--lp-dark)]">
            {t.intentWarning.bodyStart}
            <span className="font-bold">{t.intentWarning.bodyOffer}</span>
            {t.intentWarning.bodyMiddle}
            <span className="font-bold">{t.intentWarning.bodyNeed}</span>
            {t.intentWarning.bodyAfter}
            <Link
              href="/seller"
              className="underline underline-offset-2 hover:opacity-80"
            >
              {t.intentWarning.bodyLink}
            </Link>
            {t.intentWarning.bodyAfterLink}
            <span className="font-bold">{t.intentWarning.bodyButtonRef}</span>
            {t.intentWarning.bodyTail}
          </p>
        </div>
      )}

      {/* SUBMIT */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--lp-border-light)]">
        <button
          type="submit"
          data-guide="buyer-submit"
          disabled={disabled}
          className={cn(
            'group inline-flex items-center gap-2 px-[22px] py-[13px] mono text-[13px] font-semibold uppercase tracking-[0.08em]',
            'transition-[transform,box-shadow] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
            disabled
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
          {buttonLabel}
          {!submitting && (
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          )}
        </button>
        {submitting && (
          <p className="text-[12px] text-[var(--lp-text-muted)] leading-snug max-w-[36ch]">
            {t.submit.pendingHelper}
          </p>
        )}
        {!submitting && (
          <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
            {t.submit.feeCaption}
          </p>
        )}
      </div>

      {insufficientBalance ? (
        <div
          className="p-4 space-y-2"
          style={{
            background: 'rgba(133,83,0,0.06)',
            border: '1px solid rgba(133,83,0,0.25)',
            borderRadius: 12,
          }}
        >
          <p className="font-sans text-[14px] font-extrabold uppercase tracking-[-0.01em] text-[var(--lp-dark)]">
            {t.errors.insufficientBalanceTitle}
          </p>
          <p className="text-[12px] text-[var(--lp-text-sub)] leading-snug">{error}</p>
          {/* One click, straight from the pooled balance into the buyer agent.
              No bridge, no chain switch, no gas. If the pool cannot cover it the
              button opens the Gateway rail in a NEW TAB, so this half-filled
              form survives. */}
          {buyerAgent && typeof budget === 'number' ? (
            <TopUpFromGateway
              recipient={buyerAgent}
              amount={budget}
              onFunded={() => setInsufficientBalance(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => window.open('/bridge?rail=gateway', '_blank', 'noopener')}
              className="mono text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--lp-dark)] underline-offset-2 hover:underline"
            >
              {t.errors.topUpCta}
            </button>
          )}
        </div>
      ) : (
        error && (
          <div className="space-y-1.5">
            <p className="mono text-[12px] text-[#7a1f1a]">{t.errors.postFailedPrefix} {error}</p>
            {/activate|agent wallet/i.test(error) && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await activate();
                    setError(null);
                  } catch {
                    /* useActivation surfaces its own failure; keep the message */
                  }
                }}
                disabled={activating}
                className="mono text-[11px] uppercase tracking-[0.1em] underline underline-offset-2 text-[var(--lp-dark)] disabled:opacity-50"
              >
                {activating ? t.errors.activatingButton : t.errors.activateCta}
              </button>
            )}
          </div>
        )
      )}

    </form>
    </>
  );
}

function FieldSection({
  eyebrow,
  title,
  children,
  dataGuide,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  dataGuide?: string;
}) {
  return (
    <section className="space-y-4" data-guide={dataGuide}>
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
  dataGuide,
}: {
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
  dataGuide?: string;
}) {
  return (
    <label className="block space-y-2" data-guide={dataGuide}>
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

const UNIT_SECONDS = { min: 60, hr: 3600, d: 86_400 } as const;

function deadlineToSeconds(value: number, unit: 'min' | 'hr' | 'd'): number {
  return Math.max(60, Math.round(value * UNIT_SECONDS[unit]));
}

function DeadlineUnitPicker({
  value,
  disabled,
  onChange,
}: {
  value: 'min' | 'hr' | 'd';
  disabled?: boolean;
  onChange: (next: 'min' | 'hr' | 'd') => void;
}) {
  const t = useTranslations().postJob;
  const options: Array<{ key: 'min' | 'hr' | 'd'; label: string }> = [
    { key: 'min', label: t.unitPickerLabels.min },
    { key: 'hr', label: t.unitPickerLabels.hr },
    { key: 'd', label: t.unitPickerLabels.day },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t.deadlineUnitAria}
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
