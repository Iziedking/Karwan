'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, ApiError, type AdminAccountRow, type AdminAccountView } from '@/core/api';
import { AccountActions } from '@/features/admin/accounts/AccountParts';
import { ACCOUNT_STATUS, ACCOUNT_VIEWS, accountsShown, looksLikeEmail, recordLine, type AccountView } from '@/features/admin/accountsPresentation';
import { SavedViews } from '@/features/admin/desk/Chips';
import { DetailRow } from '@/features/admin/desk/DeskCard';
import { DeskButton, DeskPage } from '@/features/admin/desk/DeskPage';
import { Cell, DeskTable, type DeskColumn } from '@/features/admin/desk/DeskTable';
import { CopyableId, PanelSection, SidePanel, Timeline } from '@/features/admin/desk/SidePanel';
import { StatusPill, type PillTone } from '@/features/admin/desk/StatusPill';
import { deskTime } from '@/features/admin/desk/homeWords';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';

/// Accounts (view 79, frame 290:6399): every account, one status each; a row
/// opens the account beside the list.

const PAGE = 50;
const MOVE_TONE: Record<string, PillTone> = { stuck: 'red', moving: 'amber', failed: 'grey', done: 'green' };
const dayOf = (at: number) => new Date(at + 3_600_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function AccountPanel({ address, onClose }: { address: string; onClose: () => void }) {
  const money = useDeskMoney();
  const [view, setView] = useState<AdminAccountView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(() => {
    api.adminAccount(address).then(setView, (e) => setFailed(e instanceof ApiError ? e.message : 'This account could not load.'));
  }, [address]);
  useEffect(load, [load]);

  const now = Date.now();
  const status = view ? ACCOUNT_STATUS[view.status] : null;
  const amount = (usdc: string | null) => {
    if (usdc === null) return 'Could not read';
    const a = money(usdc);
    return a.under ? `${a.main} · ${a.under}` : a.main;
  };

  return (
    <SidePanel
      title={view?.name ?? 'Account'}
      badge={status ? <StatusPill tone={status.tone}>{status.label}</StatusPill> : undefined}
      idLine={<span className="flex items-center gap-2"><CopyableId value={address} />{view?.handle && <span className="text-[12px] text-[var(--d-text-2)]">@{view.handle}</span>}</span>}
      href={`/admin/accounts/${address}`}
      onClose={onClose}
      actions={view ? <AccountActions view={view} onChanged={load} /> : undefined}
    >
      {failed && <p role="alert" className="px-5 text-[13px] text-[var(--d-red)]">{failed}</p>}
      {view && (
        <>
          <PanelSection title="Money">
            <DetailRow label="Balance">{amount(view.money.balanceUsdc)}</DetailRow>
            <DetailRow label="Held in deals">{amount(view.money.heldUsdc)}</DetailRow>
            <DetailRow label="With their agents">{amount(view.money.agentsUsdc)}</DetailRow>
            <DetailRow label="Stuck" tone={Number(view.money.stuckUsdc) > 0 ? 'red' : undefined}>{amount(view.money.stuckUsdc)}</DetailRow>
          </PanelSection>
          <PanelSection title="Details">
            <DetailRow label="Joined">{dayOf(view.joinedAt)}</DetailRow>
            <DetailRow label="Signed in with">{view.signIn === 'email' ? 'Email' : 'Wallet'}</DetailRow>
            <DetailRow label="Telegram">{view.telegramLinked ? 'Linked' : 'Not linked'}</DetailRow>
            <DetailRow label="Checked">{view.record.checked.length ? view.record.checked.join(', ') : 'Nothing yet'}</DetailRow>
            <DetailRow label="Record">{recordLine(view.record)}</DetailRow>
            {view.paused && <DetailRow label="Money out" tone="red">Paused by {view.paused.by}, {deskTime(view.paused.at, now)}</DetailRow>}
          </PanelSection>
          <PanelSection title="Recent money moves">
            {view.moves.length === 0 ? (
              <p className="text-[13px] text-[var(--d-text-3)]">No money moves yet.</p>
            ) : (
              <Timeline
                items={view.moves.slice(0, 5).map((m) => ({
                  key: m.reference,
                  tone: MOVE_TONE[m.status] ?? 'grey',
                  title: `${m.what} · ${m.statusLabel}`,
                  line: `${deskTime(m.since, now)} · ${money(m.amountUsdc, m.local ? { kept: m.local } : undefined).main}`,
                }))}
              />
            )}
          </PanelSection>
        </>
      )}
    </SidePanel>
  );
}

export default function AccountsPage() {
  const [rows, setRows] = useState<AdminAccountRow[] | null>(null);
  const [byEmail, setByEmail] = useState<AdminAccountRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<AccountView>('all');
  const [query, setQuery] = useState('');
  const [shownCount, setShownCount] = useState(PAGE);
  const [openAddress, setOpenAddress] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminAccounts().then((r) => { setRows(r.accounts); setFailed(null); }, (e) => setFailed(e instanceof ApiError ? e.message : 'Accounts could not load.'));
  }, []);
  useEffect(load, [load]);
  useEffect(() => setShownCount(PAGE), [view, query]);
  useEffect(() => {
    if (!looksLikeEmail(query)) return setByEmail(null);
    const timer = window.setTimeout(() => {
      api.adminAccounts(query.trim()).then((r) => setByEmail(r.accounts), () => setByEmail([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const now = Date.now();
  const all = rows ?? [];
  const shown = byEmail ?? accountsShown(all, view, query, now);
  const views = ACCOUNT_VIEWS.map((v) => ({ ...v, count: accountsShown(all, v.key, '', now).length }));

  const columns: DeskColumn<AdminAccountRow>[] = [
    { key: 'person', label: 'Person', width: '1.6fr', render: (r) => <Cell main={<span className="block truncate">{r.name}</span>} under={r.handle ? `@${r.handle}` : `${r.address.slice(0, 6)}…${r.address.slice(-4)}`} /> },
    { key: 'country', label: 'Country', width: '90px', render: (r) => <span className="text-[13px] text-[var(--d-text-2)]">{r.country ?? '—'}</span> },
    { key: 'joined', label: 'Joined', width: '110px', render: (r) => <span className="text-[13px] text-[var(--d-text-2)]">{dayOf(r.joinedAt)}</span> },
    { key: 'deals', label: 'Deals', width: '70px', align: 'right', render: (r) => <span className="text-[13px] tabular-nums">{r.deals}</span> },
    { key: 'disputes', label: 'Disputes', width: '80px', align: 'right', render: (r) => <span className={`text-[13px] tabular-nums ${r.disputes ? 'text-[var(--d-red)]' : 'text-[var(--d-text-2)]'}`}>{r.disputes}</span> },
    { key: 'status', label: 'Status', width: '130px', render: (r) => <StatusPill tone={ACCOUNT_STATUS[r.status].tone}>{ACCOUNT_STATUS[r.status].label}</StatusPill> },
  ];

  return (
    <DeskPage title="Accounts" subtitle="Every account and how it stands. Open one to see its money, deals and cases." actions={failed ? <DeskButton onClick={load}>Try again</DeskButton> : undefined}>
      {failed && <p role="alert" className="text-[13px] text-[var(--d-red)]">{failed}</p>}
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--d-line)] bg-[var(--d-surface)] px-3 focus-within:border-[var(--d-line-2)]">
        <Search size={14} className="shrink-0 text-[var(--d-text-3)]" aria-hidden />
        <span className="sr-only">Search accounts</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name, @tag, address or the email they wrote from" className="w-full bg-transparent text-[13px] text-[var(--d-text)] outline-none placeholder:text-[var(--d-text-3)]" />
      </label>
      {!query.trim() && <SavedViews views={views} active={view} onChange={(k) => setView(k as AccountView)} />}
      {rows ? (
        <DeskTable
          columns={columns}
          rows={shown.slice(0, shownCount)}
          rowKey={(r) => r.address}
          onOpen={(r) => setOpenAddress(r.address)}
          selected={openAddress}
          empty={query.trim() ? 'No account matches that.' : 'No accounts in this list.'}
          footer={shown.length > shownCount ? (
            <button type="button" onClick={() => setShownCount((n) => n + PAGE)} className="text-[var(--d-blue)] hover:underline">Show {Math.min(PAGE, shown.length - shownCount)} more of {shown.length}</button>
          ) : `${shown.length} ${shown.length === 1 ? 'account' : 'accounts'}`}
        />
      ) : (
        !failed && <div className="h-[300px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]" />
      )}
      {openAddress && <AccountPanel key={openAddress} address={openAddress} onClose={() => setOpenAddress(null)} />}
    </DeskPage>
  );
}
