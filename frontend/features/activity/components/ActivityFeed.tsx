'use client';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';
import { EventList } from '@/features/jobs/components/EventList';

export function ActivityFeed({ explorer }: { explorer: string }) {
  const events = useLiveEvents(undefined, 200);
  return <EventList events={events} explorer={explorer} showJobId />;
}
