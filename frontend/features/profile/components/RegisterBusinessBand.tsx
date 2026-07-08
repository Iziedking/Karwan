'use client';
import { useEffect, useState } from 'react';
import { useWriteContract } from 'wagmi';
import { api, type BusinessRegisterBody } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { Band, SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';

/// KarwanBusinessRegistry.submitRegistration, the only function a web3 user
/// signs directly. The reviewer's approve/reject is backend-signed.
const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submitRegistration',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'docHash', type: 'bytes32' }],
    outputs: [],
  },
] as const;

const REGISTRY_ADDR = (process.env.NEXT_PUBLIC_BUSINESS_REGISTRY_ADDR ?? '') as `0x${string}` | '';

const SECTOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'textiles', label: 'Textiles' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];

type Sector = NonNullable<BusinessRegisterBody['company']['sector']>;
type Status = 'none' | 'submitted' | 'verified' | 'rejected';

async function sha256Hex(file: File): Promise<`0x${string}`> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

/// BUSINESS band on /profile. A wallet registers as a verified business by
/// anchoring a registration or tax document and submitting it for Karwan
/// review. Gated behind SME_TRADES_ENABLED at the call site. Independent
/// top-level component so editing it re-renders nothing else on the page.
export function RegisterBusinessBand({ address }: { address: string }) {
  const { method } = useAuth();
  const { writeContractAsync } = useWriteContract();

  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>('none');
  const [companyName, setCompanyName] = useState('');
  const [editing, setEditing] = useState(false);
  // Prefer the registry address the backend reports at runtime; fall back to the
  // build-time env only if the backend didn't send one. This keeps web3
  // registration working even when the frontend was built without the
  // NEXT_PUBLIC var (which is what makes the form say "opens at launch").
  const [registryAddr, setRegistryAddr] = useState<`0x${string}` | ''>(REGISTRY_ADDR);

  const [sector, setSector] = useState<Sector | ''>('');
  const [region, setRegion] = useState('');
  const [docKind, setDocKind] = useState<'registration' | 'tax'>('registration');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.getBusinessStatus(address);
        if (cancelled) return;
        setStatus(r.status);
        if (r.company?.companyName) setCompanyName(r.company.companyName);
        if (r.company?.sector) setSector(r.company.sector as Sector);
        if (r.company?.region) setRegion(r.company.region);
        if (r.registryAddr && /^0x[a-fA-F0-9]{40}$/.test(r.registryAddr)) {
          setRegistryAddr(r.registryAddr as `0x${string}`);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function submit() {
    setError(null);
    if (!companyName.trim()) {
      setError('Company name is required.');
      return;
    }
    if (!file) {
      setError('Attach a registration or tax document.');
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
        // The backend signs submitRegistration via the identity DCW.
        await api.registerBusinessCircle(body);
      } else {
        // Web3: sign submitRegistration locally, then record the tx.
        if (!registryAddr) {
          throw new Error('Business verification opens at launch.');
        }
        const txHash = await writeContractAsync({
          address: registryAddr,
          abi: REGISTRY_ABI,
          functionName: 'submitRegistration',
          args: [docHash],
        });
        await api.registerBusiness({ ...body, txHash });
      }
      setStatus('submitted');
      setEditing(false);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return (
      <Band tone="light" compact>
        <SectionTag>[:BUSINESS:]</SectionTag>
        <HeroHeadline size="md">
          Loading<Punc>…</Punc>
        </HeroHeadline>
      </Band>
    );
  }

  return (
    <Band tone="light" compact>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionTag dot={status === 'verified' ? 'live' : undefined}>[:BUSINESS:]</SectionTag>
          <HeroHeadline size="md">
            Trade as a business<Punc>.</Punc>
          </HeroHeadline>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-7">
        <PageCard>
          <div className="p-5 md:p-6 space-y-4">
            {status === 'verified' ? (
              <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
                {companyName || 'Your business'} is verified. You can open SME
                trade-finance deals and counterparties see your verified badge.
                Update soft details on the company profile above; changing the
                legal name or registration document re-enters review.
              </p>
            ) : status === 'submitted' ? (
              <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
                Your registration is under review. Karwan confirms the anchored
                document before granting the verified-business tag.
              </p>
            ) : (
              <>
                {status === 'rejected' ? (
                  <p className="text-[13.5px] text-[var(--lp-critical)] leading-relaxed">
                    Your last submission was declined. Re-submit with a clear
                    registration or tax document.
                  </p>
                ) : (
                  <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
                    Register as a business to open SME trade-finance deals.
                    Anchor your registration or tax document; Karwan reviews and
                    grants the verified tag.
                  </p>
                )}
                {editing ? (
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
                <div className="flex items-center gap-2 pt-1">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={submit}
                        disabled={submitting}
                        className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 bg-[var(--lp-dark)] text-[var(--lp-light)] disabled:opacity-60"
                        style={cornerStyle}
                      >
                        {submitting ? 'Submitting…' : 'Submit for review'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        disabled={submitting}
                        className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border border-black/15 hover:border-black/40 transition-colors"
                      style={cornerStyle}
                    >
                      {status === 'rejected' ? 'Re-submit' : 'Register as business'}
                    </button>
                  )}
                  {error ? (
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
                      {error}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </PageCard>
      </div>
    </Band>
  );
}

const cornerStyle = {
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  borderBottomLeftRadius: 6,
  borderBottomRightRadius: 2,
} as const;

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; color: string }> = {
    none: { label: 'NOT REGISTERED', color: 'var(--lp-text-muted)' },
    submitted: { label: 'UNDER REVIEW', color: '#b07d1f' },
    verified: { label: 'VERIFIED', color: 'var(--lp-positive)' },
    rejected: { label: 'DECLINED', color: 'var(--lp-critical)' },
  };
  const s = map[status];
  return (
    <span
      className="mono text-[10px] uppercase tracking-[0.16em] font-bold px-2.5 py-1 border"
      style={{ color: s.color, borderColor: s.color, ...cornerStyle }}
    >
      {s.label}
    </span>
  );
}

function RegisterForm(props: {
  companyName: string;
  setCompanyName: (v: string) => void;
  sector: Sector | '';
  setSector: (v: Sector | '') => void;
  region: string;
  setRegion: (v: string) => void;
  docKind: 'registration' | 'tax';
  setDocKind: (v: 'registration' | 'tax') => void;
  setFile: (f: File | null) => void;
  fileName: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
      <Field label="Legal company name">
        <input
          type="text"
          value={props.companyName}
          disabled={props.disabled}
          onChange={(e) => props.setCompanyName(e.target.value)}
          placeholder="e.g. Lagos Exporter Co"
          maxLength={120}
          className="form-input"
        />
      </Field>
      <Field label="Sector">
        <select
          value={props.sector}
          disabled={props.disabled}
          onChange={(e) => props.setSector(e.target.value as Sector | '')}
          className="form-input"
        >
          {SECTOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Region">
        <input
          type="text"
          value={props.region}
          disabled={props.disabled}
          onChange={(e) => props.setRegion(e.target.value)}
          placeholder="e.g. Lagos, Nigeria"
          maxLength={80}
          className="form-input"
        />
      </Field>
      <Field label="Document type">
        <select
          value={props.docKind}
          disabled={props.disabled}
          onChange={(e) => props.setDocKind(e.target.value as 'registration' | 'tax')}
          className="form-input"
        >
          <option value="registration">Business registration</option>
          <option value="tax">Tax certificate</option>
        </select>
      </Field>
      <Field label="Document">
        <input
          type="file"
          disabled={props.disabled}
          onChange={(e) => props.setFile(e.target.files?.[0] ?? null)}
          className="form-input"
        />
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {props.fileName
            ? `${props.fileName} · hashed locally, only the hash is anchored`
            : 'Only the document hash is anchored on chain. The file never leaves your device.'}
        </span>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
