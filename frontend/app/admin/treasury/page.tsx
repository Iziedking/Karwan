'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { formatUnits, isAddress, parseUnits } from 'viem';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
} from '@/features/profile/config';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8787';

const ADMIN_TOKEN_KEY = 'karwan-admin-token';

type TreasuryView = {
  address: string | null;
  label: string;
  configured: boolean;
  usdc: string | null;
  totalReserves: string | null;
  owner: string | null;
  keeper: string | null;
  error: string | null;
};

type TreasuriesResp = {
  live: TreasuryView;
  v3: TreasuryView;
  usdc: string;
};

type WhichTreasury = 'live' | 'v3';

const treasuryAbi = [
  {
    type: 'function',
    name: 'payout',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
] as const;

const usdcAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

type ActionLog = {
  id: string;
  kind: 'payout' | 'drain-step-1-payout' | 'drain-step-2-approve' | 'drain-step-2-deposit';
  txHash?: string;
  status: 'pending' | 'done' | 'failed';
  message: string;
  error?: string;
};

function short(addr: string | null | undefined): string {
  if (!addr) return '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AdminTreasuryPage() {
  const [token, setToken] = useState<string>('');
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');

  useEffect(() => {
    const cached = sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
    setToken(cached);
    setTokenDraft(cached);
    setTokenLoaded(true);
  }, []);

  const saveToken = useCallback(() => {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, tokenDraft);
    setToken(tokenDraft);
  }, [tokenDraft]);

  const clearToken = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken('');
    setTokenDraft('');
  }, []);

  if (!tokenLoaded) return null;

  if (!token) {
    return (
      <TokenGate
        draft={tokenDraft}
        setDraft={setTokenDraft}
        onSave={saveToken}
      />
    );
  }

  return <TreasuryConsole token={token} onClearToken={clearToken} />;
}

function TokenGate({
  draft,
  setDraft,
  onSave,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 px-6 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-serif font-medium tracking-tight">Treasury console</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Paste the admin token to load. Token is held in this tab only.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="mt-6 flex flex-col gap-3"
        >
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ADMIN_API_TOKEN"
            autoFocus
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Unlock
          </button>
        </form>
      </div>
    </main>
  );
}

function TreasuryConsole({ token, onClearToken }: { token: string; onClearToken: () => void }) {
  const [data, setData] = useState<TreasuriesResp | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/admin/treasuries`, {
        headers: { 'x-admin-token': token },
      });
      if (r.status === 401) {
        setLoadError('Token rejected. Clear and re-enter.');
        setData(null);
        return;
      }
      if (r.status === 503) {
        setLoadError('Admin API disabled on the server (ADMIN_API_TOKEN unset).');
        setData(null);
        return;
      }
      if (!r.ok) {
        setLoadError(`Backend ${r.status}`);
        setData(null);
        return;
      }
      const json = (await r.json()) as TreasuriesResp;
      setData(json);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-4">
          <div>
            <h1 className="text-2xl font-serif font-medium tracking-tight">Treasury console</h1>
            <p className="mt-1 text-xs text-zinc-500 font-mono">
              {data?.usdc ? `USDC ${short(data.usdc)}` : 'Loading'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-40"
            >
              {loading ? 'Loading' : 'Refresh'}
            </button>
            <button
              onClick={onClearToken}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-100"
            >
              Lock
            </button>
          </div>
        </header>

        {loadError ? (
          <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {loadError}
          </p>
        ) : null}

        {data ? (
          <>
            <WalletStrip />
            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <TreasuryCard which="live" view={data.live} onTx={refresh} />
              <TreasuryCard which="v3" view={data.v3} onTx={refresh} />
            </section>
            <DrainControl live={data.live} v3={data.v3} onTx={refresh} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function WalletStrip() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const onArc = chainId === ARC_CHAIN_ID;

  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="text-sm">
        {isConnected ? (
          <>
            <span className="text-zinc-500">Connected</span>{' '}
            <span className="font-mono">{short(address)}</span>
          </>
        ) : (
          <span className="text-zinc-500">No wallet connected. Use the app top nav to connect.</span>
        )}
      </div>
      {isConnected && !onArc ? (
        <button
          onClick={() => switchChainAsync({ chainId: ARC_CHAIN_ID }).catch(() => {})}
          className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900"
        >
          Switch to Arc
        </button>
      ) : null}
      {isConnected && onArc ? (
        <span className="text-xs text-emerald-700 font-medium">Arc Testnet</span>
      ) : null}
    </div>
  );
}

function TreasuryCard({
  which,
  view,
  onTx,
}: {
  which: WhichTreasury;
  view: TreasuryView;
  onTx: () => void;
}) {
  const { address } = useAccount();
  const isOwner =
    !!address && !!view.owner && address.toLowerCase() === view.owner.toLowerCase();

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          {which === 'live' ? 'Live Treasury' : 'Treasury v3'}
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-500">
          {view.label}
        </span>
      </header>

      {!view.configured ? (
        <p className="mt-4 text-sm text-zinc-500">
          Not configured. Set {which === 'live' ? 'KARWAN_TREASURY_CONTRACT_ADDR' : 'KARWAN_TREASURY_V3_ADDR'} in backend env.
        </p>
      ) : view.owner === null ? (
        <p className="mt-4 text-sm text-red-800">{view.error ?? 'read failed'}</p>
      ) : (
        <>
          {view.error ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {view.error}
            </p>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="Address" value={view.address ?? ''} mono />
            <Field label="Owner" value={view.owner ?? ''} mono />
            <Field label="Keeper" value={view.keeper ?? ''} mono />
            <Field label="USDC balance" value={view.usdc ?? '-'} />
            <Field label="Total reserves" value={view.totalReserves ?? '-'} />
          </dl>

          <PayoutForm
            treasuryAddress={view.address as `0x${string}`}
            ownerMatches={isOwner}
            usdcLabel={view.usdc ?? '0'}
            onTx={onTx}
          />
        </>
      )}
    </article>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 break-all text-xs ${mono ? 'font-mono' : 'font-medium'}`}>
        {value || '-'}
      </dd>
    </div>
  );
}

function PayoutForm({
  treasuryAddress,
  ownerMatches,
  usdcLabel,
  onTx,
}: {
  treasuryAddress: `0x${string}`;
  ownerMatches: boolean;
  usdcLabel: string;
  onTx: () => void;
}) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ActionLog | null>(null);

  const valid = useMemo(() => {
    if (!isAddress(to)) return false;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    return true;
  }, [to, amount]);

  const submit = useCallback(async () => {
    if (!walletClient || !address || !arcClient) return;
    if (chainId !== ARC_CHAIN_ID) return;
    if (!valid) return;
    setBusy(true);
    setLog({ id: crypto.randomUUID(), kind: 'payout', status: 'pending', message: `payout ${amount} USDC to ${short(to)}` });
    try {
      const amountWei = parseUnits(amount, ARC_USDC_DECIMALS);
      const hash = await walletClient.writeContract({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: 'payout',
        args: [to as `0x${string}`, amountWei],
        chain: walletClient.chain,
        account: address,
      });
      setLog((prev) => (prev ? { ...prev, status: 'pending', txHash: hash } : prev));
      await arcClient.waitForTransactionReceipt({ hash });
      setLog((prev) => (prev ? { ...prev, status: 'done' } : prev));
      setAmount('');
      onTx();
    } catch (err) {
      setLog((prev) => (prev ? { ...prev, status: 'failed', error: (err as Error).message } : prev));
    } finally {
      setBusy(false);
    }
  }, [walletClient, address, arcClient, chainId, valid, amount, to, treasuryAddress, onTx]);

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-700">Payout</h3>
      <p className="mt-1 text-[11px] text-zinc-500">
        Calls payout(to, amount). Signed by your connected wallet. Reverts unless you are the owner.
      </p>

      {!ownerMatches ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Your connected wallet is not the owner of this treasury. The contract will revert if you submit.
        </p>
      ) : null}

      <div className="mt-3 grid gap-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder="0xRecipient"
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-mono outline-none focus:border-zinc-500"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.000001}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`USDC (max ${usdcLabel})`}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={() => setAmount(usdcLabel)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-[10px] font-medium"
          >
            Max
          </button>
        </div>
        <button
          onClick={submit}
          disabled={!valid || busy || chainId !== ARC_CHAIN_ID}
          className="mt-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Sending' : 'Payout'}
        </button>
      </div>

      {log ? <LogRow log={log} /> : null}
    </div>
  );
}

function DrainControl({
  live,
  v3,
  onTx,
}: {
  live: TreasuryView;
  v3: TreasuryView;
  onTx: () => void;
}) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ActionLog[]>([]);

  const liveConfigured = !!live.address && !live.error;
  const v3Configured = !!v3.address && !v3.error;
  const liveOwnerMatches =
    !!address && !!live.owner && address.toLowerCase() === live.owner.toLowerCase();

  const valid = useMemo(() => {
    const n = Number(amount);
    return liveConfigured && v3Configured && Number.isFinite(n) && n > 0;
  }, [amount, liveConfigured, v3Configured]);

  const pushStep = (s: ActionLog) => setSteps((prev) => [...prev, s]);
  const patchStep = (id: string, patch: Partial<ActionLog>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const drain = useCallback(async () => {
    if (!walletClient || !address || !arcClient) return;
    if (chainId !== ARC_CHAIN_ID) return;
    if (!valid) return;

    setBusy(true);
    setSteps([]);
    try {
      const amountWei = parseUnits(amount, ARC_USDC_DECIMALS);

      const step1 = { id: crypto.randomUUID(), kind: 'drain-step-1-payout' as const, status: 'pending' as const, message: `payout ${amount} USDC from live to your wallet` };
      pushStep(step1);
      const payoutHash = await walletClient.writeContract({
        address: live.address as `0x${string}`,
        abi: treasuryAbi,
        functionName: 'payout',
        args: [address, amountWei],
        chain: walletClient.chain,
        account: address,
      });
      patchStep(step1.id, { txHash: payoutHash });
      await arcClient.waitForTransactionReceipt({ hash: payoutHash });
      patchStep(step1.id, { status: 'done' });

      const v3Addr = v3.address as `0x${string}`;
      const allowance = (await arcClient.readContract({
        address: ARC_USDC_ADDRESS,
        abi: usdcAbi,
        functionName: 'allowance',
        args: [address, v3Addr],
      })) as bigint;
      if (allowance < amountWei) {
        const step2 = { id: crypto.randomUUID(), kind: 'drain-step-2-approve' as const, status: 'pending' as const, message: `approve v3 to pull ${amount} USDC` };
        pushStep(step2);
        const approveHash = await walletClient.writeContract({
          address: ARC_USDC_ADDRESS,
          abi: usdcAbi,
          functionName: 'approve',
          args: [v3Addr, amountWei],
          chain: walletClient.chain,
          account: address,
        });
        patchStep(step2.id, { txHash: approveHash });
        await arcClient.waitForTransactionReceipt({ hash: approveHash });
        patchStep(step2.id, { status: 'done' });
      }

      const step3 = { id: crypto.randomUUID(), kind: 'drain-step-2-deposit' as const, status: 'pending' as const, message: `deposit ${amount} USDC into v3` };
      pushStep(step3);
      const depositHash = await walletClient.writeContract({
        address: v3Addr,
        abi: treasuryAbi,
        functionName: 'deposit',
        args: [amountWei],
        chain: walletClient.chain,
        account: address,
      });
      patchStep(step3.id, { txHash: depositHash });
      await arcClient.waitForTransactionReceipt({ hash: depositHash });
      patchStep(step3.id, { status: 'done' });

      setAmount('');
      onTx();
    } catch (err) {
      setSteps((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.status !== 'pending') return prev;
        return prev.map((s) =>
          s.id === last.id ? { ...s, status: 'failed', error: (err as Error).message } : s,
        );
      });
    } finally {
      setBusy(false);
    }
  }, [walletClient, address, arcClient, chainId, valid, amount, live.address, v3.address, onTx]);

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold tracking-tight">Drain live to v3</h2>
      <p className="mt-1 text-[11px] text-zinc-500">
        Two-step: live.payout(you, amount), then v3.deposit(amount) (with USDC approve if needed). Requires
        you to be the live treasury owner.
      </p>

      {!liveConfigured || !v3Configured ? (
        <p className="mt-3 text-sm text-zinc-500">Both treasuries must be configured.</p>
      ) : !liveOwnerMatches ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Your connected wallet is not the owner of the live treasury. The payout step will revert.
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.000001}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`USDC (live has ${live.usdc ?? '0'})`}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
        />
        <button
          onClick={drain}
          disabled={!valid || busy || chainId !== ARC_CHAIN_ID}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Running' : 'Drain'}
        </button>
      </div>

      {steps.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {steps.map((s) => (
            <li key={s.id}>
              <LogRow log={s} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function LogRow({ log }: { log: ActionLog }) {
  const tone =
    log.status === 'done'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : log.status === 'failed'
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-zinc-200 bg-zinc-50 text-zinc-700';
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium uppercase tracking-wide">{log.status}</span>
        {log.txHash ? (
          <a
            href={ARC_EXPLORER_TX(log.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline"
          >
            {short(log.txHash)}
          </a>
        ) : null}
      </div>
      <div className="mt-0.5">{log.message}</div>
      {log.error ? <div className="mt-1 break-all font-mono">{log.error}</div> : null}
    </div>
  );
}
