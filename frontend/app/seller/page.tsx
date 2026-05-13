import Link from 'next/link';
import { api } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { Tag } from '@/shared/components/Tag';
import { BidsTable } from '@/features/seller/components/BidsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { shortAddress } from '@/shared/utils/format';

export const dynamic = 'force-dynamic';

export default async function SellerPage() {
  const data = await api.seller().catch((err) => ({ error: (err as Error).message }) as const);

  if ('error' in data) {
    return (
      <Card title="Backend offline">
        <p className="text-sm text-[var(--color-ink-dim)] mono">{data.error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <header className="fade-up pb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] tracking-tight font-semibold">{data.profile.displayName}</h1>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
            {shortAddress(data.profile.address)}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          Seller agent running
        </div>
      </header>

      <div className="fade-up fade-up-1">
        <Card title="What this agent does">
          <div className="grid md:grid-cols-3 gap-5 text-[13px] text-[var(--color-ink-dim)]">
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-ink)]">1. Watches the chain</p>
              <p>Subscribes to <span className="mono">JobPosted</span> events from the JobBoard contract.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-ink)]">2. Scores the brief</p>
              <p>Reads the buyer's brief, checks skills + budget + deadline, and asks an LLM whether to bid.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-[var(--color-ink)]">3. Bids and negotiates</p>
              <p>Submits a bid on chain. Responds to counter-offers within its accepted range.</p>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-[var(--color-line)] flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">Skills</span>
            <div className="flex flex-wrap gap-1.5">
              {data.profile.skills?.map((s) => <Tag key={s}>{s}</Tag>)}
            </div>
          </div>
          <p className="mt-4 text-[12px] text-[var(--color-ink-faint)]">
            To trigger a bid, post a brief from the{' '}
            <Link href="/buyer" className="underline text-[var(--color-ink)]">buyer dashboard</Link>.
          </p>
        </Card>
      </div>

      <div className="fade-up fade-up-2 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card
            title={`Active bids${data.activeBids.length > 0 ? ` · ${data.activeBids.length}` : ''}`}
            noPadding
          >
            <BidsTable bids={data.activeBids} />
          </Card>
        </div>
        <BalancesCard />
      </div>
    </div>
  );
}
