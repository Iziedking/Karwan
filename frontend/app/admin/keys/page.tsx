'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import KeysPage from '@/features/admin/pages/KeysPage';
import TeamKeysPage from '@/features/admin/pages/TeamKeysPage';

export default function Page() {
  return <DeskTabs parts={{ yours: KeysPage, team: TeamKeysPage }} />;
}
