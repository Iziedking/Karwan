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
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">Desk access</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Pages for each member</h1>
      <p className="mt-2 max-w-[68ch] text-[13px] text-white/55">
        A member opens only the pages ticked here, and can call only the routes those pages use. Taking a page away or revoking signs them out at once.
      </p>
      {err && <p role="alert" className="mt-4 rounded-lg border border-[#e0794f]/30 bg-[#e0794f]/10 px-3 py-2 text-[12px] text-[#e0794f]">{err}</p>}

      <div className="mt-6 space-y-4">
        {members?.map((m) => {
          const ticked = draft[m.id] ?? [];
          const changed = ticked.slice().sort().join() !== m.pages.slice().sort().join();
          return (
            <section key={m.id} className="rounded-xl border border-white/10 bg-[#161616] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold">{m.name}</p>
                  <p className="text-[12px] text-white/45">{m.email}</p>
                </div>
                {m.owner && <span className="mono text-[10px] uppercase tracking-[0.12em] text-[#AFC95B]">Owner, every page</span>}
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
                          className={`min-h-11 rounded-lg border px-3 text-[12px] transition ${on ? 'border-[#AFC95B] bg-[#AFC95B]/10 text-white' : 'border-white/15 text-white/50 hover:text-white'}`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={!changed || busy === m.id} onClick={() => save(m)} className="min-h-11 rounded-lg bg-[#AFC95B] px-4 text-[12px] font-bold text-[#0A0A0B] disabled:opacity-40">
                      Save pages
                    </button>
                    <button type="button" disabled={busy === m.id || m.pages.length === 0} onClick={() => revoke(m)} className="min-h-11 rounded-lg border border-[#e0794f]/40 px-4 text-[12px] text-[#efaa8d] disabled:opacity-40">
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
