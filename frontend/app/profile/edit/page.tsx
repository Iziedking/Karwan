'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FormError } from '@/shared/components/FormError';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { api, ApiError, type UserRole } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { Hint } from '@/shared/components/Hint';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { editBlockers, splitPercents, type EditBlocker } from '@/features/profile/editRules';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

/// Dedicated profile edit. A first-class route, NOT the onboarding flow: no
/// language / connect / role-pick steps (and no flash of them), just the
/// prefilled form. AuthGuard gates it to a signed-in user, and the save writes
/// only the caller's own profile (api.saveProfile is session-self gated), so
/// nothing leaks. Save and cancel both return to /profile.
export default function ProfileEditPage() {
  const t = useTranslations().profile;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <ProfileEditInner />
    </AuthGuard>
  );
}

function ProfileEditInner() {
  const pe = useTranslations().profileEdit;
  const router = useRouter();
  const t = useTranslations().profile;
  const simple = t.simple;
  const { profile, address, fetchState } = useUserProfile();
  const { isBusinessWorkspace } = useWorkspaceContext();

  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState<UserRole>('both');
  const [displayName, setDisplayName] = useState('');
  const [skills, setSkills] = useState('');
  const [bio, setBio] = useState('');
  const [sellerMin, setSellerMin] = useState(50);
  const [sellerMax, setSellerMax] = useState(2000);
  const [sellerMinDays, setSellerMinDays] = useState(1);
  const [sellerMaxDays, setSellerMaxDays] = useState(30);
  const [buyerMax, setBuyerMax] = useState(5000);
  const [buyerMinDays, setBuyerMinDays] = useState(1);
  const [buyerMaxDays, setBuyerMaxDays] = useState(60);
  const [milestoneSplit, setMilestoneSplit] = useState('50,50');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A business sets its NAME + trade card on /profile?edit=company, so the
  // display-name field is hidden on this form (below) to keep the two name
  // surfaces from fighting. But the agent RANGES (budgets, deadlines, skills,
  // milestones) still live here and are identical for both account kinds, so a
  // business must be able to reach this editor. No redirect.
  const isBusiness = isBusinessWorkspace;

  // Prefill from the saved profile once. A signed-in user with no profile has
  // not onboarded yet, so send them to onboarding rather than an empty form.
  useEffect(() => {
    if (hydrated) return;
    if (fetchState === 'success' && !profile) {
      router.replace('/start?mode=signup');
      return;
    }
    if (!profile) return;
    setRole(profile.role);
    setDisplayName(profile.displayName ?? '');
    if (profile.seller) {
      setSkills(profile.seller.skills.join(', '));
      setBio(profile.seller.bio ?? '');
      setSellerMin(profile.seller.minBudgetUsdc);
      setSellerMax(profile.seller.maxBudgetUsdc);
      setSellerMinDays(profile.seller.minDeadlineDays);
      setSellerMaxDays(profile.seller.maxDeadlineDays);
    }
    if (profile.buyer) {
      setBuyerMax(profile.buyer.maxBudgetUsdc);
      setBuyerMinDays(profile.buyer.minDeadlineDays);
      setBuyerMaxDays(profile.buyer.maxDeadlineDays);
      setMilestoneSplit(profile.buyer.milestonePcts.join(','));
    }
    setHydrated(true);
  }, [profile, fetchState, hydrated, router]);

  // The summary's Edit links land on their card (#selling, #buying). The form
  // renders after the profile loads, so the browser's own jump comes too early.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.location.hash.slice(1);
    if (id === 'selling' || id === 'buying') document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [hydrated]);

  const wantsSeller = role === 'seller' || role === 'both';
  const wantsBuyer = role === 'buyer' || role === 'both';

  const showIdentity = !isBusiness;

  const blockers = editBlockers({
    role,
    needsName: showIdentity,
    displayName,
    skills,
    bio,
    sellerMin,
    sellerMax,
    sellerMinDays,
    sellerMaxDays,
    buyerMax,
    buyerMinDays,
    buyerMaxDays,
    split: milestoneSplit,
  });
  const blocked = (key: EditBlocker) => blockers.includes(key);
  const canSave = !saving && blockers.length === 0;

  async function save() {
    if (!address || !canSave) return;
    setSaving(true);
    setError(null);
    const milestonePcts = splitPercents(milestoneSplit);
    try {
      await api.saveProfile({
        address,
        role,
        accountKind: profile?.accountKind ?? 'person',
        displayName: displayName.trim(),
        ...(wantsSeller && {
          seller: {
            skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
            bio,
            minBudgetUsdc: sellerMin,
            maxBudgetUsdc: sellerMax,
            minDeadlineDays: sellerMinDays,
            maxDeadlineDays: sellerMaxDays,
          },
        }),
        ...(wantsBuyer && {
          buyer: {
            maxBudgetUsdc: buyerMax,
            minDeadlineDays: buyerMinDays,
            maxDeadlineDays: buyerMaxDays,
            milestonePcts,
          },
        }),
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('karwan:profile-saved'));
      router.push('/profile');
    } catch (err) {
      // The server's own words stay in the console; the page says it plainly.
      console.warn('profile save failed', err instanceof ApiError ? err.detail ?? err.message : err);
      setError(pe.saveFailed);
      setSaving(false);
    }
  }

  const splitText = milestoneSplit.replace(/\s/g, '');
  const splitLabel = (value: string) => value.split(',').map((part) => `${part}%`).join(' / ');
  const presetSplits = ['50,50', '30,70'];
  const customSplit = !presetSplits.includes(splitText);
  const roles: { value: UserRole; label: string }[] = [
    { value: 'seller', label: simple.sell },
    { value: 'buyer', label: simple.buy },
    { value: 'both', label: simple.both },
  ];

  return (
    <ProfileFrame title={t.hub.editProfile}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-7"
      >
        <FormCard title={pe.you}>
          {showIdentity ? (
            <Field label={pe.displayName}>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="form-input" />
              <Need when={blocked('name')}>{pe.needs.name}</Need>
            </Field>
          ) : null}
          <div role="group" aria-label={simple.useKarwanTo}>
            <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{simple.useKarwanTo}</p>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-[var(--tint)] p-1">
              {roles.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={role === option.value}
                  disabled={saving}
                  onClick={() => setRole(option.value)}
                  className={cn(SEGMENT, role === option.value ? SEGMENT_ON : SEGMENT_OFF)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </FormCard>

        {wantsSeller ? (
          <FormCard id="selling" title={simple.sellingAgent}>
            <Field label={isBusiness ? t.agentProfiles.rows.supplies : simple.whatYouOffer} hint={pe.tips.offer}>
              <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder={isBusiness ? 'textiles, woven cotton, apparel' : 'logo design, branding'} className="form-input" />
              <Need when={blocked('offer')}>{pe.needs.offer}</Need>
            </Field>
            <Field label={pe.offerDescription} hint={pe.tips.description}>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="form-input form-textarea" />
              <Need when={blocked('bio')}>{pe.needs.bio}</Need>
            </Field>
            <RangeField label={simple.priceRange} hint={pe.tips.sellerPrice} unit="USDC" from={sellerMin} to={sellerMax} onFrom={setSellerMin} onTo={setSellerMax} fromAria={pe.from} toAria={pe.to}>
              <Need when={blocked('sellerPrice')}>{pe.needs.price}</Need>
            </RangeField>
            <RangeField label={simple.deliveryTime} hint={pe.tips.sellerDays} unit={pe.days} from={sellerMinDays} to={sellerMaxDays} onFrom={setSellerMinDays} onTo={setSellerMaxDays} fromAria={pe.from} toAria={pe.to}>
              <Need when={blocked('sellerDays')}>{pe.needs.days}</Need>
            </RangeField>
          </FormCard>
        ) : null}

        {wantsBuyer ? (
          <FormCard id="buying" title={simple.buyingAgent}>
            <Field label={simple.mostItMayPay} hint={pe.tips.buyerMax}>
              <UnitInput value={buyerMax} onChange={setBuyerMax} unit="USDC" />
              <Need when={blocked('buyerMax')}>{pe.needs.buyerMax}</Need>
            </Field>
            <RangeField label={simple.deliveryTime} hint={pe.tips.buyerDays} unit={pe.days} from={buyerMinDays} to={buyerMaxDays} onFrom={setBuyerMinDays} onTo={setBuyerMaxDays} fromAria={pe.from} toAria={pe.to}>
              <Need when={blocked('buyerDays')}>{pe.needs.days}</Need>
            </RangeField>
            <div role="group" aria-label={simple.paymentSplit}>
              <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
                {simple.paymentSplit}
                <Hint>{pe.tips.split}</Hint>
              </p>
              <div className="grid grid-cols-3 gap-1 rounded-full bg-[var(--tint)] p-1">
                {presetSplits.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={splitText === value}
                    onClick={() => setMilestoneSplit(value)}
                    className={cn(SEGMENT, splitText === value ? SEGMENT_ON : SEGMENT_OFF)}
                  >
                    {splitLabel(value)}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={customSplit}
                  onClick={() => { if (!customSplit) setMilestoneSplit('40,60'); }}
                  className={cn(SEGMENT, customSplit ? SEGMENT_ON : SEGMENT_OFF)}
                >
                  {pe.custom}
                </button>
              </div>
              {customSplit ? (
                <span className="mt-2 block w-40">
                  <input value={milestoneSplit} onChange={(e) => setMilestoneSplit(e.target.value)} aria-label={pe.milestoneSplit} className="form-input tabular-nums" />
                </span>
              ) : null}
              <Need when={blocked('split')}>{pe.needs.split}</Need>
            </div>
          </FormCard>
        ) : null}

        {error ? <FormError>{error}</FormError> : null}
        {/* Save stays in reach while the form scrolls, above the phone's bottom bar. */}
        <div data-sticky-save className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 rounded-full bg-[var(--canvas)] p-1 lg:bottom-4">
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--lp-band-dark)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? simple.saving : simple.save}
          </button>
        </div>
      </form>
    </ProfileFrame>
  );
}

const SEGMENT = 'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-2 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)] disabled:opacity-50';
const SEGMENT_ON = 'bg-[var(--lp-card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--lp-border-light)]';
const SEGMENT_OFF = 'text-[var(--ink-secondary)] hover:text-[var(--ink)]';

/// One titled card, the way Profile groups its rows.
function FormCard({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-2 px-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">{title}</h2>
      <div className="space-y-5 rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">{children}</div>
    </section>
  );
}

/// What a field needs before Save turns on, said under it.
function Need({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? <span className="block text-[14px] font-medium text-[var(--color-critical)]">{children}</span> : null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
        {label}
        {hint ? <Hint>{hint}</Hint> : null}
      </span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, ariaLabel }: { value: number; onChange: (n: number) => void; ariaLabel?: string }) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''));
  useEffect(() => {
    setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value));
      }}
      className="form-input form-input-num min-w-0 flex-1"
    />
  );
}

/// A number with its unit beside it, inside the field's row.
function UnitInput({ value, onChange, unit, ariaLabel }: { value: number; onChange: (n: number) => void; unit: string; ariaLabel?: string }) {
  return (
    <span className="flex items-center gap-2">
      <NumberInput value={value} onChange={onChange} ariaLabel={ariaLabel} />
      <span className="shrink-0 text-[14px] font-medium text-[var(--ink-secondary)]">{unit}</span>
    </span>
  );
}

/// A range on one line: from, to, then the unit once.
function RangeField({
  label,
  hint,
  unit,
  from,
  to,
  onFrom,
  onTo,
  fromAria,
  toAria,
  children,
}: {
  label: string;
  hint?: string;
  unit: string;
  from: number;
  to: number;
  onFrom: (n: number) => void;
  onTo: (n: number) => void;
  fromAria: string;
  toAria: string;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-dark)]">
        {label}
        {hint ? <Hint>{hint}</Hint> : null}
      </p>
      <div className="flex items-center gap-2">
        <NumberInput value={from} onChange={onFrom} ariaLabel={`${label}, ${fromAria}`} />
        <span aria-hidden className="text-[var(--ink-secondary)]">–</span>
        <NumberInput value={to} onChange={onTo} ariaLabel={`${label}, ${toAria}`} />
        <span className="shrink-0 text-[14px] font-medium text-[var(--ink-secondary)]">{unit}</span>
      </div>
      {children}
    </div>
  );
}
