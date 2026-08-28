'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';
import { useDialog } from '@/shared/components/Dialog';

/// Admin business review: the on-chain verification queue. Approve signs
/// approve(applicant) on the registry via the reviewer wallet and flips the
/// account to verified; reject anchors a reason hash. Distinct from the
/// Profiles tab "verify biz" shortcut, which only sets the off-chain flag.

type Pending = {
  address: string;
  docHash?: string;
  docKind?: string;
  label?: string;
  submittedAt?: number;
  submitTxHash?: string;
  company: { companyName?: string; sector?: string; region?: string } | null;
};

function short(s: string): string {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return `0x${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export default function AdminBusiness() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, prompt, notify } = useDialog();

  async function reload() {
    try {
      const r = await api.adminBusinessPending();
      setPending(r.pending);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function approve(p: Pending) {
    const ok = await confirm({
      title: 'Approve business',
      message: `Verify ${p.company?.companyName || short(p.address)} on chain? This signs approve() through the reviewer wallet.`,
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setBusy(p.address);
    try {
      const r = await api.adminReviewBusiness(p.address, 'approve');
      await reload();
      notify(`Verified. Tx ${short(r.txHash)}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function reject(p: Pending) {
    const reason = await prompt({
      title: 'Reject business',
      message: 'Reason for the decline. Only its hash goes on chain.',
      defaultValue: '',
    });
    if (reason === null) return;
    if (!reason.trim()) {
      notify('A reason is required', 'error');
      return;
    }
    setBusy(p.address);
    try {
      const reasonHash = await sha256Hex(reason.trim());
      const r = await api.adminReviewBusiness(p.address, 'reject', reasonHash);
      await reload();
      notify(`Rejected. Tx ${short(r.txHash)}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Business review</h1>
      <p className="mt-2 text-[13px] text-white/45 leading-relaxed max-w-[640px]">
        The on-chain verification queue. Approve signs approve() on the registry through
        the reviewer wallet and flips the account to verified. The Profiles tab keeps a
        separate off-chain override for a stuck case.
      </p>
      {err && <p className="mt-3 text-[13px] text-[#e0794f]">{err}</p>}
      <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        {pending ? `${pending.length} awaiting review` : 'loading...'}
      </p>

      <div className="mt-4 space-y-3 md:hidden">
        {pending && pending.length === 0 ? (
          <div className="rounded-xl border border-white/10 px-4 py-8 text-center text-[12px] text-white/35">
            Nothing awaiting review.
          </div>
        ) : null}
        {(pending ?? []).map((p) => (
          <article key={p.address} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-white/90">{p.company?.companyName || 'â€”'}</p>
                <p className="mt-1 text-[11px] text-white/45">
                  {[p.company?.sector, p.company?.region].filter(Boolean).join(' Â· ') || 'No sector or region supplied'}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 mono text-[9px] uppercase tracking-[0.1em] text-white/50">
                {p.docKind || 'doc'}
              </span>
            </div>
            <dl className="mt-4 space-y-3 border-y border-white/[0.07] py-3">
              <div>
                <dt className="mono text-[9px] uppercase tracking-[0.13em] text-white/30">Applicant</dt>
                <dd className="mt-1"><CopyId value={p.address} label={short(p.address)} className="min-h-11 text-[11px] text-white/60" /></dd>
              </div>
              <div>
                <dt className="mono text-[9px] uppercase tracking-[0.13em] text-white/30">Document</dt>
                <dd className="mt-1 break-words text-[11px] text-white/50">{p.label || (p.docHash ? short(p.docHash) : 'Not supplied')}</dd>
              </div>
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => approve(p)} disabled={busy === p.address} className="min-h-11 rounded-lg border border-[#7fae6f]/30 px-3 mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#9ac58b] disabled:opacity-40">Approve</button>
              <button type="button" onClick={() => reject(p)} disabled={busy === p.address} className="min-h-11 rounded-lg border border-[#e0794f]/30 px-3 mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#e79a79] disabled:opacity-40">Reject</button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="text-white/40 mono text-[10px] uppercase tracking-[0.12em]">
              <th className="text-start font-normal px-3 py-2.5">Company</th>
              <th className="text-start font-normal px-3 py-2.5">Applicant</th>
              <th className="text-start font-normal px-3 py-2.5">Document</th>
              <th className="text-end font-normal px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending && pending.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-white/30">
                  Nothing awaiting review.
                </td>
              </tr>
            ) : null}
            {(pending ?? []).map((p) => (
              <tr key={p.address} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  <div className="text-white/85">{p.company?.companyName || '—'}</div>
                  <div className="text-[11px] text-white/45">
                    {[p.company?.sector, p.company?.region].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <CopyId
                    value={p.address}
                    label={short(p.address)}
                    className="text-[11px] text-white/55"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <span className="mono text-[10px] uppercase tracking-[0.1em] text-white/55">
                    {p.docKind || 'doc'}
                  </span>
                  <div className="text-[11px] text-white/35">
                    {p.label || (p.docHash ? short(p.docHash) : '—')}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-3 mono text-[10px] uppercase tracking-[0.1em]">
                    <button
                      type="button"
                      onClick={() => approve(p)}
                      disabled={busy === p.address}
                      className="text-[#7fae6f] hover:text-white disabled:opacity-40"
                    >
                      approve
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(p)}
                      disabled={busy === p.address}
                      className="text-[#e0794f] hover:text-white disabled:opacity-40"
                    >
                      reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
