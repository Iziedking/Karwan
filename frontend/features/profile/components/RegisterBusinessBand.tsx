'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWriteContract } from 'wagmi';
import { api, type BusinessRegisterBody } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';
import { Reveal } from '@/shared/components/Reveal';

const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submitRegistration',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'docHash', type: 'bytes32' }],
    outputs: [],
  },
] as const;

const REGISTRY_ADDR = (process.env.NEXT_PUBLIC_BUSINESS_REGISTRY_ADDR ?? '') as
  | `0x${string}`
  | '';

const SECTOR_OPTIONS = [
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
] as const;

type Sector = NonNullable<BusinessRegisterBody['company']['sector']>;
export type BusinessRegistrationStatus = 'none' | 'submitted' | 'verified' | 'rejected';

async function sha256Hex(file: File): Promise<`0x${string}`> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export function RegisterBusinessBand({
  address,
  mode = 'summary',
  startEditing = false,
  onStatusChange,
}: {
  address: string;
  mode?: 'summary' | 'workflow';
  startEditing?: boolean;
  onStatusChange?: (status: BusinessRegistrationStatus) => void;
}) {
  const t = useTranslations().registerBusiness;
  const { method } = useAuth();
  const { writeContractAsync } = useWriteContract();
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<BusinessRegistrationStatus>('none');
  const [companyName, setCompanyName] = useState('');
  const [editing, setEditing] = useState(false);
  const [registryAddr, setRegistryAddr] = useState<`0x${string}` | ''>(REGISTRY_ADDR);
  const [sector, setSector] = useState<Sector | ''>('');
  const [region, setRegion] = useState('');
  const [docKind, setDocKind] = useState<'registration' | 'tax'>('registration');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadFailed(false);
      try {
        const result = await api.getBusinessStatus(address);
        if (cancelled) return;
        setStatus(result.status);
        onStatusChange?.(result.status);
        if (startEditing && (result.status === 'none' || result.status === 'rejected')) {
          setEditing(true);
        }
        if (result.company?.companyName) setCompanyName(result.company.companyName);
        if (result.company?.sector) setSector(result.company.sector as Sector);
        if (result.company?.region) setRegion(result.company.region);
        if (result.registryAddr && /^0x[a-fA-F0-9]{40}$/.test(result.registryAddr)) {
          setRegistryAddr(result.registryAddr as `0x${string}`);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [address, onStatusChange, reloadKey, startEditing]);

  async function submit() {
    setError(null);
    if (!companyName.trim()) {
      setError(t.errors.companyName);
      return;
    }
    if (!file) {
      setError(t.errors.document);
      return;
    }
    setSubmitting(true);
    try {
      const docHash = await sha256Hex(file);
      const body: BusinessRegisterBody = {
        address,
        company: {
          companyName: companyName.trim(),
          sector: sector || undefined,
          region: region.trim() || undefined,
        },
        docHash,
        docKind,
        label: file.name,
      };

      if (method === 'circle') {
        await api.registerBusinessCircle(body);
      } else {
        if (!registryAddr) throw new Error('verification-unavailable');
        const txHash = await writeContractAsync({
          address: registryAddr,
          abi: REGISTRY_ABI,
          functionName: 'submitRegistration',
          args: [docHash],
        });
        await api.registerBusiness({ ...body, txHash });
      }

      setStatus('submitted');
      onStatusChange?.('submitted');
      setEditing(false);
      setFile(null);
    } catch {
      setError(t.errors.submit);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return (
      <Reveal className={BAND_INSET}>
        <SectionTag>{t.eyebrow}</SectionTag>
        <HeroHeadline size="md" as="h2">
          {t.loading}<Punc>…</Punc>
        </HeroHeadline>
      </Reveal>
    );
  }

  if (loadFailed) {
    return (
      <Reveal className={BAND_INSET}>
        <SectionTag>{t.eyebrow}</SectionTag>
        <PageCard className="mt-4">
          <div className="p-5 md:p-6">
            <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoaded(false);
                setReloadKey((value) => value + 1);
              }}
              className="mt-3 inline-flex min-h-11 items-center mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-accent-ink)]"
            >
              {t.actions.retry}
            </button>
          </div>
        </PageCard>
      </Reveal>
    );
  }

  const canSubmitEvidence = status === 'none' || status === 'rejected';

  return (
    <Reveal className={BAND_INSET}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionTag dot={status === 'verified' ? 'live' : undefined}>{t.eyebrow}</SectionTag>
          <HeroHeadline size="md" as="h2">
            {t.title}<Punc>.</Punc>
          </HeroHeadline>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-7">
        <PageCard>
          <div className="space-y-4 p-5 md:p-6">
            <p
              className={
                status === 'rejected'
                  ? 'text-[13.5px] leading-relaxed text-[var(--lp-critical)]'
                  : 'text-[14px] leading-relaxed text-[var(--lp-text-sub)]'
              }
            >
              {status === 'verified'
                ? t.body.verified.replace('{company}', companyName || t.yourBusiness)
                : t.body[status]}
            </p>

            {mode === 'workflow' && canSubmitEvidence && editing ? (
              <RegisterForm
                companyName={companyName}
                setCompanyName={setCompanyName}
                sector={sector}
                setSector={setSector}
                region={region}
                setRegion={setRegion}
                docKind={docKind}
                setDocKind={setDocKind}
                setFile={setFile}
                fileName={file?.name ?? null}
                disabled={submitting}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {mode === 'workflow' && canSubmitEvidence && editing ? (
                <>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="inline-flex min-h-11 items-center px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.14em] bg-[var(--lp-dark)] text-[var(--lp-light)] disabled:opacity-60"
                    style={cornerStyle}
                  >
                    {submitting ? t.actions.submitting : t.actions.submit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={submitting}
                    className="inline-flex min-h-11 items-center px-3 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
                  >
                    {t.actions.cancel}
                  </button>
                </>
              ) : mode === 'workflow' && canSubmitEvidence ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-11 items-center px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.14em] border border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)] transition-colors"
                  style={cornerStyle}
                >
                  {status === 'rejected' ? t.actions.resubmit : t.actions.start}
                </button>
              ) : mode === 'summary' && status !== 'verified' ? (
                <Link
                  href="/business/verification"
                  className="inline-flex min-h-11 items-center mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-accent-ink)]"
                >
                  {status === 'rejected' ? t.actions.resubmit : t.actions.openWorkflow}
                </Link>
              ) : mode === 'summary' && status === 'verified' ? (
                <Link
                  href="/business/verification"
                  className="inline-flex min-h-11 items-center mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-accent-ink)]"
                >
                  {t.actions.view}
                </Link>
              ) : null}
              {error ? (
                <span role="alert" className="text-[12px] leading-snug text-[var(--lp-critical)]">
                  {error}
                </span>
              ) : null}
            </div>
          </div>
        </PageCard>
      </div>
    </Reveal>
  );
}

const BAND_INSET = 'px-4 py-7 md:px-8 md:py-9';

const cornerStyle = {
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  borderBottomLeftRadius: 6,
  borderBottomRightRadius: 2,
} as const;

function StatusPill({ status }: { status: BusinessRegistrationStatus }) {
  const t = useTranslations().registerBusiness;
  const map: Record<BusinessRegistrationStatus, { label: string; color: string }> = {
    none: { label: t.status.none, color: 'var(--lp-text-muted)' },
    submitted: { label: t.status.submitted, color: '#b07d1f' },
    verified: { label: t.status.verified, color: 'var(--lp-positive)' },
    rejected: { label: t.status.rejected, color: 'var(--lp-critical)' },
  };
  const current = map[status];
  return (
    <span
      className="inline-flex min-h-11 items-center px-3 py-2 mono text-[10px] font-bold uppercase tracking-[0.16em] border"
      style={{ color: current.color, borderColor: current.color, ...cornerStyle }}
    >
      {current.label}
    </span>
  );
}

function RegisterForm(props: {
  companyName: string;
  setCompanyName: (value: string) => void;
  sector: Sector | '';
  setSector: (value: Sector | '') => void;
  region: string;
  setRegion: (value: string) => void;
  docKind: 'registration' | 'tax';
  setDocKind: (value: 'registration' | 'tax') => void;
  setFile: (file: File | null) => void;
  fileName: string | null;
  disabled?: boolean;
}) {
  const rb = useTranslations().registerBusiness;
  const sme = useTranslations().smeCompany;
  return (
    <div className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-2">
      <Field label={rb.legalCompanyName}>
        <input
          type="text"
          value={props.companyName}
          disabled={props.disabled}
          onChange={(event) => props.setCompanyName(event.target.value)}
          placeholder={sme.form.companyNamePlaceholder}
          maxLength={120}
          className="form-input min-h-11"
        />
      </Field>
      <Field label={rb.region}>
        <input
          type="text"
          value={props.region}
          disabled={props.disabled}
          onChange={(event) => props.setRegion(event.target.value)}
          placeholder={sme.form.regionPlaceholder}
          maxLength={80}
          className="form-input min-h-11"
        />
      </Field>

      <fieldset className="space-y-2 sm:col-span-2">
        <legend className={FIELD_LABEL_CLASS}>{rb.sector}</legend>
        <div className="flex flex-wrap gap-2">
          {SECTOR_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={props.disabled}
              aria-pressed={props.sector === value}
              onClick={() => props.setSector(value)}
              className={
                props.sector === value
                  ? 'inline-flex min-h-11 items-center border border-[var(--lp-dark)] bg-[var(--lp-dark)] px-3 py-2 text-[12px] font-semibold text-[var(--lp-light)]'
                  : 'inline-flex min-h-11 items-center border border-[var(--lp-outline)] px-3 py-2 text-[12px] font-semibold text-[var(--lp-text-sub)] hover:border-[var(--lp-outline-hover)]'
              }
              style={cornerStyle}
            >
              {sme.sectors[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2 sm:col-span-2">
        <legend className={FIELD_LABEL_CLASS}>{rb.documentType}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(['registration', 'tax'] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={props.disabled}
              aria-pressed={props.docKind === value}
              onClick={() => props.setDocKind(value)}
              className={
                props.docKind === value
                  ? 'min-h-11 border border-[var(--lp-dark)] bg-[var(--lp-dark)] px-4 py-3 text-start text-[13px] font-semibold text-[var(--lp-light)]'
                  : 'min-h-11 border border-[var(--lp-outline)] px-4 py-3 text-start text-[13px] font-semibold text-[var(--lp-text-sub)] hover:border-[var(--lp-outline-hover)]'
              }
              style={cornerStyle}
            >
              {value === 'registration' ? rb.businessRegistration : rb.taxCertificate}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={rb.document} className="sm:col-span-2">
        <input
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          disabled={props.disabled}
          onChange={(event) => props.setFile(event.target.files?.[0] ?? null)}
          className="form-input min-h-11 file:me-3 file:min-h-9 file:border-0 file:bg-[var(--lp-dark)] file:px-3 file:text-[11px] file:font-bold file:uppercase file:tracking-[0.08em] file:text-[var(--lp-light)]"
        />
        <span className="block text-[11px] leading-relaxed text-[var(--lp-text-muted)]">
          {props.fileName
            ? rb.fileSelected.replace('{name}', props.fileName)
            : rb.filePrivacy}
        </span>
      </Field>
    </div>
  );
}

const FIELD_LABEL_CLASS =
  'mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--lp-text-muted)]';

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-2 ${className ?? ''}`}>
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}
