'use client';

import { DealRulesSwitch } from '@/features/admin/DealRulesSwitch';
import { FormLimitsSwitch } from '@/features/admin/FormLimitsSwitch';
import { DeskPage } from '@/features/admin/desk/DeskPage';

export default function AdminSettingsPage() {
  return (
    <DeskPage title="Settings" subtitle="Switches that change how Karwan behaves for everyone on this network.">
      <DealRulesSwitch />
      <FormLimitsSwitch />
    </DeskPage>
  );
}
