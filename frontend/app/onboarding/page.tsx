'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginModal } from '@/shared/components/LoginModal';
import { api, ApiError, type UserRole } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
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

export default function OnboardingPage() {
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
  const [step, setStep] = useState<'connect' | 'role' | 'profile' | 'review'>('connect');
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
    const issues: string[] = [];
    if (!displayName.trim()) issues.push('Add a display name.');

    const wantsSeller = role === 'seller' || role === 'both';
    const wantsBuyer = role === 'buyer' || role === 'both';

    if (wantsSeller) {
      const cleanSkills = skills.split(',').map((s) => s.trim()).filter(Boolean);
      if (cleanSkills.length === 0) issues.push('Add at least one skill.');
      if (!bio.trim()) issues.push('Write a short seller bio.');
      if (!(sellerMin > 0)) issues.push('Set a seller minimum budget above 0.');
      if (!(sellerMax > sellerMin)) issues.push('Seller max budget must exceed the min.');
      if (!(sellerMinDays > 0)) issues.push('Seller minimum deadline must be at least 1 day.');
      if (!(sellerMaxDays >= sellerMinDays))
        issues.push('Seller max deadline must be ≥ the min.');
    }

    if (wantsBuyer) {
      if (!(buyerMax > 0)) issues.push('Set a buyer max budget above 0.');
      if (!(bidWindow >= 10)) issues.push('Bid window must be at least 10 seconds.');
      if (!(buyerMinDays > 0)) issues.push('Buyer minimum deadline must be at least 1 day.');
      if (!(buyerMaxDays >= buyerMinDays))
        issues.push('Buyer max deadline must be ≥ the min.');
      const pcts = milestoneSplit
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      const sum = pcts.reduce((a, b) => a + b, 0);
      if (pcts.length === 0) issues.push('Milestone split needs at least one number.');
      else if (sum !== 100) issues.push(`Milestone split must add up to 100 (currently ${sum}).`);
    }

    return issues;
  })();

  const canSubmit = !!role && validationIssues.length === 0 && !submitting;

  useEffect(() => {
    if (isConnected && step === 'connect') setStep('role');
  }, [isConnected, step]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    api
      .getProfile(address)
      .then((res) => {
        if (cancelled) return;
        if (!res.profile) return;
        if (!editMode) {
          router.replace('/app');
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
      })
      .catch(() => {});
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
        displayName: displayName.trim() || `Karwan user ${address.slice(0, 6)}`,
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

  const stepN = step === 'connect' ? 1 : step === 'role' ? 2 : 3;

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <div className="max-w-[60ch] mx-auto text-center">
          <div className="fade-up flex justify-center">
            <span className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.18em] text-white/65">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]" />
              SIGN UP · STEP {stepN} OF 3
            </span>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline className="text-[clamp(2rem,4.6vw,3.75rem)] mt-6">
              {step === 'connect' && (
                <>
                  Connect your <Accent>wallet</Accent>
                  <Punc>.</Punc>
                </>
              )}
              {step === 'role' && (
                <>
                  How will you use <Accent>Karwan</Accent>
                  <Punc>?</Punc>
                </>
              )}
              {step === 'profile' && (
                <>
                  Tell us a bit <Accent>about you</Accent>
                  <Punc>.</Punc>
                </>
              )}
            </HeroHeadline>
          </div>
          <div className="fade-up fade-up-2 mt-7 flex justify-center">
            <ProgressDots current={stepN} total={3} />
          </div>
        </div>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-3xl mx-auto">
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
                    ? 'rgba(189, 225, 34,0.5)'
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
          Karwan identifies you by a wallet. Connect an EVM wallet, or sign in with email and
          Circle provisions one for you.
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex items-center gap-2 px-[20px] py-[12px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
            style={{
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            Log in
            <span aria-hidden>→</span>
          </button>
        </div>
        <p className="mt-6 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          Wallet or email. Both land you with an Arc address.
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
  return (
    <div className="space-y-8">
      <div className="fade-up text-center">
        <p className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          Connected as{' '}
          <span className="text-[var(--lp-dark)]">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[50ch] mx-auto">
          How will you mostly use Karwan? Pick one. You can change this later.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="fade-up fade-up-1">
          <RoleCard
            role="seller"
            selected={role}
            onSelect={onSelect}
            tone="cream"
            eyebrow="TAKE WORK"
            title="Bid as seller"
            body="Your seller agent watches the chain for jobs that match your skills and bids on your behalf."
            tagline="Best for freelancers and SME service providers."
          />
        </div>
        <div className="fade-up fade-up-2">
          <RoleCard
            role="buyer"
            selected={role}
            onSelect={onSelect}
            tone="dark"
            eyebrow="HIRE SOMEONE"
            title="Run the auction"
            body="Post briefs. Your buyer agent ranks bids, negotiates within your terms, and locks the deal."
            tagline="Best for founders, agencies, procurement."
          />
        </div>
        <div className="fade-up fade-up-3">
          <RoleCard
            role="both"
            selected={role}
            onSelect={onSelect}
            tone="accent"
            eyebrow="BOTH"
            title="Hire and bid"
            body="Hire and take work from one account. Reputation compounds across both."
            tagline="One identity, two roles. Recommended for SMEs."
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
          Back
        </Link>
        <CTAPill onClick={onContinue} disabled={!role} tone="light">
          Continue →
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
  const isSel = selected === role;
  const surface =
    tone === 'dark'
      ? 'bg-[var(--lp-dark)] text-white'
      : tone === 'accent'
        ? 'bg-[var(--lp-accent)] text-[var(--lp-dark)]'
        : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]';
  const eyebrowColor =
    tone === 'dark'
      ? 'text-white/55'
      : tone === 'accent'
        ? 'text-[var(--lp-dark)]/65'
        : 'text-[var(--lp-text-muted)]';
  const muted =
    tone === 'dark'
      ? 'text-white/65'
      : tone === 'accent'
        ? 'text-[var(--lp-dark)]/75'
        : 'text-[var(--lp-text-sub)]';
  const tagColor =
    tone === 'dark'
      ? 'text-white/45'
      : tone === 'accent'
        ? 'text-[var(--lp-dark)]/55'
        : 'text-[var(--lp-text-muted)]';

  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      className={cn(
        'group block w-full text-left relative overflow-hidden transition-[transform,box-shadow] duration-300 ease-out card-shimmer',
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
                  tone === 'accent' ? 'var(--lp-dark)' : 'var(--lp-accent)',
                color: tone === 'accent' ? 'var(--lp-accent)' : 'var(--lp-dark)',
                borderRadius: 3,
              }}
            >
              ★ TOP
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
                  ? 'bg-[var(--lp-dark)] border-[var(--lp-dark)]'
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
            selected
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
  const wantsSeller = props.role === 'seller' || props.role === 'both';
  const wantsBuyer = props.role === 'buyer' || props.role === 'both';

  return (
    <div className="space-y-6 fade-up">
      <ProfileSection number="01" eyebrow="IDENTITY" title="About you">
        <Field
          label="Display name"
          hint="Shown to counterparties on deals. Example: Alex · Frontend developer."
        >
          <input
            value={props.displayName}
            onChange={(e) => props.setDisplayName(e.target.value)}
            className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] transition-colors"
          />
        </Field>
      </ProfileSection>

      {wantsSeller && (
        <ProfileSection number="02" eyebrow="TAKE WORK" title="Seller profile">
          <Field label="Skills" hint="Comma-separated. Example: Next.js, Tailwind, copywriting.">
            <input
              value={props.skills}
              onChange={(e) => props.setSkills(e.target.value)}
              className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] transition-colors"
            />
          </Field>
          <Field label="Bio" hint="One or two sentences shown to buyers.">
            <textarea
              value={props.bio}
              onChange={(e) => props.setBio(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--lp-dark)] resize-none transition-colors"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Min budget (USDC)" value={props.sellerMin} setValue={props.setSellerMin} />
            <NumField label="Max budget (USDC)" value={props.sellerMax} setValue={props.setSellerMax} />
            <NumField label="Min deadline (days)" value={props.sellerMinDays} setValue={props.setSellerMinDays} />
            <NumField label="Max deadline (days)" value={props.sellerMaxDays} setValue={props.setSellerMaxDays} />
          </div>
        </ProfileSection>
      )}

      {wantsBuyer && (
        <ProfileSection
          number={props.role === 'both' ? '03' : '02'}
          eyebrow="HIRE SOMEONE"
          title="Buyer profile"
        >
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Max budget per job (USDC)" value={props.buyerMax} setValue={props.setBuyerMax} />
            <NumField label="Bid window (sec)" value={props.bidWindow} setValue={props.setBidWindow} />
            <NumField label="Min deadline (days)" value={props.buyerMinDays} setValue={props.setBuyerMinDays} />
            <NumField label="Max deadline (days)" value={props.buyerMaxDays} setValue={props.setBuyerMaxDays} />
          </div>
          <Field
            label="Milestone split"
            hint="Comma-separated percentages that total 100. Example: 50,50 or 30,40,30."
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
          Back
        </button>
        <CTAPill onClick={props.onSubmit} disabled={!props.canSubmit} tone="light">
          {props.submitting ? 'Saving…' : 'Save & activate ↗'}
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
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
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
