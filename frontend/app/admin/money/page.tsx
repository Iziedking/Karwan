'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import MoneyMovesPage from '@/features/admin/pages/MoneyMovesPage';
import PaymentsPage from '@/features/admin/pages/PaymentsPage';

export default function Page() {
  return <DeskTabs parts={{ moves: MoneyMovesPage, agents: PaymentsPage }} />;
}
