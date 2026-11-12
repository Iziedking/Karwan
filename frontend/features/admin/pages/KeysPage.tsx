'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminDeskKey } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

/// A member's keys for scripts (view 64). A key carries its member's pages and
/// name, is shown once, and ends when the member ends it or the owner revokes
/// them. A script also needs a Cloudflare service token to reach the desk.

function when(ts: number | null): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminKeysPage() {
  const { confirm } = useDialog();
  const [keys, setKeys] = useState<AdminDeskKey[] | null>(null);
  const [label, setLabel] = useState('');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminDeskKeys()
      .then((r) => setKeys(r.keys))
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load keys'));
  }, []);
  useEffect(load, [load]);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminMakeDeskKey(label.trim());
      setRawKey(r.rawKey);
      setLabel('');
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not make the key');
    } finally {
      setBusy(false);
    }
  }

  async function end(k: AdminDeskKey) {
    const ok = await confirm({ title: 'End this key', message: `"${k.label}" stops working at once.`, confirmLabel: 'End key', danger: true });
    if (!ok) return;
    try {
      await api.adminEndDeskKey(k.id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not end the key');
    }
  }

  return (
    <div>
      <p className="text-[10px] text-[var(--d-text-2)]">Your keys</p>
      <h1 className="mt-2 font-sans text-[24px] font-semibold">Keys for your scripts</h1>
      <p className="mt-2 max-w-[68ch] text-[13px] text-[var(--d-text-2)]">
        A key can do what your pages allow, and every change it makes is logged with your name. Money moves made with a key still wait for a second member.
      </p>
      {err && <p role="alert" className="mt-4 rounded-lg border border-[#5A2A2E] bg-[#3A1C1F] px-3 py-2 text-[12px] text-[var(--d-red)]">{err}</p>}

      <form onSubmit={make} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-5">
        <label className="min-w-[240px] flex-1">
          <span className="text-[10px] text-[var(--d-text-2)]">What it is for</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--d-line)] bg-[var(--d-bg)] px-3 text-[14px] outline-none focus:border-[var(--d-line-2)]" />
        </label>
        <button type="submit" disabled={busy || !label.trim()} className="min-h-11 rounded-lg bg-[var(--d-lime)] px-4 text-[12px] font-bold text-[#0D0E10] disabled:opacity-40">
          Make a key
        </button>
      </form>

      {rawKey && (
        <div className="mt-5 rounded-lg border border-[#c9a227]/40 bg-[#c9a227]/10 p-4">
          <p className="text-[13px] font-bold text-[var(--d-amber)]">Copy this now</p>
          <p className="mt-1 text-[12px] text-[var(--d-text)]">This is the only time it is shown. If it is lost, end it and make another.</p>
          <code className="mt-3 block select-all break-all rounded-lg border border-[var(--d-line)] bg-[var(--d-bg)] px-3 py-2.5 font-mono text-[12px]">{rawKey}</code>
          <button type="button" onClick={() => setRawKey(null)} className="mt-3 min-h-11 px-2 text-[12px] text-[var(--d-text-2)]">I have saved it</button>
        </div>
      )}

      <ul className="mt-6 divide-y divide-[var(--d-line)] border-y border-[var(--d-line)]">
        {keys?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[14px] font-semibold">{k.label}</p>
              <p className="text-[12px] text-[var(--d-text-2)]">Made {when(k.createdAt)}, last used {when(k.lastUsedAt)}{k.revokedAt ? `, ended ${when(k.revokedAt)}` : ''}</p>
            </div>
            {!k.revokedAt && (
              <button type="button" onClick={() => end(k)} className="min-h-11 rounded-lg border border-[#5A2A2E] px-3 text-[12px] text-[var(--d-red)]">End key</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
