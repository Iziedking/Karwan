'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import RuntimePage from '@/features/admin/pages/RuntimePage';
import SignalsPage from '@/features/admin/pages/SignalsPage';

export default function Page() {
  return <DeskTabs parts={{ runtime: RuntimePage, signals: SignalsPage }} />;
}
