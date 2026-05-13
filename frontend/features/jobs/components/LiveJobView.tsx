'use client';
import type { BuyerJob } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { FlowStepper } from './FlowStepper';
import { EventList } from './EventList';
import { useJobLiveState } from '../hooks/useJobLiveState';

export function LiveJobView({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const { events, active, completed } = useJobLiveState(initial);

  return (
    <div className="space-y-6">
      <Card>
        <FlowStepper active={active} completed={completed} />
      </Card>

      <Card title="Timeline">
        <EventList events={events} explorer={explorer} />
      </Card>
    </div>
  );
}
