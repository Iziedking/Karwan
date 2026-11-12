'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import EventsPage from '@/features/admin/pages/EventsPage';
import LogPage from '@/features/admin/pages/LogPage';

export default function Page() {
  return <DeskTabs parts={{ events: EventsPage, log: LogPage }} />;
}
