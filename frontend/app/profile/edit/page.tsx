'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FormError } from '@/shared/components/FormError';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { api, ApiError, type UserRole } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { Hint } from '@/shared/components/Hint';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { TERMS_COPY } from '@/features/deals/terms/termsCopy';
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
  const { locale } = useLocale();
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

  const wantsSeller = role === 'seller' || role === 'both';
  const wantsBuyer = role === 'buyer' || role === 'both';

  const showIdentity = !isBusiness;

  const canSave = (() => {
    if (saving || !displayName.trim()) return false;
    if (wantsSeller) {
      if (skills.split(',').map((s) => s.trim()).filter(Boolean).length === 0) return false;
      if (!bio.trim()) return false;
      if (!(sellerMin > 0) || !(sellerMax > sellerMin)) return false;
      if (!(sellerMinDays > 0) || !(sellerMaxDays >= sellerMinDays)) return false;
    }
    if (wantsBuyer) {
      if (!(buyerMax > 0)) return false;
      if (!(buyerMinDays > 0) || !(buyerMaxDays >= buyerMinDays)) return false;
      const pcts = milestoneSplit.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      if (pcts.length === 0 || pcts.reduce((a, b) => a + b, 0) !== 100) return false;
    }
    return true;
  })();

  async function save() {
    if (!address || !canSave) return;
    setSaving(true);
    setError(null);
    const milestonePcts = milestoneSplit.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
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
      const raw =
        err instanceof ApiError ? (err.detail as unknown) ?? err.message : (err as Error).message;
      setError(typeof raw === 'string' ? raw : JSON.stringify(raw));
      setSaving(false);
    }
  }

  const splitText = milestoneSplit.replace(/\s/g, '');
  const presetSplits = [
    { value: '50,50', label: TERMS_COPY[locale].payHalf },
    { value: '30,70', label: TERMS_COPY[locale].payThirty },
  ];
  const customSplit = !presetSplits.some((preset) => preset.value === splitText);
  const roles: { value: UserRole; label: string }[] = [
    { value: 'seller', label: simple.sell },
    { value: 'buyer', label: simple.buy },
    { value: 'both', label: simple.both },
  ];

  return (
    <ProfileFrame title={simple.profileTitle}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-7"
      >
        {showIdentity ? (
          <Field label={pe.displayName}>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="form-input" />
          </Field>
        ) : null}

        <div role="group" aria-label={simple.useKarwanTo}>
          <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{simple.useKarwanTo}</p>
          <div className="flex flex-wrap gap-2">
            {roles.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={role === option.value}
                disabled={saving}
                onClick={() => setRole(option.value)}
                className={cn(CHIP, role === option.value ? CHIP_ON : CHIP_OFF)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {wantsSeller ? (
          <section className="space-y-4">
            <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{simple.sellingAgent}</h2>
            <Field label={isBusiness ? t.agentProfiles.rows.supplies : simple.whatYouOffer} hint={simple.skillsHint}>
              <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder={isBusiness ? 'textiles, woven cotton, apparel' : 'logo design, branding'} className="form-input" />
            </Field>
            <Field label={simple.aboutYou}>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="form-input form-textarea" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={pe.minBudget} value={sellerMin} onChange={setSellerMin} />
              <NumberField label={pe.maxBudget} value={sellerMax} onChange={setSellerMax} />
              <NumberField label={pe.minDays} value={sellerMinDays} onChange={setSellerMinDays} />
              <NumberField label={pe.maxDays} value={sellerMaxDays} onChange={setSellerMaxDays} />
            </div>
          </section>
        ) : null}

        {wantsBuyer ? (
          <section className="space-y-4">
            <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{simple.buyingAgent}</h2>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={simple.mostItMayPay} value={buyerMax} onChange={setBuyerMax} />
              <span aria-hidden />
              <NumberField label={pe.minDays} value={buyerMinDays} onChange={setBuyerMinDays} />
              <NumberField label={pe.maxDays} value={buyerMaxDays} onChange={setBuyerMaxDays} />
            </div>
            <div role="group" aria-label={simple.paymentSplit}>
              <p className="mb-2 text-[14px] font-semibold text-[var(--lp-dark)]">{simple.paymentSplit}</p>
              <div className="flex flex-wrap gap-2">
                {presetSplits.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={splitText === preset.value}
                    onClick={() => setMilestoneSplit(preset.value)}
                    className={cn(CHIP, splitText === preset.value ? CHIP_ON : CHIP_OFF)}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={customSplit}
                  onClick={() => { if (!customSplit) setMilestoneSplit('40,60'); }}
                  className={cn(CHIP, customSplit ? CHIP_ON : CHIP_OFF)}
                >
                  {TERMS_COPY[locale].payCustom}
                </button>
              </div>
              {customSplit ? (
                <span className="mt-2 block w-40">
                  <input value={milestoneSplit} onChange={(e) => setMilestoneSplit(e.target.value)} aria-label={pe.milestoneSplit} className="form-input tabular-nums" />
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {error ? <FormError>{error}</FormError> : null}
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--lp-accent)] px-6 text-[15px] font-semibold text-[var(--lp-band-dark)] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
        >
          {saving ? simple.saving : simple.save}
        </button>
      </form>
    </ProfileFrame>
  );
}

const CHIP = 'inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)] disabled:opacity-50';
const CHIP_ON = 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]';
const CHIP_OFF = 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]';

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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''));
  useEffect(() => {
    setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value));
        }}
        className="form-input form-input-num"
      />
    </Field>
  );
}
