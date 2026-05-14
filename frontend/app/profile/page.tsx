'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Card } from '@/shared/components/Card';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { shortAddress } from '@/shared/utils/format';

export default function ProfilePage() {
  const router = useRouter();
  const { profile, isConnected, fetchState } = useUserProfile();

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto fade-up text-center space-y-6 py-12">
        <h1 className="text-[28px] tracking-tight font-semibold">Connect your wallet</h1>
        <p className="text-sm text-[var(--color-ink-dim)] leading-relaxed">
          Karwan profiles are keyed by wallet address. Connect to see yours.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <Card title="Backend offline">
        <p className="text-sm text-[var(--color-ink-dim)]">
          Could not load your profile. Try again in a moment.
        </p>
      </Card>
    );
  }

  if (fetchState === 'idle' || fetchState === 'loading') {
    return <p className="text-sm text-[var(--color-ink-dim)] fade-up">Loading your profile…</p>;
  }

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto fade-up text-center space-y-5 py-10">
        <h1 className="text-[28px] tracking-tight font-semibold">No profile yet</h1>
        <p className="text-sm text-[var(--color-ink-dim)] leading-relaxed">
          You haven't set up an agent profile for this wallet. It only takes a minute.
        </p>
        <Link
          href="/onboarding"
          style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
          className="inline-flex px-4 py-2 rounded-md text-[13px] font-semibold hover:opacity-90 transition-opacity"
        >
          Set up profile →
        </Link>
      </div>
    );
  }

  const created = new Date(profile.createdAt).toLocaleDateString();
  const updated = new Date(profile.updatedAt).toLocaleDateString();

  return (
    <div className="space-y-8 fade-up max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
            Your profile
          </p>
          <h1 className="text-[28px] tracking-tight font-semibold mt-1">{profile.displayName}</h1>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
            {shortAddress(profile.address)} · created {created} · updated {updated}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/onboarding')}
          style={{ backgroundColor: 'transparent', color: 'var(--color-ink)' }}
          className="px-3.5 py-1.5 rounded-md text-[13px] font-medium border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          Edit profile
        </button>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        <Card title="Identity">
          <Row label="Display name" value={profile.displayName} />
          <Row label="Wallet" value={profile.address} mono small />
          <Row label="Role" value={profile.role} />
        </Card>

        {profile.seller && (
          <Card title="Seller agent">
            <Row label="Skills" value={profile.seller.skills.join(', ') || '—'} />
            <Row label="Bio" value={profile.seller.bio || '—'} />
            <Row
              label="Accepted budget"
              value={`${profile.seller.minBudgetUsdc} – ${profile.seller.maxBudgetUsdc} USDC`}
              mono
            />
            <Row
              label="Delivery window"
              value={`${profile.seller.minDeadlineDays} – ${profile.seller.maxDeadlineDays} days`}
              mono
            />
          </Card>
        )}

        {profile.buyer && (
          <Card title="Buyer agent">
            <Row label="Max budget per job" value={`${profile.buyer.maxBudgetUsdc} USDC`} mono />
            <Row
              label="Bid collection window"
              value={`${profile.buyer.bidCollectionSeconds}s`}
              mono
            />
            <Row
              label="Deadline range"
              value={`${profile.buyer.minDeadlineDays} – ${profile.buyer.maxDeadlineDays} days`}
              mono
            />
            <Row
              label="Milestone split"
              value={profile.buyer.milestonePcts.join(' / ') || '—'}
              mono
            />
          </Card>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="py-2 border-b border-[var(--color-line)] last:border-0 grid grid-cols-3 gap-3 items-baseline">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] capitalize">
        {label}
      </span>
      <span
        className={`col-span-2 text-right ${mono ? 'mono' : ''} ${
          small ? 'text-[12px] break-all' : 'text-[13px]'
        } text-[var(--color-ink)]`}
      >
        {value}
      </span>
    </div>
  );
}
