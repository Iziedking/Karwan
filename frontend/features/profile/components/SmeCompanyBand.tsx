'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { Band, SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';
import { cn } from '@/shared/utils/cn';

// Hoisted constants per Vercel `rendering-hoist-jsx`, never re-allocated
// per render. Static option lists for the native <select> inputs.
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

const EMPLOYEE_BAND_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'micro', label: 'Micro (< 10)' },
  { value: 'small', label: 'Small (10–50)' },
  { value: 'medium', label: 'Medium (50–250)' },
];

const VOLUME_BAND_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: 'under_100k', label: 'Under $100k' },
  { value: '100k_1m', label: '$100k – $1M' },
  { value: '1m_10m', label: '$1M – $10M' },
  { value: 'over_10m', label: 'Over $10M' },
];

type VolumeBand = 'under_100k' | '100k_1m' | '1m_10m' | 'over_10m';

type Sector =
  | 'agriculture'
  | 'textiles'
  | 'electronics'
  | 'logistics'
  | 'manufacturing'
  | 'services'
  | 'other';
type EmployeeBand = 'micro' | 'small' | 'medium';

/// COMPANY band on /profile. Lets the user fill in their SME profile,
/// the data that financiers + counterparties see on the credit passport.
/// Top-level component per `rerender-no-inline-components`. Independent
/// of the rest of /profile so the page re-renders nothing when the form
/// is edited.
export function SmeCompanyBand({ address }: { address: string }) {
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState<Sector | ''>('');
  const [region, setRegion] = useState('');
  const [yearFounded, setYearFounded] = useState<number | ''>('');
  const [employeeBand, setEmployeeBand] = useState<EmployeeBand | ''>('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [primaryMarkets, setPrimaryMarkets] = useState('');
  const [annualVolumeBand, setAnnualVolumeBand] = useState<VolumeBand | ''>('');
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const [repayment, setRepayment] = useState<{
    windowDealCount: number;
    onTimeRate: number;
    averageDaysToSettle: number;
    defaultCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.getSmeProfile(address);
        if (cancelled) return;
        if (r.smeProfile) {
          setCompanyName(r.smeProfile.companyName ?? '');
          setSector((r.smeProfile.sector as Sector) ?? '');
          setRegion(r.smeProfile.region ?? '');
          setYearFounded(r.smeProfile.yearFounded ?? '');
          setEmployeeBand((r.smeProfile.employeeBand as EmployeeBand) ?? '');
          setWebsiteUrl(r.smeProfile.websiteUrl ?? '');
          setRegistrationId(r.smeProfile.registrationId ?? '');
          setPrimaryMarkets(r.smeProfile.primaryMarkets ?? '');
          setAnnualVolumeBand((r.smeProfile.annualVolumeBand as VolumeBand) ?? '');
          setVerifiedAt(r.smeProfile.verifiedAt ?? null);
        }
        if (r.repaymentBehavior) {
          setRepayment(r.repaymentBehavior);
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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateSmeProfile({
        address,
        smeProfile: {
          companyName: companyName.trim() || undefined,
          sector: sector || undefined,
          region: region.trim() || undefined,
          yearFounded: typeof yearFounded === 'number' ? yearFounded : undefined,
          employeeBand: employeeBand || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          registrationId: registrationId.trim() || undefined,
          primaryMarkets: primaryMarkets.trim() || undefined,
          annualVolumeBand: annualVolumeBand || undefined,
        },
      });
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hasAny =
    companyName ||
    sector ||
    region ||
    yearFounded ||
    employeeBand ||
    websiteUrl ||
    registrationId ||
    primaryMarkets ||
    annualVolumeBand;

  if (!loaded) {
    return (
      <Band tone="light" compact>
        <SectionTag>[:COMPANY PROFILE:]</SectionTag>
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
          <SectionTag dot={verifiedAt ? 'live' : undefined}>
            [:COMPANY PROFILE:]
          </SectionTag>
          <HeroHeadline size="md">
            Trade card<Punc>.</Punc>
          </HeroHeadline>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border border-black/15 hover:border-black/40 transition-colors"
            style={{
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
          >
            {hasAny ? 'Edit' : 'Add company'}
          </button>
        ) : null}
      </div>

      <div className="mt-7 grid md:grid-cols-2 gap-5">
        <PageCard>
          <div className="p-5 md:p-6 space-y-3">
            {editing ? (
              <SmeEditGrid
                companyName={companyName}
                setCompanyName={setCompanyName}
                sector={sector}
                setSector={setSector}
                region={region}
                setRegion={setRegion}
                yearFounded={yearFounded}
                setYearFounded={setYearFounded}
                employeeBand={employeeBand}
                setEmployeeBand={setEmployeeBand}
                websiteUrl={websiteUrl}
                setWebsiteUrl={setWebsiteUrl}
                registrationId={registrationId}
                setRegistrationId={setRegistrationId}
                primaryMarkets={primaryMarkets}
                setPrimaryMarkets={setPrimaryMarkets}
                annualVolumeBand={annualVolumeBand}
                setAnnualVolumeBand={setAnnualVolumeBand}
                disabled={saving}
              />
            ) : hasAny ? (
              <SmeViewRows
                companyName={companyName}
                sector={sector}
                region={region}
                yearFounded={yearFounded}
                employeeBand={employeeBand}
                websiteUrl={websiteUrl}
                registrationId={registrationId}
                primaryMarkets={primaryMarkets}
                annualVolumeBand={annualVolumeBand}
              />
            ) : (
              <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
                Add a company profile so financiers can review your sector and
                region before they fund.
              </p>
            )}
            {editing ? (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-60"
                  style={{
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 6,
                    borderBottomRightRadius: 2,
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
                >
                  Cancel
                </button>
                {error ? (
                  <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
                    {error}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </PageCard>
        {repayment && repayment.windowDealCount > 0 ? (
          <PageCard>
            <div className="p-5 md:p-6">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:REPAYMENT BEHAVIOR:]
              </p>
              <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                last {repayment.windowDealCount} deals
              </p>
              <dl className="mt-5 space-y-3.5">
                <RepayRow
                  label="On-time rate"
                  value={`${Math.round(repayment.onTimeRate * 100)}%`}
                  tone={repayment.onTimeRate >= 0.8 ? 'positive' : repayment.onTimeRate >= 0.5 ? 'neutral' : 'critical'}
                />
                <RepayRow
                  label="Avg days to settle"
                  value={repayment.averageDaysToSettle.toFixed(1)}
                  tone="neutral"
                />
                <RepayRow
                  label="Defaults"
                  value={String(repayment.defaultCount)}
                  tone={repayment.defaultCount === 0 ? 'positive' : 'critical'}
                />
              </dl>
            </div>
          </PageCard>
        ) : null}
      </div>
    </Band>
  );
}

function SmeViewRows(props: {
  companyName: string;
  sector: string;
  region: string;
  yearFounded: number | '';
  employeeBand: string;
  websiteUrl: string;
  registrationId: string;
  primaryMarkets: string;
  annualVolumeBand: string;
}) {
  const volumeLabel =
    VOLUME_BAND_OPTIONS.find((o) => o.value === props.annualVolumeBand)?.label ?? '';
  return (
    <dl className="space-y-3">
      <ViewRow label="Name" value={props.companyName || '—'} />
      <ViewRow label="Sector" value={props.sector || '—'} capitalize />
      <ViewRow label="Region" value={props.region || '—'} />
      {props.yearFounded ? <ViewRow label="Founded" value={String(props.yearFounded)} /> : null}
      {props.employeeBand ? (
        <ViewRow label="Size" value={props.employeeBand} capitalize />
      ) : null}
      {props.registrationId ? (
        <ViewRow label="Reg / Tax ID" value={props.registrationId} />
      ) : null}
      {props.primaryMarkets ? (
        <ViewRow label="Markets" value={props.primaryMarkets} />
      ) : null}
      {volumeLabel ? <ViewRow label="Annual volume" value={volumeLabel} /> : null}
      {props.websiteUrl ? (
        <ViewRow
          label="Website"
          value={
            <a
              href={props.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[var(--lp-dark)] hover:underline"
            >
              {props.websiteUrl.replace(/^https?:\/\//, '')}
            </a>
          }
        />
      ) : null}
    </dl>
  );
}

function ViewRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: React.ReactNode;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </dt>
      <dd
        className={cn(
          'text-[13.5px] text-[var(--lp-dark)] text-right',
          capitalize && 'capitalize',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SmeEditGrid(props: {
  companyName: string;
  setCompanyName: (v: string) => void;
  sector: Sector | '';
  setSector: (v: Sector | '') => void;
  region: string;
  setRegion: (v: string) => void;
  yearFounded: number | '';
  setYearFounded: (v: number | '') => void;
  employeeBand: EmployeeBand | '';
  setEmployeeBand: (v: EmployeeBand | '') => void;
  websiteUrl: string;
  setWebsiteUrl: (v: string) => void;
  registrationId: string;
  setRegistrationId: (v: string) => void;
  primaryMarkets: string;
  setPrimaryMarkets: (v: string) => void;
  annualVolumeBand: VolumeBand | '';
  setAnnualVolumeBand: (v: VolumeBand | '') => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <EditField label="Company name">
        <input
          type="text"
          value={props.companyName}
          disabled={props.disabled}
          onChange={(e) => props.setCompanyName(e.target.value)}
          placeholder="e.g. Lagos Exporter Co"
          maxLength={120}
          className="form-input"
        />
        <span className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          Editable to fix a misentry. Capped: once every 30 days, 5 lifetime.
        </span>
      </EditField>
      <EditField label="Sector">
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
      </EditField>
      <EditField label="Region">
        <input
          type="text"
          value={props.region}
          disabled={props.disabled}
          onChange={(e) => props.setRegion(e.target.value)}
          placeholder="e.g. Lagos, Nigeria"
          maxLength={80}
          className="form-input"
        />
      </EditField>
      <EditField label="Year founded">
        <input
          type="number"
          min={1800}
          max={2100}
          value={props.yearFounded}
          disabled={props.disabled}
          onChange={(e) =>
            props.setYearFounded(e.target.value === '' ? '' : Number(e.target.value))
          }
          placeholder="2018"
          className="form-input"
        />
      </EditField>
      <EditField label="Employee band">
        <select
          value={props.employeeBand}
          disabled={props.disabled}
          onChange={(e) => props.setEmployeeBand(e.target.value as EmployeeBand | '')}
          className="form-input"
        >
          {EMPLOYEE_BAND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </EditField>
      <EditField label="Website">
        <input
          type="url"
          value={props.websiteUrl}
          disabled={props.disabled}
          onChange={(e) => props.setWebsiteUrl(e.target.value)}
          placeholder="https://example.com"
          maxLength={200}
          className="form-input"
        />
      </EditField>
      <EditField label="Reg / Tax ID">
        <input
          type="text"
          value={props.registrationId}
          disabled={props.disabled}
          onChange={(e) => props.setRegistrationId(e.target.value)}
          placeholder="e.g. trade-license / reg no."
          maxLength={60}
          className="form-input"
        />
      </EditField>
      <EditField label="Primary markets">
        <input
          type="text"
          value={props.primaryMarkets}
          disabled={props.disabled}
          onChange={(e) => props.setPrimaryMarkets(e.target.value)}
          placeholder="e.g. MEASA, EU"
          maxLength={200}
          className="form-input"
        />
      </EditField>
      <EditField label="Annual volume">
        <select
          value={props.annualVolumeBand}
          disabled={props.disabled}
          onChange={(e) => props.setAnnualVolumeBand(e.target.value as VolumeBand | '')}
          className="form-input"
        >
          {VOLUME_BAND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </EditField>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function RepayRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'neutral' | 'critical';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-[var(--lp-positive)] font-extrabold'
      : tone === 'critical'
        ? 'text-[var(--lp-critical)] font-extrabold'
        : 'text-[var(--lp-dark)] font-bold';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </dt>
      <dd className={cn('text-[18px] tabular-nums', valueClass)}>{value}</dd>
    </div>
  );
}
