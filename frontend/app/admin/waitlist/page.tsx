'use client';

import { DeskTabs } from '@/features/admin/desk/DeskTabs';
import WaitlistPage from '@/features/admin/pages/WaitlistPage';
import SurveyPage from '@/features/admin/pages/SurveyPage';

export default function Page() {
  return <DeskTabs parts={{ waitlist: WaitlistPage, survey: SurveyPage }} />;
}
