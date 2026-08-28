'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type TeamAccessKeyView } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';
import { Skeleton, SkeletonText } from '@/shared/components/Skeleton';

/// Issue and revoke access to the team canon.
///
/// The canon is what the team MCP answers from: positioning, claims we can and
/// cannot make, the numbers. A key is one person's access to it, so the screen
/// is built around the two moments that matter. Issuing shows the key once and
/// says so plainly, and revoking is one click with the caching window stated
/// rather than buried.

const ROLES: Array<{ value: 'dev' | 'marketing'; label: string; hint: string }> = [
  { value: 'marketing', label: 'Marketing', hint: 'Positioning, claims, voice' },
  { value: 'dev', label: 'Dev', hint: 'Adds architecture and contract facts' },
];

function when(ts: number | null): string {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function IssuedKey({ rawKey, onDone }: { rawKey: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
    } catch {
      // Clipboard is blocked without a secure context or permission. The key is
      // on screen and selectable, so this is a downgrade, not a failure.
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 border border-[#c9a227]/40 bg-[#c9a227]/10 rounded-xl p-4">
      <p className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[#e5c76b]">
        Copy this now
      </p>
      <p className="mt-1.5 text-[12px] text-white/70 max-w-[62ch]">
        This is the only time the key is shown. It is stored as a hash, so it cannot be recovered.
        If it is lost, revoke it and issue another.
      </p>
      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <code className="min-w-0 flex-1 font-mono text-[12px] break-all bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-white select-all">
          {rawKey}
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
        I have saved it
      </button>
    </div>
  );
}

export default function AdminTeamKeysPage() {
  const { confirm } = useDialog();
  const [keys, setKeys] = useState<TeamAccessKeyView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [member, setMember] = useState('');
  const [role, setRole] = useState<'dev' | 'marketing'>('marketing');
  const [issuing, setIssuing] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminListTeamKeys()
      .then((r) => {
        setKeys(r.keys);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load keys'));
  }, []);

  useEffect(load, [load]);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    if (issuing || !label.trim() || !member.trim()) return;
    setIssuing(true);
    setErr(null);
    try {
      const r = await api.adminIssueTeamKey({
        label: label.trim(),
        member: member.trim(),
        role,
      });
      setRawKey(r.rawKey);
      setLabel('');
      setMember('');
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not issue the key');
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(key: TeamAccessKeyView) {
    if (revoking) return;
    // The operator should read the name before it goes, so the key and the
    // person are both in the prompt rather than a bare "are you sure".
    const ok = await confirm({
      title: 'Revoke this key',
      message: `"${key.label}" for ${key.member} stops working. A client already running may keep answering for up to 15 minutes before it re-checks.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    setRevoking(key.id);
    try {
      await api.adminRevokeTeamKey(key.id);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not revoke the key');
    } finally {
      setRevoking(null);
    }
  }

  const active = keys?.filter((k) => k.active) ?? [];
  const revoked = keys?.filter((k) => !k.active) ?? [];

  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/40">[:TEAM KEYS:]</p>
      <h1 className="mt-2 font-sans text-[24px] font-extrabold">Canon access</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[68ch]">
        One key per person per machine. A key lets the team MCP read the canon and answer from it.
        Revoking takes effect here immediately, but a client that is already running can keep
        working for up to 15 minutes before it re-checks.
      </p>

      {err && (
        <p className="mt-4 text-[12px] text-[#e0794f] border border-[#e0794f]/30 bg-[#e0794f]/10 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      <form onSubmit={issue} className="mt-6 border border-white/10 rounded-xl p-5 bg-[#161616]">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">Issue a key</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">Person</span>
            <input
              value={member}
              onChange={(e) => setMember(e.target.value)}
              placeholder="aisha"
              maxLength={80}
              className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none"
            />
          </label>
          <label className="block">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
              What it is for
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="work laptop"
              maxLength={80}
              className="mt-1.5 w-full bg-[#0e0e0e] border border-white/15 rounded-lg px-3 py-2.5 text-[14px] focus:border-white/40 outline-none"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              title={r.hint}
              className={`mono text-[10px] uppercase tracking-[0.12em] px-3 py-2 rounded-lg border transition ${
                role === r.value
                  ? 'bg-white text-[#0e0e0e] border-white font-bold'
                  : 'border-white/15 text-white/55 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="self-center text-[11px] text-white/35">
            {ROLES.find((r) => r.value === role)?.hint}
          </span>
        </div>

        <button
          type="submit"
          disabled={issuing || !label.trim() || !member.trim()}
          className="mt-4 mono text-[11px] uppercase tracking-[0.12em] font-bold px-4 py-2.5 rounded-lg bg-white text-[#0e0e0e] disabled:opacity-40 transition"
        >
          {issuing ? 'Issuing...' : 'Issue key'}
        </button>

        {rawKey && <IssuedKey rawKey={rawKey} onDone={() => setRawKey(null)} />}
      </form>

      {keys === null ? (
        <div className="mt-8 max-w-2xl" role="status" aria-label="Loading team access keys">
          <Skeleton className="h-3 w-28 bg-white/[0.05]" />
          <SkeletonText lines={3} className="mt-4" />
        </div>
      ) : (
        <>
          <section className="mt-8">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Active ({active.length})
            </p>
            {active.length === 0 ? (
              <p className="mt-3 text-[13px] text-white/35">No keys issued yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {active.map((k) => (
                  <li
                    key={k.id}
                    className="border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold">
                        {k.member}
                        <span className="ml-2 mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                          {k.role}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12px] text-white/45">
                        {k.label} · issued {when(k.createdAt)} · last used {when(k.lastUsedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(k)}
                      disabled={revoking === k.id}
                      className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-2 rounded-lg border border-[#e0794f]/40 text-[#e0794f] hover:bg-[#e0794f]/10 disabled:opacity-40 transition"
                    >
                      {revoking === k.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {revoked.length > 0 && (
            <section className="mt-8">
              {/* Kept on screen rather than deleted. Who had access and when it
                  ended is the first question asked after an incident. */}
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                Revoked ({revoked.length})
              </p>
              <ul className="mt-3 space-y-2">
                {revoked.map((k) => (
                  <li key={k.id} className="border border-white/5 rounded-xl px-4 py-3 opacity-50">
                    <p className="text-[14px]">
                      {k.member}
                      <span className="ml-2 mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                        {k.role}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-white/45">
                      {k.label} · revoked {when(k.revokedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
