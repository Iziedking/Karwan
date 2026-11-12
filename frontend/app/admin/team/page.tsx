'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import TeamPage from '@/features/admin/pages/TeamPage';
import AccessPage from '@/features/admin/pages/AccessPage';

export default function Page() {
  return <DeskTabs parts={{ team: TeamPage, pages: AccessPage }} />;
}
