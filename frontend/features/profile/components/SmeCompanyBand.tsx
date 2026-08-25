'use client';
import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/core/api';
import { SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Hint } from '@/shared/components/Hint';

// Hoisted constants per Vercel `rendering-hoist-jsx`, never re-allocated
// per render. Static option lists for the native <select> inputs.
// The VALUE is what the API stores and must never be translated. The label is
// resolved from the locale at render, so these stay hoisted while the copy
// follows the reader.
const SECTOR_VALUES = [
  'agriculture', 'textiles', 'electronics', 'logistics', 'manufacturing', 'services', 'other',
] as const;

const EMPLOYEE_BAND_VALUES = ['micro', 'small', 'medium'] as const;

/// Stored value to message key. The stored values start with a digit, which is
/// not a legal identifier, so the two cannot simply share a name.
const VOLUME_BAND_KEYS = {
  under_100k: 'under100k',
  '100k_1m': 'from100kTo1m',
  '1m_10m': 'from1mTo10m',
  over_10m: 'over10m',
} as const;

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
export function SmeCompanyBand({
  address,
  fallbackName,
  startEditing = false,
  verificationMode = false,
  onSaved,
}: {
  address: string;
  /// The account display name. When the structured company name was never set
  /// (a business whose sign-up crammed "Name, sector, region" into displayName),
  /// we seed the editable name field from this so the user can correct the long
  /// value in place instead of finding a blank field. Saving then writes the
  /// clean name back to both the company name and the display name.
  fallbackName?: string;
  startEditing?: boolean;
  verificationMode?: boolean;
  onSaved?: (profile: { companyName: string; sector: string; region: string }) => void;
}) {
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
  const [minOrderValue, setMinOrderValue] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState<number | ''>('');
  const [certifications, setCertifications] = useState('');
  const [hideFromDiscovery, setHideFromDiscovery] = useState(false);
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
          setMinOrderValue(r.smeProfile.minOrderValue ?? '');
          setLeadTimeDays(r.smeProfile.leadTimeDays ?? '');
          setCertifications(r.smeProfile.certifications ?? '');
          setHideFromDiscovery(r.smeProfile.hideFromDiscovery ?? false);
          setVerifiedAt(r.smeProfile.verifiedAt ?? null);
        }
        // Seed the name from the account display name when the structured company
        // name was never set, so a business can correct a long sign-up name in
        // place rather than staring at a blank field.
        if (!r.smeProfile?.companyName && fallbackName) {
          setCompanyName(fallbackName);
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
  }, [address, fallbackName]);

  // Reached via "Edit details" (which links to /profile?edit=company): open the
  // form in edit mode and scroll to the trade card itself, so the user lands
  // directly on the editable card instead of a blank strip above it.
  const searchParams = useSearchParams();
  const wantsEdit = searchParams.get('edit') === 'company' || startEditing;
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loaded || !wantsEdit) return;
    setEditing(true);
    const raf = requestAnimationFrame(() =>
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    return () => cancelAnimationFrame(raf);
  }, [loaded, wantsEdit]);

  async function save() {
    setError(null);
    if (verificationMode && (!companyName.trim() || !sector || !region.trim())) {
      setError(t.verificationRequired);
      return;
    }
    setSaving(true);
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
          minOrderValue: minOrderValue.trim() || undefined,
          leadTimeDays: typeof leadTimeDays === 'number' ? leadTimeDays : undefined,
          certifications: certifications.trim() || undefined,
          hideFromDiscovery,
        },
      });
      setEditing(false);
      onSaved?.({ companyName: companyName.trim(), sector, region: region.trim() });
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  // Most accounts have no settled deals yet, so the stats card is absent and the
  // details card takes the full row on its own rather than sitting in a half
  // column with nothing beside it.
  const showRepayment = Boolean(repayment && repayment.windowDealCount > 0);

  const hasAny =
    companyName ||
    sector ||
    region ||
    yearFounded ||
    employeeBand ||
    websiteUrl ||
    registrationId ||
    primaryMarkets ||
    annualVolumeBand ||
    minOrderValue ||
    leadTimeDays ||
    certifications;

  const t = useTranslations().smeCompany;

  if (!loaded) {
    return (
      <div className="relative px-4 pb-9 md:px-8 md:pb-11">
        <SectionTag>{t.sectionTag}</SectionTag>
        <HeroHeadline size="md" as="h2">
          {t.loading}<Punc>…</Punc>
        </HeroHeadline>
      </div>
    );
  }

  // Same inset as the business block above. Without it the cards sat flush
  // against the identity panel's edge while every other block was indented.
  return (
    <div className="relative px-4 pb-9 md:px-8 md:pb-11">
      <div
        ref={cardRef}
        style={{ scrollMarginTop: 80 }}
        className="flex w-full items-end justify-between gap-4 flex-wrap"
      >
        <div>
          <SectionTag dot={verifiedAt ? 'live' : undefined}>{t.sectionTag}</SectionTag>
          <HeroHeadline size="md" as="h2">
            {t.headline}<Punc>.</Punc>
          </HeroHeadline>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 border border-[var(--lp-outline)] hover:border-[var(--lp-outline-hover)] transition-colors"
            style={{
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
          >
            {hasAny ? t.edit : t.addCompany}
          </button>
        ) : null}
      </div>

      {/* Matches the width of the business band above it: the identity panel is
          max-w-[1040px] and every other block in it runs full width, so a cap
          here left a dead column to the right of both cards. The details card
          carries far more rows than the stats card, so the split is weighted
          rather than even. */}
      <div
        className={cn(
          'mt-4 grid w-full min-w-0 gap-3 [&>*]:min-w-0',
          showRepayment && 'md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]',
        )}
      >
        <PageCard>
          <div className="p-4 md:p-5 space-y-2.5">
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
                minOrderValue={minOrderValue}
                setMinOrderValue={setMinOrderValue}
                leadTimeDays={leadTimeDays}
                setLeadTimeDays={setLeadTimeDays}
                certifications={certifications}
                setCertifications={setCertifications}
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
                minOrderValue={minOrderValue}
                leadTimeDays={leadTimeDays}
                certifications={certifications}
              />
            ) : (
              <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
{t.emptyBody}
              </p>
            )}
            {editing ? (
              <label className="flex items-start gap-3 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!hideFromDiscovery}
                  disabled={saving}
                  onChange={(e) => setHideFromDiscovery(!e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
                />
                <span className="min-w-0">
                  <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-dark)]">
                    {t.discovery.label}
                  </span>
                  <span className="mt-1 block text-[12px] leading-snug text-[var(--lp-text-sub)]">
{t.discovery.body}
                  </span>
                </span>
              </label>
            ) : null}
            {editing ? (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-60"
                  style={{
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 6,
                    borderBottomRightRadius: 2,
                  }}
                >
                  {saving ? t.saving : t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center px-2 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
                >
                  {t.cancel}
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
        {showRepayment && repayment ? (
          /* Sits at the top of its cell instead of stretching. Three stat rows
             cannot fill the height of a twelve-row details card, and a card
             padded out with empty space reads as unfinished. */
          <PageCard className="self-start">
            <div className="p-4 md:p-5">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {t.repayment.eyebrow}
              </p>
              <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                {t.repayment.windowTemplate.replace('{count}', String(repayment.windowDealCount))}
              </p>
              <dl className="mt-5 space-y-3.5">
                <RepayRow
                  label={t.repayment.onTimeRate}
                  value={`${Math.round(repayment.onTimeRate * 100)}%`}
                  tone={repayment.onTimeRate >= 0.8 ? 'positive' : repayment.onTimeRate >= 0.5 ? 'neutral' : 'critical'}
                />
                <RepayRow
                  label={t.repayment.avgDaysToSettle}
                  value={repayment.averageDaysToSettle.toFixed(1)}
                  tone="neutral"
                />
                <RepayRow
                  label={t.repayment.defaults}
                  value={String(repayment.defaultCount)}
                  tone={repayment.defaultCount === 0 ? 'positive' : 'critical'}
                />
              </dl>
            </div>
          </PageCard>
        ) : null}
      </div>
    </div>
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
  minOrderValue: string;
  leadTimeDays: number | '';
  certifications: string;
}) {
  const t = useTranslations().smeCompany;
  const volumeKey = VOLUME_BAND_KEYS[props.annualVolumeBand as keyof typeof VOLUME_BAND_KEYS];
  const volumeLabel = volumeKey ? t.volumeBands[volumeKey] : '';
  // A stored sector or band renders in the reader's language; anything the
  // lists no longer carry falls back to the raw value rather than vanishing.
  const sectorLabel =
    t.sectors[props.sector as keyof typeof t.sectors] ?? props.sector;
  const sizeLabel =
    t.employeeBands[props.employeeBand as keyof typeof t.employeeBands] ?? props.employeeBand;
  return (
    <dl className="space-y-3">
      <ViewRow label={t.view.name} value={props.companyName || '—'} />
      <ViewRow label={t.view.sector} value={props.sector ? sectorLabel : '—'} />
      <ViewRow label={t.view.region} value={props.region || '—'} />
      {props.yearFounded ? <ViewRow label={t.view.founded} value={String(props.yearFounded)} /> : null}
      {props.employeeBand ? (
        <ViewRow label={t.view.size} value={sizeLabel} />
      ) : null}
      {props.registrationId ? (
        <ViewRow label={t.view.regTaxId} value={props.registrationId} />
      ) : null}
      {props.primaryMarkets ? (
        <ViewRow label={t.view.markets} value={props.primaryMarkets} />
      ) : null}
      {volumeLabel ? <ViewRow label={t.view.annualVolume} value={volumeLabel} /> : null}
      {props.minOrderValue ? (
        <ViewRow label={t.view.minOrder} value={props.minOrderValue} />
      ) : null}
      {props.leadTimeDays ? (
        <ViewRow
          label={t.view.leadTime}
          value={t.view.leadTimeTemplate.replace('{days}', String(props.leadTimeDays))}
        />
      ) : null}
      {props.certifications ? (
        <ViewRow label={t.view.certifications} value={props.certifications} />
      ) : null}
      {props.websiteUrl ? (
        <ViewRow
          label={t.view.website}
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
          'text-[13.5px] text-[var(--lp-dark)] text-end',
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
  minOrderValue: string;
  setMinOrderValue: (v: string) => void;
  leadTimeDays: number | '';
  setLeadTimeDays: (v: number | '') => void;
  certifications: string;
  setCertifications: (v: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations().smeCompany;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <EditField fieldKey="company-name" label={t.form.companyName} hint={t.form.hints.companyName}>
        <input
          type="text"
          value={props.companyName}
          disabled={props.disabled}
          onChange={(e) => props.setCompanyName(e.target.value)}
          placeholder={t.form.companyNamePlaceholder}
          maxLength={120}
          className="form-input"
        />
      </EditField>
      <EditField fieldKey="sector" label={t.form.sector} hint={t.form.hints.sector}>
        <select
          value={props.sector}
          disabled={props.disabled}
          onChange={(e) => props.setSector(e.target.value as Sector | '')}
          className="form-input"
        >
          <option value="">—</option>
          {SECTOR_VALUES.map((v) => (
            <option key={v} value={v}>
              {t.sectors[v]}
            </option>
          ))}
        </select>
      </EditField>
      <EditField fieldKey="region" label={t.form.region} hint={t.form.hints.region}>
        <input
          type="text"
          value={props.region}
          disabled={props.disabled}
          onChange={(e) => props.setRegion(e.target.value)}
          placeholder={t.form.regionPlaceholder}
          maxLength={80}
          className="form-input"
        />
      </EditField>
      <EditField fieldKey="year-founded" label={t.form.yearFounded} hint={t.form.hints.yearFounded}>
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
      <EditField fieldKey="employee-band" label={t.form.employeeBand} hint={t.form.hints.employeeBand}>
        <select
          value={props.employeeBand}
          disabled={props.disabled}
          onChange={(e) => props.setEmployeeBand(e.target.value as EmployeeBand | '')}
          className="form-input"
        >
          <option value="">—</option>
          {EMPLOYEE_BAND_VALUES.map((v) => (
            <option key={v} value={v}>
              {t.employeeBands[v]}
            </option>
          ))}
        </select>
      </EditField>
      <EditField fieldKey="website" label={t.form.website} hint={t.form.hints.website}>
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
      <EditField fieldKey="registration-id" label={t.form.regTaxId} hint={t.form.hints.regTaxId}>
        <input
          type="text"
          value={props.registrationId}
          disabled={props.disabled}
          onChange={(e) => props.setRegistrationId(e.target.value)}
          placeholder={t.form.regTaxIdPlaceholder}
          maxLength={60}
          className="form-input"
        />
      </EditField>
      <EditField fieldKey="primary-markets" label={t.form.primaryMarkets} hint={t.form.hints.primaryMarkets}>
        <input
          type="text"
          value={props.primaryMarkets}
          disabled={props.disabled}
          onChange={(e) => props.setPrimaryMarkets(e.target.value)}
          placeholder={t.form.primaryMarketsPlaceholder}
          maxLength={200}
          className="form-input"
        />
      </EditField>
      <EditField fieldKey="annual-volume" label={t.form.annualVolume} hint={t.form.hints.annualVolume}>
        <select
          value={props.annualVolumeBand}
          disabled={props.disabled}
          onChange={(e) => props.setAnnualVolumeBand(e.target.value as VolumeBand | '')}
          className="form-input"
        >
          <option value="">—</option>
          {(Object.keys(VOLUME_BAND_KEYS) as Array<keyof typeof VOLUME_BAND_KEYS>).map((v) => (
            <option key={v} value={v}>
              {t.volumeBands[VOLUME_BAND_KEYS[v]]}
            </option>
          ))}
        </select>
      </EditField>
      <EditField fieldKey="min-order" label={t.form.minOrder} hint={t.form.hints.minOrder}>
        <input
          type="text"
          value={props.minOrderValue}
          disabled={props.disabled}
          onChange={(e) => props.setMinOrderValue(e.target.value)}
          placeholder={t.form.minOrderPlaceholder}
          maxLength={60}
          className="form-input"
        />
      </EditField>
      <EditField fieldKey="lead-time" label={t.form.leadTimeDays} hint={t.form.hints.leadTimeDays}>
        <input
          type="number"
          min={0}
          max={3650}
          value={props.leadTimeDays}
          disabled={props.disabled}
          onChange={(e) =>
            props.setLeadTimeDays(e.target.value === '' ? '' : Number(e.target.value))
          }
          placeholder={t.form.leadTimePlaceholder}
          className="form-input"
        />
      </EditField>
      <EditField fieldKey="certifications" label={t.form.certifications} hint={t.form.hints.certifications}>
        <input
          type="text"
          value={props.certifications}
          disabled={props.disabled}
          onChange={(e) => props.setCertifications(e.target.value)}
          placeholder={t.form.certificationsPlaceholder}
          maxLength={200}
          className="form-input"
        />
      </EditField>
    </div>
  );
}

function EditField({
  fieldKey,
  label,
  hint,
  children,
}: {
  fieldKey: string;
  label: string;
  hint: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = `sme-field-${fieldKey}`;
  return (
    <div className="block space-y-2">
      <div className="flex min-h-7 items-center gap-1">
        <label
          htmlFor={id}
          className="mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]"
        >
          {label}
        </label>
        <Hint side="bottom" align="start">{hint}</Hint>
      </div>
      {cloneElement(children, { id })}
    </div>
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
