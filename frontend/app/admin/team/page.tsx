'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type TeamMemberView, type TeamInviteView } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

/// Who is on the team, and what they can reach.
///
/// A member signs in at the portal with their own password and connects their
/// AI tools through it. This screen is the other half: deciding who gets in and
/// taking it away. The role is set here and cannot be chosen by the person
/// signing up, which is the reason invitations exist rather than open signup.

const ROLES: Array<{ value: 'dev' | 'marketing'; label: string; hint: string }> = [
  { value: 'marketing', label: 'Marketing', hint: 'Product depth, voice, brand. No internals.' },
  { value: 'dev', label: 'Dev', hint: 'Adds architecture, decisions and the roadmap.' },
];

function when(ts: number | null | undefined): string {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/// The link is shown after issuing because the email can fail and the admin
/// should never be stuck. Copy is one click, since selecting a long URL by hand
/// is how people paste half of one.
function IssuedLink({ link, note, onDone }: { link: string; note: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 border border-[#AFC95B]/40 bg-[#AFC95B]/10 rounded-xl p-4">
      <p className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[#AFC95B]">
        Invitation ready
      </p>
      <p className="mt-1.5 text-[12px] text-white/70 max-w-[62ch]">{note}</p>
      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <code className="min-w-0 flex-1 font-mono text-[12px] break-all bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-white select-all">
          {link}
        </code>
        <button
          type="button"
          onClick={copy}
          className="mono min-h-11 w-full rounded-lg bg-white px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0e0e0e] sm:w-auto"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-3 inline-flex min-h-11 items-center px-2 mono text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white transition"
      >
        Done
      </button>
    </div>
  );
}

export default function AdminTeamPage() {
  const { confirm } = useDialog();
  const [members, setMembers] = useState<TeamMemberView[] | null>(null);
  const [invites, setInvites] = useState<TeamInviteView[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'dev' | 'marketing'>('marketing');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ link: string; note: string } | null>(null);

  const load = useCallback(() => {
    api
      .adminListTeamMembers()
      .then((r) => {
        setMembers(r.members);
        setInvites(r.invites);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load the team'));
  }, []);

  useEffect(load, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adminInviteTeamMember({
        email: email.trim(),
        name: name.trim(),
        role,
      });
      setIssued({ link: r.link, note: r.note });
      setEmail('');
      setName('');
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create the invitation');
    } finally {
      setBusy(false);
    }
  }

  async function resend(inv: TeamInviteView) {
    try {
      const r = await api.adminResendTeamInvite(inv.id);
      setIssued({ link: r.link, note: r.note });
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not resend');
    }
  }

  async function cancel(inv: TeamInviteView) {
    const ok = await confirm({
      title: 'Cancel this invitation',
      message: `${inv.name} (${inv.email}) will not be able to use their link.`,
      confirmLabel: 'Cancel it',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.adminCancelTeamInvite(inv.id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not cancel');
    }
  }

  async function toggle(member: TeamMemberView) {
    const disabling = member.active;
    if (disabling) {
      const ok = await confirm({
        title: 'End access',
        message: `${member.name} is signed out and every tool they connected stops working now, not in an hour.`,
        confirmLabel: 'End access',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const r = await api.adminSetTeamMemberDisabled(member.id, disabling);
      setErr(r.warning ?? null);
      setIssued(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not change access');
    }
  }

  async function resetPassword(member: TeamMemberView) {
    try {
      const r = await api.adminResetTeamMemberPassword(member.id);
      setErr(null);
      // Shown the same way an invite link is: the email is a convenience, and
      // the reason they need a reset at all may be that email is not reaching
      // them.
      setIssued({ link: r.link, note: r.note });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not send a reset link');
    }
  }

  async function remove(member: TeamMemberView) {
    const ok = await confirm({
      title: 'Remove from the team',
      message: `${member.name} (${member.email}) is deleted, not just switched off. Every tool they connected stops working, and that email becomes free to invite again. This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.adminRemoveTeamMember(member.id);
      setErr(null);
      setIssued(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not remove them');
    }
  }

  const openInvites = invites.filter((i) => !i.redeemedAt);

  /// Says what actually happened to the link. Cancelling stores expiresAt as 0,
  /// so the old "not pending means expired" reading turned every invitation the
  /// admin cancelled into one that looked like it had timed out early. That is
  /// how a seven-day link gets reported as dying in a day: it did not expire, it
  /// was cancelled.
  function inviteStatusLabel(inv: TeamInviteView): string {
    const state = inv.state ?? (inv.pending ? 'pending' : 'expired');
    if (state === 'pending') return `expires ${when(inv.expiresAt)}`;
    if (state === 'cancelled') return 'cancelled, issue a new link to undo';
    if (state === 'redeemed') return 'accepted';
    return 'expired, issue a new link';
  }

  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">[:TEAM:]</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">People</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[68ch]">
        Invite somebody and they get an email with a link to set a password. After that they sign in
        at the portal and connect the Claude app, ChatGPT or anything else themselves. Ending access
        cuts off every tool they connected at once.
      </p>

      {err && (
        <p className="mt-4 text-[12px] text-[#e0794f] border border-[#e0794f]/30 bg-[#e0794f]/10 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      <form onSubmit={invite} className="mt-6 border border-white/10 rounded-xl p-5 bg-[#161616]">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">Invite somebody</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aisha"
              maxLength={80}
              className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none"
            />
          </label>
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="aisha@karwan.site"
              maxLength={200}
              className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap items-center">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={`mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border transition ${
                role === r.value
                  ? 'bg-white text-[#0e0e0e] border-white font-bold'
                  : 'border-white/15 text-white/55 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="text-[11px] text-white/35">
            {ROLES.find((r) => r.value === role)?.hint}
          </span>
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim() || !name.trim()}
          className="mt-5 mono text-[10px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-40"
        >
          {busy ? 'Sending' : 'Send invitation'}
        </button>

        {issued && (
          <IssuedLink link={issued.link} note={issued.note} onDone={() => setIssued(null)} />
        )}
      </form>

      {openInvites.length > 0 && (
        <>
          <p className="mt-8 mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Invitations ({openInvites.length})
          </p>
          <div className="mt-3 space-y-2">
            {openInvites.map((inv) => (
              <div
                key={inv.id}
                className="border border-white/10 rounded-xl p-4 bg-[#161616] flex items-start justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-bold">
                    {inv.name}{' '}
                    <span className="mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded border border-white/15 text-white/50">
                      {inv.role}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] text-white/45">
                    {inv.email} · {inviteStatusLabel(inv)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => resend(inv)}
                    className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-white/15 text-white/55 hover:text-white"
                    title="Emails a fresh link. The old one stops working."
                  >
                    {inv.pending ? 'Resend' : 'Issue new link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => cancel(inv)}
                    className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-[#e0794f]/40 text-[#e0794f]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        On the team ({members?.filter((m) => m.active).length ?? 0})
      </p>
      <div className="mt-3 space-y-2">
        {members === null && <p className="text-[13px] text-white/40">Loading</p>}
        {members?.length === 0 && (
          <p className="text-[13px] text-white/40">Nobody yet. Invite somebody above.</p>
        )}
        {members?.map((m) => (
          <div
            key={m.id}
            className={`border rounded-xl p-4 flex items-start justify-between gap-3 flex-wrap ${
              m.active ? 'border-white/10 bg-[#161616]' : 'border-white/5 bg-[#111] opacity-60'
            }`}
          >
            <div className="min-w-0">
              <p className="text-[14px] font-bold">
                {m.name}{' '}
                <span className="mono text-[9px] uppercase tracking-[0.14em] px-2 py-1 rounded border border-white/15 text-white/50">
                  {m.role}
                </span>
                {m.locked && (
                  <span className="ml-2 mono text-[9px] uppercase tracking-[0.14em] text-[#e0794f]">
                    locked out
                  </span>
                )}
              </p>
              <p className="mt-1 text-[12px] text-white/45">
                {m.email} · last signed in {when(m.lastLoginAt)}
                {m.active ? '' : ' · access ended'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggle(m)}
              className={`mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border shrink-0 ${
                m.active
                  ? 'border-[#e0794f]/40 text-[#e0794f]'
                  : 'border-white/15 text-white/55 hover:text-white'
              }`}
            >
              {m.active ? 'End access' : 'Restore'}
            </button>
            {m.active && (
              <button
                type="button"
                onClick={() => resetPassword(m)}
                className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-white/15 text-white/55 hover:text-white shrink-0"
                title="Emails them a one-hour link to set a new password."
              >
                Reset password
              </button>
            )}
            {/* Removal sits next to the softer control rather than replacing it.
                Ending access is reversible and is the right answer most of the
                time; this one is for the address that should never have been
                invited, and it is the only thing that frees the email to be
                invited again. */}
            <button
              type="button"
              onClick={() => remove(m)}
              className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border border-[#e0794f]/40 text-[#e0794f] shrink-0"
              title="Deletes the account so the email can be invited again."
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
