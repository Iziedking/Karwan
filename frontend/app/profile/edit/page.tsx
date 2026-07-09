'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FormError } from '@/shared/components/FormError';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { api, ApiError, type UserRole } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  CTAPill,
} from '@/shared/components/Bands';
import { isBusinessAccount } from '@/features/account/accountKind';

// Matches the onboarding form inputs so edit and setup look identical.
const INPUT_CLS =
  'w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] transition-colors';

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
  const router = useRouter();
  const t = useTranslations().profile;
  const ob = useTranslations().onboarding;
  const { profile, address, fetchState } = useUserProfile();

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
  const isBusiness = isBusinessAccount(profile);

  // Prefill from the saved profile once. A signed-in user with no profile has
  // not onboarded yet, so send them to onboarding rather than an empty form.
  useEffect(() => {
    if (hydrated) return;
    if (fetchState === 'success' && !profile) {
      router.replace('/onboarding');
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

  // Section numbers renumber when the Identity block is hidden (business) so the
  // list never starts at 02 or skips a number.
  const showIdentity = !isBusiness;
  const sellerNo = String((showIdentity ? 1 : 0) + 1).padStart(2, '0');
  const buyerNo = String((showIdentity ? 1 : 0) + (wantsSeller ? 2 : 1)).padStart(2, '0');

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

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="max-w-3xl mx-auto">
          <div className="fade-up">
            <SectionTag tone="dark">{t.hero.sectionTag}</SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline size="md">
              Edit your <Accent>profile</Accent>
              <Punc>.</Punc>
            </HeroHeadline>
          </div>
        </div>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-3xl mx-auto space-y-6 fade-up">
          <RoleSelector role={role} onChange={setRole} disabled={saving} />

          {showIdentity && (
            <Section number="01" title="Identity">
              <FieldLabel label="Display name">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                  className={INPUT_CLS}
                />
              </FieldLabel>
            </Section>
          )}

          {wantsSeller && (
            // Same field, same matching keywords, different vocabulary. A business
            // supplies goods and categories; only an individual has skills.
            <Section number={sellerNo} title={isBusiness ? 'As a supplier' : 'As a seller'}>
              <FieldLabel
                label={
                  isBusiness
                    ? 'What you supply (comma separated)'
                    : 'Skills (comma separated)'
                }
              >
                <input
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder={
                    isBusiness ? 'e.g. textiles, woven cotton, apparel' : undefined
                  }
                  className={INPUT_CLS}
                />
              </FieldLabel>
              <FieldLabel label={isBusiness ? 'What your company does' : 'Short bio'}>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className={cn(INPUT_CLS, 'resize-none')} />
              </FieldLabel>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Min budget (USDC)" value={sellerMin} onChange={setSellerMin} />
                <NumberField label="Max budget (USDC)" value={sellerMax} onChange={setSellerMax} />
                <NumberField label="Min days" value={sellerMinDays} onChange={setSellerMinDays} />
                <NumberField label="Max days" value={sellerMaxDays} onChange={setSellerMaxDays} />
              </div>
            </Section>
          )}

          {wantsBuyer && (
            <Section number={buyerNo} title="As a buyer">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Max budget (USDC)" value={buyerMax} onChange={setBuyerMax} />
                <NumberField label="Min days" value={buyerMinDays} onChange={setBuyerMinDays} />
                <NumberField label="Max days" value={buyerMaxDays} onChange={setBuyerMaxDays} />
              </div>
              <FieldLabel label="Milestone split (must total 100)">
                <input value={milestoneSplit} onChange={(e) => setMilestoneSplit(e.target.value)} className={cn(INPUT_CLS, 'mono')} />
              </FieldLabel>
            </Section>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.push('/profile')}
              disabled={saving}
              className="group inline-flex items-center gap-2 mono text-[12px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors"
            >
              <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">←</span>
              {ob.roleStep.backArrow}
            </button>
            <CTAPill onClick={save} disabled={!canSave} tone="light">
              {saving ? 'Saving…' : 'Save changes'}
            </CTAPill>
          </div>
          {error && <FormError>{error}</FormError>}
        </div>
      </Band>
    </FullBleed>
  );
}

function RoleSelector({
  role,
  onChange,
  disabled,
}: {
  role: UserRole;
  onChange: (r: UserRole) => void;
  disabled?: boolean;
}) {
  const opts: { value: UserRole; label: string }[] = [
    { value: 'seller', label: 'Seller' },
    { value: 'buyer', label: 'Buyer' },
    { value: 'both', label: 'Both' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const sel = role === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={sel}
            className={cn(
              'rounded-md border px-3 py-2.5 mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors',
              sel
                ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-accent)]'
                : 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-text-sub)] hover:border-[var(--lp-dark)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <section
      className="overflow-hidden"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.08)',
      }}
    >
      <header className="px-6 pt-5 pb-4 border-b border-[var(--lp-border-light)] flex items-baseline gap-3">
        <span className="font-sans text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]/30 leading-none">
          {number}
        </span>
        <h2 className="font-sans text-[18px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
          {title}
        </h2>
      </header>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">{label}</span>
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
    <FieldLabel label={label}>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value));
        }}
        className={cn(INPUT_CLS, 'mono')}
      />
    </FieldLabel>
  );
}
