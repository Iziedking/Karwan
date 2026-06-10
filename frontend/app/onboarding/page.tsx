'use client';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginModal } from '@/shared/components/LoginModal';
import { api, ApiError, type UserRole } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { LanguagePicker } from '@/features/settings/components/LanguagePicker';
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
import { cn } from '@/shared/utils/cn';

// Next.js 15 requires useSearchParams() to live inside a Suspense boundary
// when the page is statically prerendered. Wrapping the inner component
// satisfies that. The fallback is the same dark band we'd render once the
// search params resolve, so the transition is invisible.
export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingShell />}>
      <OnboardingInner />
    </Suspense>
  );
}

function OnboardingShell() {
  const t = useTranslations().onboarding;
  return (
    <FullBleed>
      {/* Reserve roughly the height of the resolved onboarding step content
          so the footer doesn't shift down when OnboardingInner mounts and
          the page grows. Speed Insights showed footer.bg-[var(--lp-light)]
          shifting 0.27 on /onboarding, dominated by this exact fallback →
          real-content swap. 80vh covers the typical "PICK YOUR LANGUAGE"
          step (the LCP step the user lands on); subsequent steps are
          shorter and don't push the footer further. */}
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="max-w-[60ch] mx-auto text-center min-h-[80vh]">
          <span className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.18em] text-white/65">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
            {t.signUpTag}
          </span>
        </div>
      </Band>
    </FullBleed>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const search = useSearchParams();
  // ?edit=1 means the user came from "Edit details" on /profile. In that mode
  // we don't auto-redirect when a profile exists; we pre-fill the form so they
  // can change fields. Without the flag, /onboarding is the first-time setup
  // and a present profile means "you've already onboarded, go home."
  const editMode = search.get('edit') === '1';
  const auth = useAuth();
  const address = auth.address ?? undefined;
  const isConnected = auth.isAuthenticated;
  const [loginOpen, setLoginOpen] = useState(false);
  const [step, setStep] = useState<'language' | 'connect' | 'role' | 'profile' | 'review'>(
    'language',
  );
  const t = useTranslations();
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState('');

  // seller fields
  const [skills, setSkills] = useState('');
  const [bio, setBio] = useState('');
  const [sellerMin, setSellerMin] = useState(50);
  const [sellerMax, setSellerMax] = useState(2000);
  const [sellerMinDays, setSellerMinDays] = useState(1);
  const [sellerMaxDays, setSellerMaxDays] = useState(30);

  // buyer fields
  const [buyerMax, setBuyerMax] = useState(5000);
  const [buyerMinDays, setBuyerMinDays] = useState(1);
  const [buyerMaxDays, setBuyerMaxDays] = useState(60);
  const [bidWindow, setBidWindow] = useState(30);
  const [milestoneSplit, setMilestoneSplit] = useState('50,50');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationIssues: string[] = (() => {
    if (!role) return [];
    const v = t.onboarding.validation;
    const issues: string[] = [];
    if (!displayName.trim()) issues.push(v.displayName);

    const wantsSeller = role === 'seller' || role === 'both';
    const wantsBuyer = role === 'buyer' || role === 'both';

    if (wantsSeller) {
      const cleanSkills = skills.split(',').map((s) => s.trim()).filter(Boolean);
      if (cleanSkills.length === 0) issues.push(v.skills);
      if (!bio.trim()) issues.push(v.bio);
      if (!(sellerMin > 0)) issues.push(v.sellerMinBudget);
      if (!(sellerMax > sellerMin)) issues.push(v.sellerMaxBudget);
      if (!(sellerMinDays > 0)) issues.push(v.sellerMinDeadline);
      if (!(sellerMaxDays >= sellerMinDays)) issues.push(v.sellerMaxDeadline);
    }

    if (wantsBuyer) {
      if (!(buyerMax > 0)) issues.push(v.buyerMaxBudget);
      if (!(bidWindow >= 10)) issues.push(v.bidWindow);
      if (!(buyerMinDays > 0)) issues.push(v.buyerMinDeadline);
      if (!(buyerMaxDays >= buyerMinDays)) issues.push(v.buyerMaxDeadline);
      const pcts = milestoneSplit
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      const sum = pcts.reduce((a, b) => a + b, 0);
      if (pcts.length === 0) issues.push(v.splitEmpty);
      else if (sum !== 100) issues.push(v.splitSum.replace('{sum}', String(sum)));
    }

    return issues;
  })();

  const canSubmit = !!role && validationIssues.length === 0 && !submitting;

  useEffect(() => {
    // Auto-skip the wallet-connect step when wagmi reconnects from cache,
    // but NEVER skip the language step. A returning visitor with a cached
    // wallet still needs to confirm or change their language before the
    // rest of onboarding renders in it.
    if (isConnected && step === 'connect') setStep('role');
  }, [isConnected, step]);

  // True from when we know there's an address until we either finish the
  // profile check (no profile → reveal the form) or fire a redirect (profile
  // exists → stay loading until the route changes). Prevents the body from
  // flashing on returning users with a cached wallet.
  const [profileGate, setProfileGate] = useState(false);

  useEffect(() => {
    if (!address) {
      setProfileGate(false);
      return;
    }
    setProfileGate(true);
    let cancelled = false;
    api
      .getProfile(address)
      .then((res) => {
        if (cancelled) return;
        if (!res.profile) {
          setProfileGate(false);
          return;
        }
        if (!editMode) {
          router.replace('/app');
          // Keep the gate up; we're navigating away.
          return;
        }
        // Edit mode: hydrate the form fields from the saved profile so the
        // user is editing what they have rather than starting from blank.
        const p = res.profile;
        setRole(p.role);
        setDisplayName(p.displayName ?? '');
        if (p.seller) {
          setSkills(p.seller.skills.join(', '));
          setBio(p.seller.bio ?? '');
          setSellerMin(p.seller.minBudgetUsdc);
          setSellerMax(p.seller.maxBudgetUsdc);
          setSellerMinDays(p.seller.minDeadlineDays);
          setSellerMaxDays(p.seller.maxDeadlineDays);
        }
        if (p.buyer) {
          setBuyerMax(p.buyer.maxBudgetUsdc);
          setBuyerMinDays(p.buyer.minDeadlineDays);
          setBuyerMaxDays(p.buyer.maxDeadlineDays);
          setBidWindow(p.buyer.bidCollectionSeconds);
          setMilestoneSplit(p.buyer.milestonePcts.join(','));
        }
        // Land on the role step so the user can change buyer/seller/both
        // (e.g. a seller adding buyer capability). The Continue button takes
        // them into the form with the new role's fields revealed.
        setStep('role');
        setProfileGate(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProfileGate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, router, editMode]);

  async function submit() {
    if (!address || !role) return;
    setSubmitting(true);
    setError(null);

    const wantsSeller = role === 'seller' || role === 'both';
    const wantsBuyer = role === 'buyer' || role === 'both';

    const milestonePcts = milestoneSplit
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));

    try {
      await api.saveProfile({
        address,
        role,
        displayName:
          displayName.trim() ||
          t.onboarding.profileStep.defaultDisplayName.replace(
            '{shortAddress}',
            address.slice(0, 6),
          ),
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
            bidCollectionSeconds: bidWindow,
            milestonePcts,
          },
        }),
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('karwan:profile-saved'));
      }
      router.push('/app');
    } catch (err) {
      setError(prettifyError(err));
      setSubmitting(false);
    }
  }

  const stepN =
    step === 'language' ? 1 : step === 'connect' ? 2 : step === 'role' ? 3 : 4;

  // Hold the body until the profile check resolves. Returning users with a
  // cached wallet would otherwise see the language step flash before the
  // redirect to /app fires. New users hit this for a single fetch round-trip
  // (usually <100ms) then the form renders.
  if (profileGate) {
    return <OnboardingShell />;
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="max-w-[60ch] mx-auto text-center">
          <div className="fade-up flex justify-center">
            <span className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.18em] text-white/65">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
              {t.onboarding.stepIndicator
                .replace('{step}', String(stepN))
                .replace('{total}', '4')}
            </span>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)] mt-6">
              {step === 'language' && (
                <>
                  {t.onboarding.languageStep.title}
                  <Punc>.</Punc>
                </>
              )}
              {step === 'connect' && (
                <>
                  {t.onboarding.connectStep.headlinePrefix}
                  <Accent>{t.onboarding.connectStep.headlineAccent}</Accent>
                  <Punc>.</Punc>
                </>
              )}
              {step === 'role' && (
                <>
                  {t.onboarding.roleStep.headlinePrefix}
                  <Accent>{t.onboarding.roleStep.headlineAccent}</Accent>
                  <Punc>?</Punc>
                </>
              )}
              {step === 'profile' && (
                <>
                  {t.onboarding.profileStep.headlinePrefix}
                  <Accent>{t.onboarding.profileStep.headlineAccent}</Accent>
                  <Punc>.</Punc>
                </>
              )}
            </HeroHeadline>
          </div>
          <div className="fade-up fade-up-2 mt-7 flex justify-center">
            <ProgressDots current={stepN} total={4} />
          </div>
        </div>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-3xl mx-auto">
          {step === 'language' && (
            <div className="space-y-6">
              <p className="text-[15px] text-[var(--lp-text-sub)] max-w-[52ch]">
                {t.onboarding.languageStep.description}
              </p>
              <LanguagePicker
                onChange={() => {
                  // Persist post-sign-in via Settings. For now the cookie holds
                  // the choice so the rest of the onboarding renders in it.
                }}
              />
              <div className="pt-2">
                <CTAPill onClick={() => setStep('connect')}>{t.common.continue}</CTAPill>
              </div>
            </div>
          )}

          {step === 'connect' && (
            <ConnectStep onLogin={() => setLoginOpen(true)} />
          )}

          {step === 'role' && (
            <RoleStep
              address={address}
              role={role}
              onSelect={setRole}
              onContinue={() => setStep('profile')}
            />
          )}

          {step === 'profile' && role && (
            <ProfileStep
              role={role}
              displayName={displayName}
              setDisplayName={setDisplayName}
              skills={skills}
              setSkills={setSkills}
              bio={bio}
              setBio={setBio}
              sellerMin={sellerMin}
              setSellerMin={setSellerMin}
              sellerMax={sellerMax}
              setSellerMax={setSellerMax}
              sellerMinDays={sellerMinDays}
              setSellerMinDays={setSellerMinDays}
              sellerMaxDays={sellerMaxDays}
              setSellerMaxDays={setSellerMaxDays}
              buyerMax={buyerMax}
              setBuyerMax={setBuyerMax}
              buyerMinDays={buyerMinDays}
              setBuyerMinDays={setBuyerMinDays}
              buyerMaxDays={buyerMaxDays}
              setBuyerMaxDays={setBuyerMaxDays}
              bidWindow={bidWindow}
              setBidWindow={setBidWindow}
              milestoneSplit={milestoneSplit}
              setMilestoneSplit={setMilestoneSplit}
              canSubmit={canSubmit}
              submitting={submitting}
              error={error}
              onBack={() => setStep('role')}
              onSubmit={submit}
            />
          )}
        </div>
      </Band>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </FullBleed>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-white/15 bg-white/[0.04]">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const isActive = n === current;
        const isDone = n < current;
        return (
          <span
            key={i}
            aria-hidden
            className="inline-flex items-center gap-2"
          >
            <span
              className="w-[7px] h-[7px] transition-colors"
              style={{
                background: isActive
                  ? 'var(--lp-accent)'
                  : isDone
                    ? 'rgba(175, 201, 91,0.5)'
                    : 'rgba(255,255,255,0.20)',
                animation: isActive ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
              }}
              data-instrument-blink={isActive || undefined}
            />
            {n < total && (
              <span className="w-4 h-px bg-white/15" />
            )}
          </span>
        );
      })}
    </div>
  );
}

function ConnectStep({ onLogin }: { onLogin: () => void }) {
  const t = useTranslations().onboarding.connectStep;
  return (
    <div className="fade-up">
      <div
        className="overflow-hidden p-8 md:p-10"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
        }}
      >
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          {t.bodyText}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex items-center gap-2 px-[20px] py-[12px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
            style={{
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {t.loginButton}
            <span aria-hidden>→</span>
          </button>
        </div>
        <p className="mt-6 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {t.fineprint}
        </p>
      </div>
    </div>
  );
}

function RoleStep({
  address,
  role,
  onSelect,
  onContinue,
}: {
  address: string | undefined;
  role: UserRole | null;
  onSelect: (r: UserRole) => void;
  onContinue: () => void;
}) {
  const t = useTranslations().onboarding.roleStep;
  return (
    <div className="space-y-8">
      <div className="fade-up text-center">
        <p className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {t.connectedAs}{' '}
          <span className="text-[var(--lp-dark)]">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[50ch] mx-auto">
          {t.description}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="fade-up fade-up-1">
          <RoleCard
            role="seller"
            selected={role}
            onSelect={onSelect}
            tone="cream"
            eyebrow={t.cards.seller.eyebrow}
            title={t.cards.seller.title}
            body={t.cards.seller.body}
            tagline={t.cards.seller.tagline}
          />
        </div>
        <div className="fade-up fade-up-2">
          <RoleCard
            role="buyer"
            selected={role}
            onSelect={onSelect}
            tone="dark"
            eyebrow={t.cards.buyer.eyebrow}
            title={t.cards.buyer.title}
            body={t.cards.buyer.body}
            tagline={t.cards.buyer.tagline}
          />
        </div>
        <div className="fade-up fade-up-3">
          <RoleCard
            role="both"
            selected={role}
            onSelect={onSelect}
            tone="accent"
            eyebrow={t.cards.both.eyebrow}
            title={t.cards.both.title}
            body={t.cards.both.body}
            tagline={t.cards.both.tagline}
            recommended
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-4">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 mono text-[12px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors"
        >
          <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">
            ←
          </span>
          {t.backArrow}
        </Link>
        <CTAPill onClick={onContinue} disabled={!role} tone="light">
          {t.continueArrow}
        </CTAPill>
      </div>
    </div>
  );
}

function RoleCard({
  role,
  selected,
  onSelect,
  tone,
  eyebrow,
  title,
  body,
  tagline,
  recommended,
}: {
  role: UserRole;
  selected: UserRole | null;
  onSelect: (r: UserRole) => void;
  tone: 'cream' | 'dark' | 'accent';
  eyebrow: string;
  title: string;
  body: string;
  tagline: string;
  recommended?: boolean;
}) {
  const t = useTranslations().onboarding.roleStep;
  const isSel = selected === role;
  const surface =
    tone === 'dark'
      ? 'bg-[var(--lp-band-dark)] text-white'
      : tone === 'accent'
        ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]'
        : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]';
  // The accent surface is a fixed lime in both themes, so its text must be a
  // fixed dark (--lp-band-dark), not the theme-flipping --lp-dark which turns
  // light in dark mode and leaves faint grey text on lime. Opacities are also
  // bumped so the caption reads on the muted lime.
  const eyebrowColor =
    tone === 'dark'
      ? 'text-white/55'
      : tone === 'accent'
        ? 'text-[var(--lp-band-dark)]/70'
        : 'text-[var(--lp-text-muted)]';
  const muted =
    tone === 'dark'
      ? 'text-white/65'
      : tone === 'accent'
        ? 'text-[var(--lp-band-dark)]/90'
        : 'text-[var(--lp-text-sub)]';
  const tagColor =
    tone === 'dark'
      ? 'text-white/45'
      : tone === 'accent'
        ? 'text-[var(--lp-band-dark)]/75'
        : 'text-[var(--lp-text-muted)]';

  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      className={cn(
        'group block w-full text-start relative overflow-hidden transition-[transform,box-shadow] duration-300 ease-out card-shimmer',
        'hover:-translate-y-1 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.10)]',
        'hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_28px_60px_-22px_rgba(0,0,0,0.20)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
        isSel && 'ring-2 ring-[var(--lp-accent)] ring-offset-2 ring-offset-[var(--lp-light)]',
        surface,
      )}
      style={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
      }}
    >
      <div className="p-6">
        <div className="flex items-center justify-between">
          <span className={cn('mono text-[10px] uppercase tracking-[0.2em] font-medium', eyebrowColor)}>
            {eyebrow}
          </span>
          {recommended && (
            <span
              className="px-2 py-0.5 mono text-[9px] uppercase tracking-[0.18em] font-semibold"
              style={{
                background:
                  tone === 'accent' ? 'var(--lp-band-dark)' : 'var(--lp-accent)',
                color: tone === 'accent' ? 'var(--lp-accent)' : 'var(--lp-dark)',
                borderRadius: 3,
              }}
            >
              {t.topBadge}
            </span>
          )}
        </div>
        <h3 className="mt-5 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-[1.04]">
          {title}
        </h3>
        <p className={cn('mt-3 text-pretty text-[13.5px] leading-relaxed', muted)}>{body}</p>
        <p className={cn('mt-4 mono text-[11px] uppercase tracking-[0.08em]', tagColor)}>
          {tagline}
        </p>
        <div className="mt-5 flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all',
              isSel
                ? tone === 'accent'
                  ? 'bg-[var(--lp-band-dark)] border-[var(--lp-dark)]'
                  : 'bg-[var(--lp-accent)] border-[var(--lp-accent)]'
                : tone === 'dark'
                  ? 'border-white/30'
                  : tone === 'accent'
                    ? 'border-[var(--lp-dark)]/30'
                    : 'border-[var(--lp-border-light)]',
            )}
          >
            {isSel && (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8.5 L6.5 12 L13 5"
                  stroke={tone === 'accent' ? 'var(--lp-accent)' : '#0e0e0e'}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span
            aria-hidden
            className={cn(
              'mono text-[10px] uppercase tracking-[0.12em] transition-opacity',
              isSel ? 'opacity-100' : 'opacity-0',
            )}
          >
            {t.selected}
          </span>
        </div>
      </div>
    </button>
  );
}

function ProfileStep(props: {
  role: UserRole;
  displayName: string;
  setDisplayName: (v: string) => void;
  skills: string;
  setSkills: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  sellerMin: number;
  setSellerMin: (v: number) => void;
  sellerMax: number;
  setSellerMax: (v: number) => void;
  sellerMinDays: number;
  setSellerMinDays: (v: number) => void;
  sellerMaxDays: number;
  setSellerMaxDays: (v: number) => void;
  buyerMax: number;
  setBuyerMax: (v: number) => void;
  buyerMinDays: number;
  setBuyerMinDays: (v: number) => void;
  buyerMaxDays: number;
  setBuyerMaxDays: (v: number) => void;
  bidWindow: number;
  setBidWindow: (v: number) => void;
  milestoneSplit: string;
  setMilestoneSplit: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations().onboarding;
  const ps = t.profileStep;
  const wantsSeller = props.role === 'seller' || props.role === 'both';
  const wantsBuyer = props.role === 'buyer' || props.role === 'both';

  return (
    <div className="space-y-6 fade-up">
      <ProfileSection number="01" eyebrow={ps.identity.eyebrow} title={ps.identity.title}>
        <Field
          label={ps.identity.displayNameLabel}
          hint={ps.identity.displayNameHint}
        >
          <input
            value={props.displayName}
            onChange={(e) => props.setDisplayName(e.target.value)}
            className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] transition-colors"
          />
        </Field>
      </ProfileSection>

      {wantsSeller && (
        <ProfileSection number="02" eyebrow={ps.seller.eyebrow} title={ps.seller.title}>
          <Field label={ps.seller.skillsLabel} hint={ps.seller.skillsHint}>
            <input
              value={props.skills}
              onChange={(e) => props.setSkills(e.target.value)}
              className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] transition-colors"
            />
          </Field>
          <Field label={ps.seller.bioLabel} hint={ps.seller.bioHint}>
            <textarea
              value={props.bio}
              onChange={(e) => props.setBio(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] resize-none transition-colors"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label={ps.seller.minBudgetLabel}
              hint={ps.seller.minBudgetHint}
              value={props.sellerMin}
              setValue={props.setSellerMin}
            />
            <NumField
              label={ps.seller.maxBudgetLabel}
              hint={ps.seller.maxBudgetHint}
              value={props.sellerMax}
              setValue={props.setSellerMax}
            />
            <NumField
              label={ps.seller.minDeadlineLabel}
              hint={ps.seller.minDeadlineHint}
              value={props.sellerMinDays}
              setValue={props.setSellerMinDays}
            />
            <NumField
              label={ps.seller.maxDeadlineLabel}
              hint={ps.seller.maxDeadlineHint}
              value={props.sellerMaxDays}
              setValue={props.setSellerMaxDays}
            />
          </div>
        </ProfileSection>
      )}

      {wantsBuyer && (
        <ProfileSection
          number={props.role === 'both' ? '03' : '02'}
          eyebrow={ps.buyer.eyebrow}
          title={ps.buyer.title}
        >
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label={ps.buyer.maxBudgetLabel}
              hint={ps.buyer.maxBudgetHint}
              value={props.buyerMax}
              setValue={props.setBuyerMax}
            />
            <NumField
              label={ps.buyer.bidWindowLabel}
              hint={ps.buyer.bidWindowHint}
              value={props.bidWindow}
              setValue={props.setBidWindow}
            />
            <NumField
              label={ps.buyer.minDeadlineLabel}
              hint={ps.buyer.minDeadlineHint}
              value={props.buyerMinDays}
              setValue={props.setBuyerMinDays}
            />
            <NumField
              label={ps.buyer.maxDeadlineLabel}
              hint={ps.buyer.maxDeadlineHint}
              value={props.buyerMaxDays}
              setValue={props.setBuyerMaxDays}
            />
          </div>
          <Field
            label={ps.buyer.splitLabel}
            hint={ps.buyer.splitHint}
          >
            <input
              value={props.milestoneSplit}
              onChange={(e) => props.setMilestoneSplit(e.target.value)}
              className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--lp-dark)] transition-colors"
            />
          </Field>
        </ProfileSection>
      )}

      <div className="flex justify-between items-center pt-4">
        <button
          type="button"
          onClick={props.onBack}
          className="group inline-flex items-center gap-2 mono text-[12px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors"
        >
          <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">
            ←
          </span>
          {t.roleStep.backArrow}
        </button>
        <CTAPill onClick={props.onSubmit} disabled={!props.canSubmit} tone="light">
          {props.submitting ? ps.saving : ps.submit}
        </CTAPill>
      </div>
      {props.error && (
        <p className="mono text-[12px] text-[var(--lp-dark)] bg-[rgba(255,0,0,0.06)] border border-[rgba(255,0,0,0.2)] rounded-md p-3">
          {props.error}
        </p>
      )}
    </div>
  );
}

function ProfileSection({
  number,
  eyebrow,
  title,
  children,
}: {
  number: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
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
      <header className="px-6 pt-5 pb-4 border-b border-[var(--lp-border-light)]">
        <div className="flex items-baseline gap-3">
          <span className="font-sans text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]/30 leading-none">
            {number}
          </span>
          {eyebrow && (
            <span className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
              {eyebrow}
            </span>
          )}
        </div>
        <h2 className="mt-2 font-sans text-[18px] font-extrabold uppercase tracking-[-0.02em] text-[var(--lp-dark)]">
          {title}
        </h2>
      </header>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  setValue,
  hint,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  hint?: string;
}) {
  // Local text buffer so the field can be fully cleared while typing. Binding
  // value={number} directly makes Number('') collapse to 0, so the last zero can
  // never be deleted. We hold the displayed text here and report a number up
  // (empty -> NaN, which the form's validation already treats as invalid).
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''));
  // Re-sync when the parent value changes from outside (profile prefill in edit
  // mode) without clobbering what the user is actively typing.
  useEffect(() => {
    const current = text.trim() === '' ? NaN : Number(text);
    const incoming = Number.isFinite(value) ? value : NaN;
    if (current !== incoming && !(Number.isNaN(current) && Number.isNaN(incoming))) {
      setText(Number.isFinite(value) ? String(value) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          setValue(t.trim() === '' ? NaN : Number(t));
        }}
        className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--lp-dark)] transition-colors"
      />
    </label>
  );
}

function prettifyError(err: unknown): string {
  const raw =
    err instanceof ApiError ? (err.detail as unknown) ?? err.message : (err as Error).message;
  if (Array.isArray(raw)) {
    return raw
      .map((it: { path?: string[]; message?: string }) => {
        const path = (it?.path ?? []).join('.');
        const msg = it?.message ?? 'Invalid value';
        return path ? `${path}: ${msg}` : msg;
      })
      .join('; ');
  }
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw);
}
