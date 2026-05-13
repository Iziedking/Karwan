import { api } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { ActivityFeed } from '@/features/activity/components/ActivityFeed';
import { BalancesCard } from '@/features/balances/components/BalancesCard';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const status = await api.status().catch(() => null);
  const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';

  return (
    <div className="space-y-8">
      <header className="fade-up pb-2">
        <h1 className="text-[28px] tracking-tight font-semibold">Activity</h1>
        <p className="text-sm text-[var(--color-ink-dim)] mt-1">
          Live feed of agent activity across all jobs. Each event links to its tx on Arcscan.
        </p>
      </header>

      <div className="fade-up fade-up-1 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card title="Recent events">
            <ActivityFeed explorer={explorer} />
          </Card>
        </div>
        <BalancesCard />
      </div>
    </div>
  );
}
