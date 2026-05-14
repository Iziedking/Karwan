import { api } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { PostJobForm } from '@/features/buyer/components/PostJobForm';
import { JobsTable } from '@/features/buyer/components/JobsTable';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { shortAddress } from '@/shared/utils/format';

export const dynamic = 'force-dynamic';

export default async function BuyerPage() {
  const [data, status] = await Promise.all([
    api.buyer().catch((err) => ({ error: (err as Error).message }) as const),
    api.status().catch(() => null),
  ]);

  if ('error' in data) {
    return (
      <Card title="Backend offline">
        <p className="text-sm text-[var(--color-ink-dim)] mono">{data.error}</p>
      </Card>
    );
  }

  const jobs = [...data.jobs].sort((a, b) => b.deadlineUnix - a.deadlineUnix);

  return (
    <div className="space-y-8">
      <header className="fade-up pb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] tracking-tight font-semibold">Buyer</h1>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
            {shortAddress(data.profile.address)} · {data.profile.displayName}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          Buyer agent running
        </div>
      </header>

      <div className="fade-up fade-up-1 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card title="Post a brief">
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mb-5">
              When you submit, a <span className="mono">postJob</span> tx is sent from the buyer agent wallet. The seller agent will see it within seconds and bid. You'll be taken to the live job page where the negotiation plays out.
            </p>
            <PostJobForm />
          </Card>
        </div>
        <div className="space-y-4" id="bridge-section">
          <BalancesCard />
          <BridgeCard mintRecipient={status?.agents.buyer.address as `0x${string}` | undefined} />
        </div>
      </div>

      <div className="fade-up fade-up-2">
        <Card
          title={`Active deals${jobs.length > 0 ? ` · ${jobs.length}` : ''}`}
          noPadding
        >
          <JobsTable jobs={jobs} />
        </Card>
      </div>
    </div>
  );
}
