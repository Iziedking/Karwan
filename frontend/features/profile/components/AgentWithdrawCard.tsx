'use client';
import { useEffect, useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { cn } from '@/shared/utils/cn';
import { Note } from '@/shared/components/AppUI';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { api, ApiError } from '@/core/api';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX } from '../config';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

type Phase = 'idle' | 'sending' | 'done' | 'error';

interface AgentOption {
  key: 'buyer' | 'seller';
  label: string;
  address?: string;
}

/// Pulls USDC out of a user's agent wallet to any address. The agent wallet
/// signs the transfer through Circle on the backend, so the user never handles
/// the agent's keys.
export function AgentWithdrawCard({
  buyerAgent,
  sellerAgent,
  defaultAgent = 'buyer',
}: {
  buyerAgent?: string;
  sellerAgent?: string;
  defaultAgent?: 'buyer' | 'seller';
}) {
  const { address, isConnected } = useAccount();

  const buyerBalance = useBalance({
    address: (buyerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });
  const sellerBalance = useBalance({
    address: (sellerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });

  const options: AgentOption[] = [
    { key: 'buyer', label: 'Buyer agent', address: buyerAgent },
    { key: 'seller', label: 'Seller agent', address: sellerAgent },
  ];

  const [selected, setSelected] = useState<'buyer' | 'seller'>(defaultAgent);
  useEffect(() => {
    if (!buyerAgent && sellerAgent) setSelected('seller');
    else if (buyerAgent && !sellerAgent) setSelected('buyer');
  }, [buyerAgent, sellerAgent]);

  const [amount, setAmount] = useState<number | ''>(1);
  const [dest, setDest] = useState('');
  // Default the destination to the connected wallet once it is known.
  useEffect(() => {
    if (address && dest === '') setDest(address);
  }, [address, dest]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = options.find((o) => o.key === selected);
  const selectedBalance = selected === 'buyer' ? buyerBalance : sellerBalance;
  const balHuman =
    selectedBalance.data && !selectedBalance.isLoading
      ? formatUnits(selectedBalance.data.value, selectedBalance.data.decimals)
      : null;

  const destValid = ADDR_RE.test(dest.trim());
  const amountValid = typeof amount === 'number' && amount > 0;
  const canSubmit =
    isConnected && !!selectedAgent?.address && destValid && amountValid && phase !== 'sending';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;
    setPhase('sending');
    setError(null);
    setTxHash(null);
    try {
      const r = await api.withdrawFromAgent({
        address,
        agent: selected,
        toAddress: dest.trim(),
        amountUsdc: amount as number,
      });
      setTxHash(r.txHash);
      setPhase('done');
      buyerBalance.refetch();
      sellerBalance.refetch();
    } catch (err) {
      if (err instanceof ApiError && err.detail) setError(String(err.detail));
      else setError((err as Error).message);
      setPhase('error');
    }
  }

  return (
    <section className="rounded-[28px] bg-[var(--lp-card)] text-[var(--lp-dark)] p-5 md:p-9 h-full min-w-0 flex flex-col overflow-hidden">
      <h2 className="font-sans text-[22px] md:text-[24px] font-bold tracking-[-0.02em]">
        Withdraw from agent
      </h2>
      <p className="mt-1 mono text-[12px] text-[var(--lp-text-sub)]">
        agent wallet signs the transfer · settles on Arc
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-5">
        <div>
          <p className="mb-2 text-[12px] font-medium text-[var(--lp-text-sub)]">From</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((o) => {
              const active = selected === o.key;
              const disabled = !o.address;
              const bal = o.key === 'buyer' ? buyerBalance : sellerBalance;
              const human =
                bal.data && !bal.isLoading
                  ? formatUsdc(formatUnits(bal.data.value, bal.data.decimals), {
                      withSuffix: false,
                    })
                  : null;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => o.address && setSelected(o.key)}
                  disabled={disabled}
                  className={cn(
                    'relative text-left p-4 rounded-[18px] transition-all duration-200 text-[var(--lp-dark)]',
                    active
                      ? 'bg-[var(--lp-card)] ring-2 ring-[var(--lp-dark)]'
                      : disabled
                        ? 'bg-[var(--lp-light)] opacity-50 cursor-not-allowed'
                        : 'bg-[var(--lp-light)] hover:-translate-y-0.5',
                  )}
                >
                  {active && (
                    <span className="absolute top-3 right-3 inline-flex size-[18px] items-center justify-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)]">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  <div className="flex items-center gap-2.5">
                    <WalletAvatar address={o.address ?? '0x0'} size={26} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold tracking-[-0.01em] leading-tight">
                        {o.label}
                      </p>
                      <p className="mono text-[10px] mt-0.5 truncate text-[var(--lp-text-sub)]">
                        {o.address ? shortAddress(o.address) : 'not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 flex items-baseline justify-between gap-2 border-t border-black/[0.07]">
                    <span className="text-[11px] font-medium text-[var(--lp-text-sub)]">
                      Balance
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-sans text-[15px] font-bold tabular-nums tracking-[-0.01em] leading-none">
                        {o.address ? (human ?? '—') : '—'}
                      </span>
                      <span className="mono text-[9px] uppercase tracking-[0.1em] leading-none text-[var(--lp-text-sub)]">
                        USDC
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[18px] bg-[var(--lp-light)] p-5 transition-colors focus-within:ring-2 focus-within:ring-[var(--lp-dark)]/15">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-[var(--lp-text-sub)]">Amount</span>
            <button
              type="button"
              onClick={() => balHuman && setAmount(Number(balHuman))}
              disabled={!balHuman}
              className="mono text-[11px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-60"
            >
              {balHuman ? `${formatUsdc(balHuman, { withSuffix: false })} available` : '—'}
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="no-spinner flex-1 bg-transparent font-sans text-[34px] font-bold tracking-[-0.02em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] min-w-0"
              placeholder="0"
            />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-card)] px-3 py-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
              <span className="mono text-[12px] font-semibold">USDC</span>
            </span>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--lp-text-sub)]">Destination</span>
          <input
            type="text"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="0x…"
            className="w-full rounded-[14px] bg-[var(--lp-light)] px-4 py-3 text-[13px] mono focus:outline-none focus:ring-2 focus:ring-[var(--lp-dark)]/15"
          />
          {dest.length > 0 && !destValid && (
            <Note tone="error">Not a valid 20-byte address.</Note>
          )}
          {destValid && address && dest.trim().toLowerCase() === address.toLowerCase() && (
            <span className="text-[11px] text-[var(--lp-text-sub)]">Your connected wallet.</span>
          )}
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-auto w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-4 text-[14px] font-semibold transition-all duration-200 bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {phase === 'sending' && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="animate-spin"
              aria-hidden
            >
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {!isConnected
            ? 'Connect wallet to withdraw'
            : phase === 'sending'
              ? 'Sending on Arc…'
              : `Withdraw from ${selectedAgent?.label.toLowerCase() ?? 'agent'}`}
        </button>

        {phase === 'done' && txHash && (
          <Note tone="success">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Withdrawal sent.</span>
              <a
                href={ARC_EXPLORER_TX(txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mono text-[10px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] px-2 py-1 rounded-md bg-[var(--lp-card)] transition-colors"
              >
                {shortHash(txHash)}
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </a>
            </div>
          </Note>
        )}
        {phase === 'error' && error && <Note tone="error">Couldn&apos;t withdraw: {error}</Note>}
      </form>
    </section>
  );
}
