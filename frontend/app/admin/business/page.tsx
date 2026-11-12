'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';
import { useDialog } from '@/shared/components/Dialog';
import { AdminPageHeader } from '@/features/admin/AdminPageHeader';

/// Admin business review: the on-chain verification queue. Approve signs
/// approve(applicant) on the registry via the reviewer wallet and flips the
/// account to verified; reject anchors a reason hash. Distinct from the
/// Profiles tab "verify biz" shortcut, which only sets the off-chain flag.

type Pending = {
  address: string;
  workspaceId?: string;
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
    const busyKey = `${p.address}:${p.workspaceId ?? ''}`;
    setBusy(busyKey);
    try {
      const r = await api.adminReviewBusiness(p.address, 'approve', undefined, p.workspaceId);
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
    const busyKey = `${p.address}:${p.workspaceId ?? ''}`;
    setBusy(busyKey);
    try {
      const reasonHash = await sha256Hex(reason.trim());
      const r = await api.adminReviewBusiness(p.address, 'reject', reasonHash, p.workspaceId);
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
      <AdminPageHeader
        eyebrow="BUSINESS REVIEW"
        title="Verify the businesses entering the market"
        description="Check the submitted company evidence, then approve or decline the business profile. The decision is separate from the person's identity."
        meta={pending ? `${pending.length} awaiting review` : 'Waiting for the verification queue'}
      />
      {err && <p role="alert" className="mt-5 border-l-2 border-[#5A2A2E] px-3 py-2 text-[12px] text-[var(--d-red)]">• Error: {err}</p>}

      <div className="mt-4 space-y-3 md:hidden">
        {pending && pending.length === 0 ? (
          <div className="rounded-lg border border-[var(--d-line)] px-4 py-8 text-center text-[12px] text-[var(--d-text-3)]">
            Nothing awaiting review.
          </div>
        ) : null}
        {(pending ?? []).map((p) => (
          <article key={`${p.address}:${p.workspaceId ?? ''}`} className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-[var(--d-text)]">{p.company?.companyName || '—'}</p>
                <p className="mt-1 text-[11px] text-[var(--d-text-2)]">
                  {[p.company?.sector, p.company?.region].filter(Boolean).join(' · ') || 'No sector or region supplied'}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-[var(--d-line)] px-2 py-1 text-[9px] text-[var(--d-text-2)]">
                {p.docKind || 'doc'}
              </span>
            </div>
            <dl className="mt-4 space-y-3 border-y border-[var(--d-line)] py-3">
              <div>
                <dt className="text-[9px] text-[var(--d-text-3)]">Applicant</dt>
                <dd className="mt-1"><CopyId value={p.address} label={short(p.address)} className="min-h-11 text-[11px] text-[var(--d-text-2)]" /></dd>
              </div>
              <div>
                <dt className="text-[9px] text-[var(--d-text-3)]">Document</dt>
                <dd className="mt-1 break-words text-[11px] text-[var(--d-text-2)]">{p.label || (p.docHash ? short(p.docHash) : 'Not supplied')}</dd>
              </div>
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => approve(p)} disabled={busy === `${p.address}:${p.workspaceId ?? ''}`} className="min-h-11 rounded-lg border border-[#7fae6f]/30 px-3 text-[10px] font-bold text-[#9ac58b] disabled:opacity-40">Approve</button>
              <button type="button" onClick={() => reject(p)} disabled={busy === `${p.address}:${p.workspaceId ?? ''}`} className="min-h-11 rounded-lg border border-[#5A2A2E] px-3 text-[10px] font-bold text-[#e79a79] disabled:opacity-40">Reject</button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 hidden overflow-x-auto rounded-lg border border-[var(--d-line)] md:block">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="text-[var(--d-text-2)] text-[10px]">
              <th className="text-start font-normal px-3 py-2.5">Company</th>
              <th className="text-start font-normal px-3 py-2.5">Applicant</th>
              <th className="text-start font-normal px-3 py-2.5">Document</th>
              <th className="text-end font-normal px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending && pending.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[var(--d-text-3)]">
                  Nothing awaiting review.
                </td>
              </tr>
            ) : null}
            {(pending ?? []).map((p) => (
              <tr key={`${p.address}:${p.workspaceId ?? ''}`} className="border-t border-[var(--d-line)] hover:bg-[var(--d-surface)]">
                <td className="px-3 py-2.5">
                  <div className="text-[var(--d-text)]">{p.company?.companyName || '—'}</div>
                  <div className="text-[11px] text-[var(--d-text-2)]">
                    {[p.company?.sector, p.company?.region].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <CopyId
                    value={p.address}
                    label={short(p.address)}
                    className="text-[11px] text-[var(--d-text-2)]"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[10px] text-[var(--d-text-2)]">
                    {p.docKind || 'doc'}
                  </span>
                  <div className="text-[11px] text-[var(--d-text-3)]">
                    {p.label || (p.docHash ? short(p.docHash) : '—')}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-3 text-[10px]">
                    <button
                      type="button"
                      onClick={() => approve(p)}
                      disabled={busy === `${p.address}:${p.workspaceId ?? ''}`}
                      className="text-[#7fae6f] hover:text-[var(--d-text)] disabled:opacity-40"
                    >
                      approve
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(p)}
                      disabled={busy === `${p.address}:${p.workspaceId ?? ''}`}
                      className="text-[var(--d-red)] hover:text-[var(--d-text)] disabled:opacity-40"
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
