'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi';
import { api, ApiError, type AdminDisputePrepared, type AdminDisputeRow, type DisputeStatementView } from '@/core/api';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX } from '@/features/profile/config';
import { pageAccess } from '@/features/admin/adminNavigation';
import { SavedViews } from '@/features/admin/desk/Chips';
import { DeskCard, DetailRow } from '@/features/admin/desk/DeskCard';
import { DeskButton, DeskPage } from '@/features/admin/desk/DeskPage';
import { StatusPill } from '@/features/admin/desk/StatusPill';
import { deskMe, useDesk } from '@/features/admin/desk/deskContext';
import { deskTime } from '@/features/admin/desk/homeWords';
import { useDeskMoney } from '@/features/admin/desk/useDeskCurrency';
import { DISPUTE_VIEWS, disputeList, type DisputeView } from '@/features/admin/deskDeals';

/// Disputes (view 79, frame 276:1841).
///
/// A disputed escrow is frozen until two of the three arbiter Safe owners sign
/// the same ruling. The backend computes the digest, an owner signs it here in
/// their own wallet, and the relay broadcasts once the threshold is met. No
/// owner needs Arc gas to rule.
///
/// The backend never holds an owner key. It recovers the signer from each
/// signature and checks it against the Safe's own owner list, so a desk
/// session gets you to this page but only a real owner moves money.

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const INPUT = 'w-full rounded-md border border-[var(--d-line)] bg-[var(--d-bg)] px-3 py-2 text-[13px] text-[var(--d-text)] outline-none focus:border-[var(--d-line-2)]';

export default function AdminDisputesPage() {
  const [rows, setRows] = useState<AdminDisputeRow[] | null>(null);
  const [safe, setSafe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DisputeView>('ruling');

  const load = useCallback(async () => {
    try {
      const r = await api.adminDisputes();
      setRows(r.disputes);
      setSafe(r.safe);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Disputes could not load.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = rows ? disputeList(rows, view) : [];
  const views = DISPUTE_VIEWS.map((v) => ({ ...v, count: rows ? disputeList(rows, v.key).length : undefined }));

  return (
    <DeskPage
      title="Disputes"
      subtitle="When a buyer and seller disagree, both statements and the proof sit side by side. A ruling moves money, so two arbiter owners sign it."
      meta={safe ? <span>Arbiter Safe {short(safe)}</span> : <span className="text-[var(--d-red)]">KARWAN_ARBITER_SAFE is not set. Signing is off.</span>}
    >
      {error && <p role="alert" className="text-[13px] text-[var(--d-red)]">{error}</p>}
      <SavedViews views={views} active={view} onChange={(k) => setView(k as DisputeView)} />
      {rows === null ? (
        <div className="h-[200px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]" />
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] px-4 py-6 text-[13px] text-[var(--d-text-2)]">
          {view === 'ruling' ? 'No dispute needs a ruling.' : 'No dispute is waiting on a party.'}
        </p>
      ) : (
        <div className="space-y-6">
          {shown.map((d) => <DisputeCard key={d.jobId} dispute={d} canSign={!!safe} onResolved={load} />)}
        </div>
      )}
      <PayOutsideFlags />
    </DeskPage>
  );
}

type PayOutsideFlag = Awaited<ReturnType<typeof api.adminPayOutside>>['flags'][number];

/// Deal-chat messages that asked to be paid outside Karwan (view 32). Both
/// sides were warned; nothing was blocked. A repeat is three in 30 days.
function PayOutsideFlags() {
  const [flags, setFlags] = useState<PayOutsideFlag[] | null>(null);
  useEffect(() => {
    api.adminPayOutside().then((r) => setFlags(r.flags), () => setFlags([]));
  }, []);
  const now = Date.now();
  return (
    <DeskCard title="Asked to pay outside Karwan"><div className="px-4 pb-4">
      {flags === null ? null : flags.length === 0 ? (
        <p className="text-[13px] text-[var(--d-text-3)]">No messages flagged.</p>
      ) : (
        <ul className="divide-y divide-[var(--d-line)]">
          {flags.map((f) => (
            <li key={f.messageId} className="py-3 text-[13px]">
              <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-[var(--d-text-3)]">
                <span>{short(f.address)}</span>
                <a className="text-[var(--d-blue)] hover:underline" href={`/deals/${encodeURIComponent(f.jobId)}`}>deal {short(f.jobId)}</a>
                <span>{deskTime(f.at, now)}</span>
                {f.repeat ? <StatusPill tone="red">Repeat</StatusPill> : null}
              </p>
              <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-[var(--d-text)]">{f.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div></DeskCard>
  );
}

function Statement({ side, tagLine, st }: { side: 'buyer' | 'seller'; tagLine: string; st: DisputeStatementView | undefined }) {
  const now = Date.now();
  return (
    <div className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-4">
      <p className="text-[15px] font-semibold">{tagLine}</p>
      <p className="text-[12px] text-[var(--d-text-3)]">{side === 'buyer' ? 'Buyer' : 'Seller'}</p>
      {st ? (
        <div className="mt-3 space-y-2.5">
          <p className="text-[13px] text-[var(--d-text)]">{st.missing}</p>
          <DetailRow label={side === 'buyer' ? 'Received' : 'Delivered'}>{st.received}</DetailRow>
          <DetailRow label="Late">{st.late}</DetailRow>
          {st.links.length > 0 && (
            <DetailRow label="Proof">
              <span className="flex flex-col items-end gap-0.5">
                {st.links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="max-w-[240px] truncate text-[var(--d-blue)] hover:underline">{l}</a>)}
              </span>
            </DetailRow>
          )}
          <DetailRow label="Sent">{deskTime(st.submittedAt, now)}</DetailRow>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[var(--d-text-3)]">No statement yet.</p>
      )}
    </div>
  );
}

function DisputeCard({ dispute, canSign, onResolved }: { dispute: AdminDisputeRow; canSign: boolean; onResolved: () => void }) {
  const { me } = useDesk();
  const money = useDeskMoney();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const mayRule = pageAccess(deskMe(me), ['disputes']) === 'fix';

  // The judge's proposal pre-fills the ruling; the reviewer confirms or changes it.
  const [sellerBps, setSellerBps] = useState(dispute.proposal ? dispute.proposal.sellerBps : 5000);
  const [reason, setReason] = useState(dispute.proposal?.summary ?? '');
  const [prepared, setPrepared] = useState<AdminDisputePrepared | null>(null);
  const [busy, setBusy] = useState<null | 'prepare' | 'sign' | 'exec'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const onWrongChain = !!address && chainId !== ARC_CHAIN_ID;
  /// A Safe verifies owners with ecrecover, so signing here needs a browser
  /// wallet holding a private key. Name the reason rather than grey a button.
  const canSignHere = !!address && !!walletClient;
  const amount = Number(dispute.dealAmountUsdc);
  const toSeller = (amount * sellerBps) / 10_000;
  const held = money(dispute.dealAmountUsdc);

  function choose(bps: number) {
    setSellerBps(bps);
    setPrepared(null);
  }

  async function prepare() {
    setBusy('prepare');
    setErr(null);
    setMsg(null);
    try {
      const p = await api.adminPrepareDispute(dispute.jobId, sellerBps, reason);
      setPrepared(p);
      setMsg(`${p.collected.length} of ${p.threshold} owners signed this ruling.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not prepare the ruling.');
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!prepared || !walletClient || !address) return;
    setBusy('sign');
    setErr(null);
    try {
      // Typed data, not a message signature: getTransactionHash already returns
      // the EIP-712 digest, so a message signature would prefix it again and the
      // Safe would reject it. The payload comes from the server whole.
      const signature = await walletClient.signTypedData({
        account: address,
        ...prepared.typedData,
      } as Parameters<typeof walletClient.signTypedData>[0]);
      const r = await api.adminSignDispute(dispute.jobId, { sellerBps, rulingReason: reason, signature, safeNonce: prepared.nonce });
      setPrepared({ ...prepared, collected: r.collected, ready: r.ready });
      setMsg(r.ready ? `Both owners signed (${r.collected.length} of ${r.threshold}). Ready to run.` : `${r.collected.length} of ${r.threshold} owners signed. One more needed.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Signature refused.');
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    setBusy('exec');
    setErr(null);
    try {
      const r = await api.adminExecuteDispute(dispute.jobId, sellerBps, reason);
      setTxHash(r.txHash);
      setMsg('Ruled on chain.');
      onResolved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'The ruling did not run.');
    } finally {
      setBusy(null);
    }
  }

  /// Hide the controls only when the backend positively said the deal is held
  /// elsewhere; an older backend omits the field.
  const onRetiredEscrow = dispute.rulable === false;
  const alreadySigned = !!address && !!prepared?.collected.some((s) => s.signer.toLowerCase() === address.toLowerCase());
  const preset = sellerBps === 0 ? 'buyer' : sellerBps === 10_000 ? 'seller' : 'split';
  const p = dispute.proposal;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] px-4 py-3">
        <StatusPill tone="red">{disputeList([dispute], 'ruling').length ? 'Needs a ruling' : 'Waiting on a party'}</StatusPill>
        <span className="text-[12px] text-[var(--d-text-3)]">
          deal {short(dispute.jobId)} · raised by the {dispute.disputedBy ?? 'party'}{dispute.disputedAt ? ` · ${deskTime(dispute.disputedAt, Date.now())}` : ''}
        </span>
        <span className="ml-auto text-[14px] font-semibold tabular-nums">{held.main}{held.under ? ` · ${held.under}` : ''} held</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Statement side="buyer" tagLine={short(dispute.buyer)} st={dispute.statements?.buyer} />
        <Statement side="seller" tagLine={short(dispute.seller)} st={dispute.statements?.seller} />
      </div>

      {p && (
        <DeskCard title="The judge's proposal"><div className="px-4 pb-4">
          <p className="text-[13px]">Seller {Math.round(p.sellerBps / 100)}%, buyer {100 - Math.round(p.sellerBps / 100)}%. {p.confidence === 'clear' ? 'Clear.' : 'Not clear.'}</p>
          {p.summary && <p className="mt-1 text-[13px] text-[var(--d-text-2)]">{p.summary}</p>}
          {p.items.length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--d-text-2)]">
              {p.items.map((it, i) => <li key={i}><span className="text-[var(--d-text-3)]">{it.finding}:</span> {it.item}{it.evidence ? ` (${it.evidence})` : ''}</li>)}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-[var(--d-text-3)]">It fills the ruling below. Confirm it or change it.</p>
        </div></DeskCard>
      )}

      {onRetiredEscrow ? (
        <DeskCard title="Held by an older escrow"><div className="px-4 pb-4">
          <p className="text-[13px] text-[var(--d-text-2)]">
            This deal sits on an older escrow ({dispute.venue?.version}{dispute.venue?.escrow ? `, ${short(dispute.venue.escrow)}` : ''}) that has no arbiter and cannot split. A ruling here would collect signatures and then fail. Its only dispute action pays the seller in full: resolve it on that contract, or leave it for the legacy window to close.
          </p>
        </div></DeskCard>
      ) : mayRule ? (
        <DeskCard title="Your ruling"><div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <DeskButton tone={preset === 'buyer' ? 'primary' : 'secondary'} onClick={() => choose(0)}>Refund the buyer</DeskButton>
            <DeskButton tone={preset === 'seller' ? 'primary' : 'secondary'} onClick={() => choose(10_000)}>Pay the seller</DeskButton>
            <DeskButton tone={preset === 'split' ? 'primary' : 'secondary'} onClick={() => choose(5000)}>Split it</DeskButton>
          </div>
          {preset === 'split' && (
            <label className="mt-3 block max-w-[260px] text-[12px] text-[var(--d-text-2)]">
              Seller's share, in hundredths of a percent
              <input type="number" min={0} max={10_000} step={100} value={sellerBps} onChange={(e) => choose(Number(e.target.value))} className={`mt-1 ${INPUT}`} />
            </label>
          )}
          <p className="mt-2 text-[12px] text-[var(--d-text-3)]">Seller gets {toSeller.toFixed(2)} USDC, buyer gets {(amount - toSeller).toFixed(2)} USDC.</p>
          <label className="mt-3 block text-[12px] text-[var(--d-text-2)]">
            The reason both people will read
            <textarea value={reason} onChange={(e) => { setReason(e.target.value); setPrepared(null); }} rows={3} className={`mt-1 ${INPUT}`} />
          </label>
          <p className="mt-2 text-[12px] text-[var(--d-text-3)]">Two arbiter owners sign the same split and reason. Different words make a different ruling, and the signatures will not combine.</p>
          {prepared && (
            <p className="mt-2 text-[12px] text-[var(--d-text-3)]">
              Signed by {prepared.collected.length === 0 ? 'nobody yet' : prepared.collected.map((s) => short(s.signer)).join(', ')} · Safe nonce {prepared.nonce}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <DeskButton onClick={() => void prepare()} disabled={!canSign || !reason.trim() || busy !== null}>{busy === 'prepare' ? 'Preparing' : 'Prepare the ruling'}</DeskButton>
            {onWrongChain ? (
              <DeskButton onClick={() => switchChain?.({ chainId: ARC_CHAIN_ID })}>Switch to Arc</DeskButton>
            ) : (
              <DeskButton tone="primary" onClick={() => void sign()} disabled={!prepared || busy !== null || alreadySigned || !canSignHere}>
                {busy === 'sign' ? 'Signing' : alreadySigned ? 'You signed' : 'Sign as an owner'}
              </DeskButton>
            )}
            <DeskButton tone="primary" onClick={() => void execute()} disabled={!prepared?.ready || busy !== null}>{busy === 'exec' ? 'Running' : 'Run the ruling'}</DeskButton>
          </div>
          {!canSignHere && !alreadySigned && (
            <p className="mt-2 max-w-[62ch] text-[12px] text-[var(--d-text-3)]">Connect a browser wallet that owns the arbiter Safe. An account that signs through Karwan has no key of its own, so it cannot sign a ruling.</p>
          )}
          {msg && <p className="mt-2 text-[12px] text-[var(--d-text-2)]">{msg}</p>}
          {err && <p role="alert" className="mt-2 text-[12px] text-[var(--d-red)]">{err}</p>}
          {txHash && <a href={`${ARC_EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] text-[var(--d-blue)] hover:underline">See the ruling on Arc</a>}
        </div></DeskCard>
      ) : (
        <p className="text-[12px] text-[var(--d-text-3)]">Ruling needs fix on Disputes. Ask the owner.</p>
      )}
    </section>
  );
}
