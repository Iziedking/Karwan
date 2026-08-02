'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi';
import {
  api,
  ApiError,
  type AdminDisputeRow,
  type AdminDisputePrepared,
} from '@/core/api';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX } from '@/features/profile/config';

/// Arbiter dispute desk.
///
/// A disputed escrow is frozen until two of the three arbiter Safe owners sign
/// the same ruling. There is no Safe web app on Arc Testnet, so this replaces
/// scripts/arbiter-resolve.sh: the backend computes the digest, an owner signs
/// it here in their own wallet, and the relay broadcasts once the threshold is
/// met. No owner needs Arc gas to rule.
///
/// The backend never holds an owner key. It recovers the signer from each
/// signature and checks it against the Safe's own owner list, so an admin
/// session gets you to this page but only a real owner moves money.

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function AdminDisputesPage() {
  const [rows, setRows] = useState<AdminDisputeRow[] | null>(null);
  const [safe, setSafe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminDisputes();
      setRows(r.disputes);
      setSafe(r.safe);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load disputes.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="px-5 py-8 md:px-8 max-w-[1000px]">
      <h1 className="mono text-[12px] uppercase tracking-[0.18em] font-bold">[:DISPUTES:]</h1>
      <p className="mt-2 text-[13px] text-zinc-600 max-w-[70ch]">
        A disputed escrow is frozen until two arbiter owners sign the same ruling. Sign here with
        your own wallet. The relay pays the gas.
      </p>
      {safe ? (
        <p className="mt-1 mono text-[11px] text-zinc-500">Arbiter Safe {short(safe)}</p>
      ) : (
        <p className="mt-1 mono text-[11px] text-[var(--lp-critical)]">
          KARWAN_ARBITER_SAFE is not configured. Signing is disabled.
        </p>
      )}

      {error ? (
        <p className="mt-4 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="mt-6 text-[13px] text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-[13px] text-zinc-500">No open disputes.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((d) => (
            <DisputeCard key={d.jobId} dispute={d} canSign={!!safe} onResolved={load} />
          ))}
        </div>
      )}
    </main>
  );
}

function DisputeCard({
  dispute,
  canSign,
  onResolved,
}: {
  dispute: AdminDisputeRow;
  canSign: boolean;
  onResolved: () => void;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [sellerBps, setSellerBps] = useState(5000);
  const [reason, setReason] = useState('');
  const [prepared, setPrepared] = useState<AdminDisputePrepared | null>(null);
  const [busy, setBusy] = useState<null | 'prepare' | 'sign' | 'exec'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const onWrongChain = !!address && chainId !== ARC_CHAIN_ID;
  /// A Safe verifies owners with ecrecover, so signing here needs a browser
  /// wallet holding a private key. A Circle account has neither a wagmi client
  /// nor an EOA, so it cannot produce a signature at all.
  ///
  /// This used to be an unexplained disabled button: the operator saw a greyed
  /// control and no reason, which is the same dead end as a button that does
  /// nothing when clicked. Name the reason instead.
  const canSignHere = !!address && !!walletClient;
  const cannotSignReason = canSignHere
    ? null
    : 'This account signs through Karwan and has no key of its own, so it cannot sign a Safe ruling. Connect a browser wallet that is an owner of the arbiter Safe.';
  const amount = Number(dispute.dealAmountUsdc);
  const toSeller = (amount * sellerBps) / 10_000;

  async function prepare() {
    setBusy('prepare');
    setErr(null);
    setMsg(null);
    try {
      const p = await api.adminPrepareDispute(dispute.jobId, sellerBps, reason);
      setPrepared(p);
      setMsg(`${p.collected.length} of ${p.threshold} signatures on this ruling.`);
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
      // Typed-data, not a message signature. getTransactionHash already returns
      // the EIP-712 digest, so signing it as a message would prefix it again and
      // the Safe would reject the result.
      // The payload is built server-side and passed through whole, so it is
      // opaque to viem's generics. Cast the argument once rather than the
      // fields: casting each one to `never` makes the call itself unassignable.
      const signature = await walletClient.signTypedData({
        account: address,
        ...prepared.typedData,
      } as Parameters<typeof walletClient.signTypedData>[0]);
      const r = await api.adminSignDispute(dispute.jobId, {
        sellerBps,
        rulingReason: reason,
        signature,
        safeNonce: prepared.nonce,
      });
      setPrepared({ ...prepared, collected: r.collected, ready: r.ready });
      setMsg(
        r.ready
          ? `Threshold met (${r.collected.length}/${r.threshold}). Ready to execute.`
          : `${r.collected.length} of ${r.threshold} signatures. One more owner needed.`,
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Signature rejected.');
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
      setMsg('Resolved on chain.');
      onResolved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Execution failed.');
    } finally {
      setBusy(null);
    }
  }

  const alreadySigned =
    !!address && !!prepared?.collected.some((s) => s.signer.toLowerCase() === address.toLowerCase());

  return (
    <section className="border border-black/15 p-4 md:p-5" style={{ borderRadius: 8 }}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <p className="mono text-[11px] uppercase tracking-[0.14em] font-bold">
          {dispute.dealAmountUsdc} USDC
        </p>
        <p className="mono text-[10px] text-zinc-500">
          raised by the {dispute.disputedBy ?? 'party'} ·{' '}
          {dispute.disputedAt ? new Date(dispute.disputedAt).toLocaleDateString() : 'unknown date'}
        </p>
      </div>
      <p className="mt-1 mono text-[10px] text-zinc-500">
        buyer {short(dispute.buyer)} · seller {short(dispute.seller)} · job{' '}
        {dispute.jobId.slice(0, 10)}…
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[200px_1fr]">
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Seller share (bps)
          </span>
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={sellerBps}
            onChange={(e) => setSellerBps(Number(e.target.value))}
            className="mt-1 w-full border border-black/20 px-2 py-1.5 text-[13px]"
          />
          <span className="mono text-[10px] text-zinc-500">
            seller {toSeller.toFixed(2)} · buyer {(amount - toSeller).toFixed(2)}
          </span>
        </label>
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Written ruling (hashed on chain as the audit anchor)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full border border-black/20 px-2 py-1.5 text-[13px]"
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        Both owners must sign the identical split and ruling. Different text produces a different
        digest and the signatures will not combine.
      </p>

      {prepared ? (
        <p className="mt-2 mono text-[10px] text-zinc-500">
          Safe nonce {prepared.nonce} · signed by{' '}
          {prepared.collected.length === 0
            ? 'nobody yet'
            : prepared.collected.map((s) => short(s.signer)).join(', ')}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={prepare}
          disabled={!canSign || !reason || busy !== null}
          className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 border border-black/25 disabled:opacity-50"
        >
          {busy === 'prepare' ? 'Preparing…' : 'Prepare ruling'}
        </button>
        {onWrongChain ? (
          <button
            type="button"
            onClick={() => switchChain?.({ chainId: ARC_CHAIN_ID })}
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 border border-black/25"
          >
            Switch to Arc
          </button>
        ) : (
          <button
            type="button"
            onClick={sign}
            disabled={!prepared || busy !== null || alreadySigned || !canSignHere}
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-50"
          >
            {busy === 'sign' ? 'Signing…' : alreadySigned ? 'You signed' : 'Sign as owner'}
          </button>
        )}
        <button
          type="button"
          onClick={execute}
          disabled={!prepared?.ready || busy !== null}
          className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-50"
        >
          {busy === 'exec' ? 'Executing…' : 'Execute ruling'}
        </button>
      </div>

      {cannotSignReason && !alreadySigned ? (
        <p className="mt-2 text-[11px] leading-snug text-zinc-500 max-w-[62ch]">
          {cannotSignReason}
        </p>
      ) : null}
      {msg ? <p className="mt-2 mono text-[10px] text-zinc-600">{msg}</p> : null}
      {err ? (
        <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
          {err}
        </p>
      ) : null}
      {txHash ? (
        <a
          href={`${ARC_EXPLORER_TX}${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block mono text-[10px] underline"
        >
          ruling tx ↗
        </a>
      ) : null}
    </section>
  );
}
