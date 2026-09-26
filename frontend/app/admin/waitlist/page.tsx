'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/core/api';

const labelClass = 'mono text-[10px] uppercase tracking-[0.12em] text-white/40';
type Data = Awaited<ReturnType<typeof api.adminWaitlist>>;

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

function downloadCsv(rows: Data['waitlist'], invited: Set<string>) {
  const lines = ['email,locale,joined_utc,invited', ...rows.map((r) => `${r.email},${r.locale},${new Date(r.joinedAt).toISOString()},${invited.has(r.email) ? 'yes' : 'no'}`)];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `karwan-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminWaitlistPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminWaitlist());
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the waitlist');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const emailedAt = useMemo(
    () => new Map((data?.invites ?? []).map((i) => [i.email, i.emailedAt])),
    [data],
  );
  const invited = useMemo(
    () => new Set([...(data?.invites.map((i) => i.email) ?? []), ...(data?.envInvites ?? [])]),
    [data],
  );

  async function addInvites() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.adminAddInvites(emails, note.trim() || undefined);
      setResult(`${r.added} invited, ${r.alreadyInvited} already invited${r.invalid.length ? `, not emails: ${r.invalid.join(', ')}` : ''}`);
      setEmails('');
      await load();
    } catch (cause) {
      setResult(cause instanceof ApiError ? cause.message : 'Could not add invites');
    } finally {
      setBusy(false);
    }
  }

  async function approve(email: string) {
    setApproving(email);
    try {
      const r = await api.adminApproveWaitlist(email);
      if (!r.emailed) setError(`${email} is approved, but the email did not send${r.reason ? `: ${r.reason}` : ''}. Use Resend.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `Could not approve ${email}`);
    } finally {
      setApproving(null);
    }
  }

  async function remove(email: string) {
    if (!window.confirm(`Revoke access for ${email}? They go back to the waitlist. An account they already made keeps working.`)) return;
    await api.adminRemoveInvite(email).catch(() => undefined);
    await load();
  }

  return (
    <div>
      <p className={labelClass}>Mainnet</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Waitlist and invites</h1>
      <p className="mt-2 max-w-[72ch] text-[13px] text-white/55">
        Approve someone on the waitlist and they get an email to create their mainnet account. You can also paste
        emails below, or list them in MAINNET_INVITES on the server, read when the container starts.
      </p>

      {error && (
        <div className="mt-5 rounded-lg border border-[#e0794f]/30 bg-[#e0794f]/10 px-3 py-2 text-[12px] text-[#e0794f]">
          {error} <button type="button" onClick={() => void load()} className="ml-2 underline">Retry</button>
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ['On the waitlist', data?.waitlist.length ?? '·'],
          ['Approved', data?.invites.length ?? '·'],
          ['Invited by setting', data?.envInvites.length ?? '·'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#161616] p-4">
            <p className={labelClass}>{label}</p>
            <p className="mono mt-2 text-[22px] text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-white/10 bg-[#161616] p-5">
        <p className={labelClass}>Invite by email</p>
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={4}
          placeholder="Paste emails, separated by commas, spaces or new lines"
          className="mt-3 w-full rounded-lg border border-white/15 bg-black/30 p-3 text-[13px] text-white outline-none focus:border-[#AFC95B]" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), for example: team"
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 p-3 text-[13px] text-white outline-none focus:border-[#AFC95B]" />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => void addInvites()} disabled={busy || !emails.trim()}
            className="min-h-11 rounded-lg bg-[#AFC95B] px-4 text-[13px] font-bold text-[#10171D] disabled:opacity-50">
            Invite
          </button>
          {result && <p className="text-[12px] text-white/70">{result}</p>}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <p className={labelClass}>Waitlist, oldest first</p>
          <button type="button" disabled={!data?.waitlist.length} onClick={() => data && downloadCsv(data.waitlist, invited)}
            className="min-h-11 text-[12px] text-white/70 underline disabled:opacity-40">Download CSV</button>
        </div>
        <table className="mt-3 w-full text-left text-[13px]">
          <thead className="text-white/40">
            <tr><th className="py-2 font-normal">#</th><th className="font-normal">Email</th><th className="font-normal">Language</th><th className="font-normal">Joined</th><th className="font-normal">Access</th></tr>
          </thead>
          <tbody>
            {data?.waitlist.map((r, i) => (
              <tr key={r.email} className="border-t border-white/10">
                <td className="mono py-2 text-white/50">{i + 1}</td>
                <td className="text-white">{r.email}</td>
                <td className="text-white/60">{r.locale}</td>
                <td className="text-white/60">{when(r.joinedAt)}</td>
                <td>
                  {invited.has(r.email) ? (
                    emailedAt.get(r.email) == null && !data?.envInvites.includes(r.email) ? (
                      <span className="text-[#d9ad55]">
                        Approved, email not sent{' '}
                        <button type="button" onClick={() => void approve(r.email)} disabled={approving !== null}
                          className="min-h-9 underline disabled:opacity-50">{approving === r.email ? 'Sending' : 'Resend'}</button>
                      </span>
                    ) : (
                      <span className="text-[#AFC95B]">Approved{emailedAt.get(r.email) ? ', emailed' : ''}</span>
                    )
                  ) : (
                    <button type="button" onClick={() => void approve(r.email)} disabled={approving !== null}
                      className="min-h-9 rounded-md bg-[#AFC95B] px-3 text-[12px] font-bold text-[#10171D] disabled:opacity-50">
                      {approving === r.email ? 'Approving' : 'Approve'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.waitlist.length === 0 && <p className="mt-3 text-[13px] text-white/50">Nobody has joined yet.</p>}
      </section>

      <section className="mt-8">
        <p className={labelClass}>Approved and invited</p>
        <ul className="mt-3 divide-y divide-white/10 text-[13px]">
          {data?.envInvites.map((e) => (
            <li key={`env-${e}`} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-white">{e}</span><span className="text-white/40">From MAINNET_INVITES</span>
            </li>
          ))}
          {data?.invites.map((i) => (
            <li key={i.email} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-white">{i.email}{i.note ? <span className="text-white/40"> · {i.note}</span> : null}</span>
              <button type="button" onClick={() => void remove(i.email)} className="min-h-11 text-[12px] text-[#e0794f] underline">Revoke</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
