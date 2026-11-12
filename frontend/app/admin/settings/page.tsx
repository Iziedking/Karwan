'use client';

import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { DealRulesSwitch } from '@/features/admin/DealRulesSwitch';
import { FormLimitsSwitch } from '@/features/admin/FormLimitsSwitch';
import { DeskCard, DetailRow } from '@/features/admin/desk/DeskCard';
import { DeskPage } from '@/features/admin/desk/DeskPage';
import { StatusPill } from '@/features/admin/desk/StatusPill';

/// Settings (view 79, frame 284:5176): the switches the desk can turn, and the
/// server's own switches read on or off. The server never sends a value.
export default function AdminSettingsPage() {
  const [server, setServer] = useState<Array<{ name: string; on: boolean }> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.adminSettings().then((r) => setServer(r.server), () => setFailed(true));
  }, []);

  return (
    <DeskPage title="Settings" subtitle="Switches that change how Karwan behaves for everyone on this network.">
      <DealRulesSwitch />
      <FormLimitsSwitch />
      <DeskCard title="Set on the server">
        <div className="space-y-2.5 px-4 pb-4">
          <p className="text-[12px] text-[var(--d-text-3)]">These change with the server's settings and a restart, not from here.</p>
          {failed && <p role="alert" className="text-[13px] text-[var(--d-red)]">These could not be read.</p>}
          {server?.map((s) => (
            <DetailRow key={s.name} label={s.name}>
              <StatusPill tone={s.on ? 'green' : 'grey'}>{s.on ? 'On' : 'Off'}</StatusPill>
            </DetailRow>
          ))}
        </div>
      </DeskCard>
    </DeskPage>
  );
}
