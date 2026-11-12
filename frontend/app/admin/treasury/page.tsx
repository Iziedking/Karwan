'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import TreasuryPage from '@/features/admin/pages/TreasuryPage';
import UsycPage from '@/features/admin/pages/UsycPage';

export default function Page() {
  return <DeskTabs parts={{ treasury: TreasuryPage, yield: UsycPage }} />;
}
