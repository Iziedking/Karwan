'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, ApiError, type UserRole } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { Hint } from '@/shared/components/Hint';

export default function OnboardingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
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
        // Only redirect to /app when we have a confirmed existing profile. On a
        // fresh signup we expect res.profile === null and stay here.
        if (res.profile) router.replace('/app');
      })
      .catch(() => {
        // Backend unreachable: don't redirect either way, leave the user where they are.
      });
    return () => {
      cancelled = true;
    };
  }, [address, router]);

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
      // Notify every useUserProfile consumer so banners like ProfileNudge
      // refresh immediately instead of waiting for a remount.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('karwan:profile-saved'));
      }
      router.push('/app');
    } catch (err) {
      setError(prettifyError(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 fade-up">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
          Sign up · step {stepNumber(step)} of 3
        </p>
        <h1 className="text-[32px] tracking-tight font-semibold">{stepTitle(step)}</h1>
      </header>

      {step === 'connect' && (
        <Card>
          <p className="text-sm text-[var(--color-ink-dim)] mb-5 leading-relaxed">
            Karwan identifies you by wallet. Connect a browser wallet to continue. Your wallet only signs what you approve.
          </p>
          <ConnectButton />
          <p className="text-[12px] text-[var(--color-ink-faint)] mt-4">
            Circle Passkey sign-in (email and biometrics) ships next.
          </p>
        </Card>
      )}

      {step === 'role' && isConnected && (
        <div className="space-y-5">
          <p className="text-[12px] mono text-[var(--color-ink-faint)]">
            Connected as {address?.slice(0, 6)}…{address?.slice(-4)}
          </p>
          <p className="text-sm text-[var(--color-ink-dim)] leading-relaxed">
            How will you mostly use Karwan? You can change this later.
          </p>
          <div className="space-y-3">
            <RoleOption
              role="seller"
              selected={role}
              onSelect={setRole}
              title="Take work"
              body="Your seller agent watches the chain for jobs that match your skills and bids on your behalf."
              tagline="Best for freelancers and SME service providers."
              icon={<BriefcaseIcon />}
            />
            <RoleOption
              role="buyer"
              selected={role}
              onSelect={setRole}
              title="Hire someone"
              body="Post briefs. Your buyer agent ranks bids, negotiates within your terms, and locks the deal in escrow."
              tagline="Best for founders, agencies, and procurement teams."
              icon={<ClipboardIcon />}
            />
            <RoleOption
              role="both"
              selected={role}
              onSelect={setRole}
              title="Both"
              body="Hire and take work from the same account. Reputation compounds across both."
              tagline="One identity, two roles. Recommended for active SMEs."
              icon={<SwapIcon />}
              recommended
            />
          </div>
          <div className="flex justify-between pt-2">
            <Link
              href="/"
              className="group inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
            >
              <span
                aria-hidden
                className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5"
              >
                ←
              </span>
              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
                Back
              </span>
            </Link>
            <button
              type="button"
              disabled={!role}
              onClick={() => setStep('profile')}
              style={{ backgroundColor: role ? '#0c0e10' : '#cccccc', color: '#ffffff' }}
              className="px-4 py-2 rounded-md text-[13px] font-semibold disabled:cursor-not-allowed transition-opacity"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 'profile' && role && (
        <div className="space-y-5">
          <ProfileSection icon={<UserIcon />} number="01" eyebrow="Identity" title="About you">
            <Field
              label="Display name"
              hint="Shown to counterparties on deals. Example: Alex · Frontend developer."
              input={
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                />
              }
            />
          </ProfileSection>

          {(role === 'seller' || role === 'both') && (
            <ProfileSection
              icon={<BriefcaseIcon />}
              number="02"
              eyebrow="Take work"
              title="Seller profile"
              description="Your seller agent uses these as guardrails when scoring incoming briefs."
            >
              <Field
                label="Skills"
                hint="Comma-separated list. The agent scores incoming briefs against these. Example: Next.js, React, Tailwind, copywriting."
                input={
                  <input
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                  />
                }
              />
              <Field
                label="Bio"
                hint="One or two sentences shown to buyers. What you build, who you've worked with."
                input={
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-ink)] resize-none"
                  />
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Min budget (USDC)" value={sellerMin} setValue={setSellerMin} />
                <NumField label="Max budget (USDC)" value={sellerMax} setValue={setSellerMax} />
                <NumField label="Min deadline (days)" value={sellerMinDays} setValue={setSellerMinDays} />
                <NumField label="Max deadline (days)" value={sellerMaxDays} setValue={setSellerMaxDays} />
              </div>
            </ProfileSection>
          )}

          {(role === 'buyer' || role === 'both') && (
            <ProfileSection
              icon={<ClipboardIcon />}
              number={role === 'both' ? '03' : '02'}
              eyebrow="Hire someone"
              title="Buyer profile"
              description="How your buyer agent should think about budgets, deadlines, and milestones."
            >
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Max budget per job (USDC)" value={buyerMax} setValue={setBuyerMax} />
                <NumField label="Bid collection window (sec)" value={bidWindow} setValue={setBidWindow} />
                <NumField label="Min deadline (days)" value={buyerMinDays} setValue={setBuyerMinDays} />
                <NumField label="Max deadline (days)" value={buyerMaxDays} setValue={setBuyerMaxDays} />
              </div>
              <Field
                label="Milestone split"
                hint="Comma-separated percentages that total 100. Example: 50,50 splits the budget into two equal tranches. 30,40,30 splits into three."
                input={
                  <input
                    value={milestoneSplit}
                    onChange={(e) => setMilestoneSplit(e.target.value)}
                    className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)]"
                  />
                }
              />
            </ProfileSection>
          )}

          <div className="flex justify-between items-center pt-2 gap-4">
            <button
              type="button"
              onClick={() => setStep('role')}
              className="group inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
            >
              <span
                aria-hidden
                className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5"
              >
                ←
              </span>
              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
                Back
              </span>
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              style={{
                backgroundColor: canSubmit ? '#0c0e10' : 'transparent',
                color: canSubmit ? '#ffffff' : 'var(--color-ink-faint)',
                borderColor: 'var(--color-line-strong)',
                filter: !canSubmit ? 'blur(0.4px) saturate(0.6)' : undefined,
              }}
              className={`px-4 py-2 rounded-md text-[13px] font-semibold border transition-all ${
                canSubmit ? 'hover:opacity-90 cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
            >
              {submitting ? 'Saving…' : 'Save profile and activate agent'}
            </button>
          </div>
          {error && (
            <p className="text-sm text-[var(--color-critical)] mt-2">
              Couldn't save profile: {error}
            </p>
          )}
        </div>
      )}
    </div>
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

function stepNumber(step: 'connect' | 'role' | 'profile' | 'review'): number {
  return step === 'connect' ? 1 : step === 'role' ? 2 : 3;
}

function stepTitle(step: 'connect' | 'role' | 'profile' | 'review'): string {
  switch (step) {
    case 'connect':
      return 'Connect your wallet';
    case 'role':
      return 'How will you use Karwan?';
    case 'profile':
      return 'Tell us a bit about you';
    case 'review':
      return 'Review';
  }
}

function RoleOption({
  role,
  selected,
  onSelect,
  title,
  body,
  tagline,
  icon,
  recommended,
}: {
  role: UserRole;
  selected: UserRole | null;
  onSelect: (r: UserRole) => void;
  title: string;
  body: string;
  tagline: string;
  icon: React.ReactNode;
  recommended?: boolean;
}) {
  const isSel = selected === role;
  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      className={`group relative w-full text-left rounded-xl border p-5 transition-all duration-200
        ${
          isSel
            ? 'border-[var(--color-ink)] bg-[var(--color-surface-2)] shadow-[var(--shadow-card-hover)]'
            : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]'
        }`}
    >
      {recommended && (
        <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[10px] uppercase tracking-[0.08em] font-semibold">
          Recommended
        </span>
      )}
      <div className="flex items-start gap-4">
        <span
          className={`shrink-0 grid place-items-center w-10 h-10 rounded-lg transition-colors
            ${
              isSel
                ? 'bg-[var(--color-ink)] text-[var(--color-surface)]'
                : 'bg-[var(--color-surface-2)] text-[var(--color-ink-dim)] group-hover:text-[var(--color-ink)]'
            }`}
        >
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
            <span
              className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
                ${
                  isSel
                    ? 'bg-[var(--color-ink)] border-[var(--color-ink)]'
                    : 'border-[var(--color-line-strong)]'
                }`}
            >
              {isSel && (
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8.5 L6.5 12 L13 5"
                    stroke="#ffffff"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
          </div>
          <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mt-1.5">{body}</p>
          <p className="text-[11px] text-[var(--color-ink-faint)] mt-2">{tagline}</p>
        </div>
      </div>
    </button>
  );
}

function ProfileSection({
  icon,
  number,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  number: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <header className="px-5 pt-5 pb-4 flex items-start gap-4 border-b border-[var(--color-line)] rounded-t-xl">
        <span className="shrink-0 grid place-items-center w-10 h-10 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-ink-dim)]">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] mono text-[var(--color-ink-faint)]">{number}</span>
            {eyebrow && (
              <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-accent)]">
                {eyebrow}
              </span>
            )}
          </div>
          <h2 className="text-[16px] font-semibold tracking-tight mt-1">{title}</h2>
          {description && (
            <p className="text-[12px] text-[var(--color-ink-dim)] mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </header>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, input }: { label: string; hint?: string; input: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </span>
      {input}
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
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)]"
      />
    </label>
  );
}

/* Icons */

function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="6" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6V4.5C7 3.7 7.7 3 8.5 3h3c.8 0 1.5.7 1.5 1.5V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10h14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="5" y="4" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4V3.5C8 2.95 8.45 2.5 9 2.5h2c.55 0 1 .45 1 1V4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9h4M8 12h4M8 15h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 7h11l-2.5-2.5M16 13H5l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 17c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
