'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type AdminGuaranteeHold, type AdminOwed, type AdminHeldTransfer, type AdminHeldView, type AdminWrongToken } from '@/core/api';
import { CopyId } from '@/shared/components/CopyId';
import { AdminPageHeader } from '@/features/admin/AdminPageHeader';
import { CaseDesk } from '@/features/admin/CaseDesk';
import { DeliveryReviewPanel } from '@/features/admin/DeliveryReviewPanel';

/// The support desk (view 78): cases from the website, Telegram and email on
/// top, then what is held for a person without a case. Polls so new cases,
/// replies and holds show up.

const POLL_MS = 5000;

export default function AdminSupport() {
  /// Held matches and held links waiting for a person, with no ticket needed (view 21).
  const [held, setHeld] = useState<AdminHeldView | null>(null);
  const [heldJob, setHeldJob] = useState<string | null>(null);
  /// Tokens that are not USDC on addresses Karwan holds, to send back by hand (view 59).
  const [wrongTokens, setWrongTokens] = useState<AdminWrongToken[]>([]);
  /// Transfers between networks held for a person (view 60).
  const [heldTransfers, setHeldTransfers] = useState<AdminHeldTransfer[]>([]);
  /// Deal guarantees the vault refused to keep, free or pay out of (view 62).
  const [guaranteeHolds, setGuaranteeHolds] = useState<AdminGuaranteeHold[]>([]);
  const [owed, setOwed] = useState<AdminOwed | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const h = await api.adminSupportHeld().catch(() => null);
      if (h) setHeld((prev) => (JSON.stringify(prev) === JSON.stringify(h) ? prev : h));
      const w = await api.adminWrongTokens().catch(() => null);
      if (w) setWrongTokens((prev) => (JSON.stringify(prev) === JSON.stringify(w.items) ? prev : w.items));
      const t = await api.adminHeldTransfers().catch(() => null);
      if (t) setHeldTransfers((prev) => (JSON.stringify(prev) === JSON.stringify(t.items) ? prev : t.items));
      const g = await api.adminGuaranteeHolds().catch(() => null);
      if (g) setGuaranteeHolds((prev) => (JSON.stringify(prev) === JSON.stringify(g.items) ? prev : g.items));
      const o = await api.adminOwed().catch(() => null);
      if (o) setOwed((prev) => (JSON.stringify(prev) === JSON.stringify(o) ? prev : o));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="CUSTOMER SUPPORT"
        title="Support"
        description="Every case from the website, Telegram and email, oldest due first. A first reply is due within 2 hours, 8am to 10pm Lagos time."
      />
      {err && <p role="alert" className="mt-5 border-l-2 border-[#5A2A2E] px-3 py-2 text-[12px] text-[var(--d-red)]">• Error: {err}</p>}
      <CaseDesk />

      {held && (held.matches.length > 0 || held.links.length > 0 || (held.works?.length ?? 0) > 0) && (
        <section className="mt-5 space-y-2" aria-label="Held for a look">
          <p className="text-[10px] text-[var(--d-text-2)]">Held for a look</p>
          <div className="border border-[var(--d-line)] rounded-lg divide-y divide-[var(--d-line)]">
            {held.matches.map((m) => (
              <button key={`m-${m.jobId}`} type="button" onClick={() => setHeldJob(heldJob === m.jobId ? null : m.jobId)} className={`w-full text-start p-3 transition ${heldJob === m.jobId ? 'bg-[var(--d-hover)]' : 'hover:bg-[var(--d-hover)]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">Match held · {m.amountUsdc} USDC</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">{m.jobId.slice(0, 10)}…</span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--d-text-2)]">{m.reasons.map((r) => r.text).join(' ') || m.flags.join(', ')}</p>
                {m.offences.length > 0 && (
                  <p className="mt-1 text-[12px] text-[var(--d-text-2)]">
                    {m.offences.map((o) => `${o.address.slice(0, 8)}… ${o.count} on record, from ${o.from.map((f) => f.jobId.slice(0, 10)).join(', ')}`).join(' · ')}
                  </p>
                )}
              </button>
            ))}
            {held.links.map((l) => (
              <button key={`l-${l.jobId}`} type="button" onClick={() => setHeldJob(heldJob === l.jobId ? null : l.jobId)} className={`w-full text-start p-3 transition ${heldJob === l.jobId ? 'bg-[var(--d-hover)]' : 'hover:bg-[var(--d-hover)]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">Link held ({l.verificationStatus}) · {l.amountUsdc} USDC · delivery {l.deliveryRevision}</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">{l.jobId.slice(0, 10)}…</span>
                </div>
              </button>
            ))}
            {(held.works ?? []).map((w) => (
              <button key={`w-${w.jobId}`} type="button" onClick={() => setHeldJob(heldJob === w.jobId ? null : w.jobId)} className={`w-full text-start p-3 transition ${heldJob === w.jobId ? 'bg-[var(--d-hover)]' : 'hover:bg-[var(--d-hover)]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">Work does not match the request · {w.amountUsdc} USDC · delivery {w.deliveryRevision}</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">{w.jobId.slice(0, 10)}…</span>
                </div>
              </button>
            ))}
          </div>
          {heldJob && <DeliveryReviewPanel key={heldJob} jobId={heldJob} onChanged={() => void loadList()} />}
        </section>
      )}

      {guaranteeHolds.length > 0 && (
        <section className="mt-5 space-y-2" aria-label="Deal guarantees to check">
          <p className="text-[10px] text-[var(--d-text-2)]">Deal guarantees to check · Karwan pays nothing from here</p>
          <p className="text-[12px] text-[var(--d-text-2)]">GUARANTEE_KEEP_FAILED: the vault keeps refusing to reserve the guarantee past the deal, so keepStake is retried every 10 minutes. GUARANTEE_LAPSED: the reservation ran out while the deal is open, so a ruling cannot pay the buyer from it. GUARANTEE_NOT_FREED: it was not freed at the end and frees itself at the date shown. GUARANTEE_PAYOUT_FAILED: a ruling's payment to the buyer failed and the contract cannot retry it. Read the ruling transaction, then decide.</p>
          <div className="border border-[var(--d-line)] rounded-lg divide-y divide-[var(--d-line)]">
            {guaranteeHolds.map((h) => (
              <div key={h.dealId} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">{h.sellerStakeUsdc ?? '?'} USDC guarantee · {h.reason}{h.freesAt ? ` · frees ${new Date(h.freesAt).toLocaleDateString()}` : ''}</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">{new Date(h.at).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-[var(--d-text-2)]">
                  {h.jobId ? <CopyId value={h.jobId} /> : null}
                  <CopyId value={h.dealId} />
                  {h.txHash ? <CopyId value={h.txHash} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {owed && owed.open.length > 0 && (
        <section className="mt-5 space-y-2" aria-label="Money owed to people">
          <p className="text-[10px] text-[var(--d-text-2)]">Money owed to people · only the owed wallet can collect it</p>
          <p className="text-[12px] text-[var(--d-text-2)]">A payout to this wallet failed, so the contract keeps it as owed. The person sees it on Money with a Collect button, and the assistant can collect it for a wallet Karwan holds. Totals: {owed.totals.map((t) => `${t.contract} ${t.totalUsdc ?? '?'} USDC`).join(' · ')}</p>
          <div className="border border-[var(--d-line)] rounded-lg divide-y divide-[var(--d-line)]">
            {owed.open.map((o) => (
              <div key={`${o.contract}:${o.wallet}`} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">{o.amountUsdc} USDC owed · {o.contract}</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">since {new Date(o.firstSeenAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-[var(--d-text-2)]">
                  <CopyId value={o.wallet} />
                  {o.userAddress && o.userAddress !== o.wallet ? <CopyId value={o.userAddress} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {heldTransfers.length > 0 && (
        <section className="mt-5 space-y-2" aria-label="Transfers to check">
          <p className="text-[10px] text-[var(--d-text-2)]">Transfers to check · nothing is sent again by itself</p>
          <p className="text-[12px] text-[var(--d-text-2)]">BRIDGE_FORWARD_FAILED: Circle did not mint. Check the recipient balance, then mint by hand from the attestation for the burn. BRIDGE_BURN_UNKNOWN: no burn was reported. Check the source wallet on its network before anything is sent again.</p>
          <div className="border border-[var(--d-line)] rounded-lg divide-y divide-[var(--d-line)]">
            {heldTransfers.map((h) => (
              <div key={h.bridgeId} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">{h.amountUsdc} USDC · {h.from ?? 'unknown'} to {h.to ?? 'unknown'} · {h.reason}</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">{new Date(h.heldAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-[var(--d-text-2)]">
                  <CopyId value={h.bridgeId} />
                  {h.burnTxHash ? <CopyId value={h.burnTxHash} /> : null}
                  {h.sourceWallet ? <CopyId value={h.sourceWallet} /> : null}
                  {h.reference ? <CopyId value={h.reference} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {wrongTokens.length > 0 && (
        <section className="mt-5 space-y-2" aria-label="Wrong tokens">
          <p className="text-[10px] text-[var(--d-text-2)]">Wrong tokens · send back by hand</p>
          <p className="text-[12px] text-[var(--d-text-2)]">Never credited. Ask the account for a return address, then send from the Circle console. The reference after token- is the Circle transaction id.</p>
          <div className="border border-[var(--d-line)] rounded-lg divide-y divide-[var(--d-line)]">
            {wrongTokens.map((w) => (
              <div key={w.reference ?? `${w.account}-${w.at}`} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[var(--d-text)]">{w.amount} {w.token ?? 'unnamed token'} on {w.chain}</span>
                  <span className="text-[11px] text-[var(--d-text-2)]">{new Date(w.at).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-[var(--d-text-2)]">
                  <CopyId value={w.account} />
                  {w.reference ? <CopyId value={w.reference} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
