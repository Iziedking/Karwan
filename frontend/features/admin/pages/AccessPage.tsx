'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminDeskMember } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

/// The owner's ticks (view 64): which desk pages each team member can open.
/// Only the owner reaches this page and its routes.

export default function AdminAccessPage() {
  const { confirm } = useDialog();
  const [pages, setPages] = useState<Array<{ key: string; label: string }>>([]);
  const [members, setMembers] = useState<AdminDeskMember[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminAccess()
      .then((r) => {
        setPages(r.pages);
        setMembers(r.members);
        setDraft(Object.fromEntries(r.members.map((m) => [m.id, m.pages])));
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load desk access'));
  }, []);
  useEffect(load, [load]);

  function toggle(id: string, key: string) {
    setDraft((d) => {
      const cur = d[id] ?? [];
      return { ...d, [id]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
    });
  }

  async function save(m: AdminDeskMember) {
    setBusy(m.id);
    setErr(null);
    try {
      await api.adminSetAccess(m.id, draft[m.id] ?? []);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  }

  async function revoke(m: AdminDeskMember) {
    const ok = await confirm({
      title: `Revoke ${m.name}`,
      message: `Every desk page is taken away and ${m.name} is signed out at once, with every key they made. Remove them from the Cloudflare list too.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.adminRevokeAccess(m.id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not revoke');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="text-[10px] text-[var(--d-text-2)]">Desk access</p>
      <h1 className="mt-2 font-sans text-[24px] font-semibold">Pages for each member</h1>
      <p className="mt-2 max-w-[68ch] text-[13px] text-[var(--d-text-2)]">
        A member opens only the pages ticked here, and can call only the routes those pages use. Taking a page away or revoking signs them out at once.
      </p>
      {err && <p role="alert" className="mt-4 rounded-lg border border-[#5A2A2E] bg-[#3A1C1F] px-3 py-2 text-[12px] text-[var(--d-red)]">{err}</p>}

      <div className="mt-6 space-y-4">
        {members?.map((m) => {
          const ticked = draft[m.id] ?? [];
          const changed = ticked.slice().sort().join() !== m.pages.slice().sort().join();
          return (
            <section key={m.id} className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold">{m.name}</p>
                  <p className="text-[12px] text-[var(--d-text-2)]">{m.email}</p>
                </div>
                {m.owner && <span className="text-[10px] text-[var(--d-lime)]">Owner, every page</span>}
              </div>
              {!m.owner && (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pages.map((p) => {
                      const on = ticked.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(m.id, p.key)}
                          className={`min-h-11 rounded-lg border px-3 text-[12px] transition ${on ? 'border-[var(--d-lime)] bg-[#1F2614] text-[var(--d-text)]' : 'border-[var(--d-line)] text-[var(--d-text-2)] hover:text-[var(--d-text)]'}`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={!changed || busy === m.id} onClick={() => save(m)} className="min-h-11 rounded-lg bg-[var(--d-lime)] px-4 text-[12px] font-bold text-[#0D0E10] disabled:opacity-40">
                      Save pages
                    </button>
                    <button type="button" disabled={busy === m.id || m.pages.length === 0} onClick={() => revoke(m)} className="min-h-11 rounded-lg border border-[#5A2A2E] px-4 text-[12px] text-[var(--d-red)] disabled:opacity-40">
                      Revoke
                    </button>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
