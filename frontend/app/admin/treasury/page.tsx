'use client';

import { useEffect } from 'react';
import { DeskPage } from '@/features/admin/desk/DeskPage';
import { deskMe, useDesk } from '@/features/admin/desk/deskContext';
import TreasuryPage from '@/features/admin/pages/TreasuryPage';
import UsycPage from '@/features/admin/pages/UsycPage';
import { treasurySections } from '@/features/admin/treasurySections';

/// Treasury and yield (view 79, frame 277:2084): one page; each part shows
/// only to a teammate ticked for it. ?tab=yield (old /admin/usyc) scrolls to
/// the yield part.
export default function Page() {
  const { me } = useDesk();
  const parts = treasurySections(deskMe(me));

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'yield') {
      document.getElementById('yield')?.scrollIntoView({ block: 'start' });
    }
  }, []);

  return (
    <DeskPage title="Treasury and yield" subtitle="Money Karwan holds for people, and what it earns while it waits.">
      {parts.treasury && <div className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-4"><TreasuryPage /></div>}
      {parts.yield && <div id="yield" className="scroll-mt-20 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-4"><UsycPage /></div>}
    </DeskPage>
  );
}
