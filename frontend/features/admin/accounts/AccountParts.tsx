'use client';

import { useState } from 'react';
import { api, ApiError, type AdminAccountView } from '@/core/api';
import { pageAccess } from '@/features/admin/adminNavigation';
import { DeskButton, DeskLink } from '@/features/admin/desk/DeskPage';
import { deskMe, useDesk } from '@/features/admin/desk/deskContext';
import { useDialog } from '@/shared/components/Dialog';

/// What a teammate can do on an account (view 79): write to the person, open a
/// case, pause money out (change), ask to lift a pause (fix, then a second
/// teammate), and mark a business as checked (change).
export function AccountActions({ view, onChanged }: { view: AdminAccountView; onChanged: () => void }) {
  const { me } = useDesk();
  const { confirm, prompt, notify } = useDialog();
  const [busy, setBusy] = useState(false);
  const level = pageAccess(deskMe(me), ['profiles']);
  const support = pageAccess(deskMe(me), ['support']);
  const caseHref = `/admin/support?address=${encodeURIComponent(view.address)}`;

  async function run(work: () => Promise<string>) {
    setBusy(true);
    try {
      notify(await work());
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'That did not work. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    const ok = await confirm({
      title: `Pause money out for ${view.name}`,
      message: 'Nothing can leave this account until the pause is lifted: by the person with World ID, or by two teammates. Deals and money coming in carry on.',
      confirmLabel: 'Pause money out',
      danger: true,
    });
    if (ok) await run(async () => (await api.adminPauseAccount(view.address), 'Money out is paused'));
  }

  async function unpause() {
    const reason = await prompt({
      title: 'Ask to lift the pause',
      message: 'A second teammate approves it on Waiting for you. Start with the case, like "KS-1042: ...".',
      placeholder: 'Why the pause can go',
      confirmLabel: 'Ask for approval',
    });
    if (reason?.trim()) await run(async () => (await api.adminUnpauseAccount(view.address, reason.trim()), 'Asked. A second teammate approves it.'));
  }

  async function business(status: 'verified' | 'rejected') {
    const ok = await confirm({
      title: status === 'verified' ? 'Mark as a checked business' : 'Remove the business check',
      message: status === 'verified' ? 'The account shows as a checked business.' : 'The account no longer shows as a checked business.',
      confirmLabel: status === 'verified' ? 'Mark checked' : 'Remove',
      danger: status !== 'verified',
    });
    if (ok) await run(async () => (await api.adminSetBusiness(view.address, status), status === 'verified' ? 'Marked as a checked business' : 'Business check removed'));
  }

  const change = level === 'change' || level === 'fix';
  return (
    <>
      {support && <DeskLink href={caseHref}>Message or open a case</DeskLink>}
      {change && !view.paused && <DeskButton disabled={busy} onClick={() => void pause()}>Pause money out</DeskButton>}
      {level === 'fix' && view.paused && <DeskButton disabled={busy} onClick={() => void unpause()}>Ask to lift the pause</DeskButton>}
      {change && view.accountType === 'business' && (
        view.business === 'verified'
          ? <DeskButton disabled={busy} onClick={() => void business('rejected')}>Remove the business check</DeskButton>
          : <DeskButton disabled={busy} onClick={() => void business('verified')}>Mark as a checked business</DeskButton>
      )}
    </>
  );
}
