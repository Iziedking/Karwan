import { api } from '@/core/api';
import { ActivityView } from '@/features/activity/components/ActivityView';
import { LiveDot } from '@/shared/components/LiveDot';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const status = await api.status().catch(() => null);
  const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="fade-up flex items-end justify-between gap-4 pb-3 border-b border-[var(--color-line)]">
        <div className="min-w-0">
          <p className="eyebrow">Stream</p>
          <h1 className="display text-[44px] leading-[1.02] mt-1">Activity</h1>
          <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 max-w-md">
            Live from Arc Testnet. Every bid, counter, settlement, and bridge,
            as it happens.
          </p>
        </div>
        <div className="shrink-0 pb-1">
          <LiveDot />
        </div>
      </header>

      <div className="fade-up fade-up-1">
        <ActivityView explorer={explorer} />
      </div>
    </div>
  );
}
