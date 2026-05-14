'use client';
import { useEffect, useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { Card } from '@/shared/components/Card';
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
    isConnected &&
    !!selectedAgent?.address &&
    destValid &&
    amountValid &&
    phase !== 'sending';

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
    <Card noPadding>
      <div className="px-5 pt-5 pb-4">
        <h2 className="display text-[26px] text-[var(--color-ink)]">Withdraw from agent</h2>
        <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
          agent wallet signs the transfer · settles on Arc
        </p>
      </div>

      <div className="px-5 pb-5">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <p className="eyebrow mb-2">From</p>
            <div className="grid grid-cols-2 gap-2.5">
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
                    className={`text-left px-3 py-3 rounded-lg border transition-all ${
                      active
                        ? 'border-[var(--color-ink)] bg-[var(--color-surface-2)]'
                        : disabled
                        ? 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-50 cursor-not-allowed'
                        : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <p className="text-[13px] font-semibold tracking-tight leading-tight">
                      {o.label}
                    </p>
                    <p className="text-[10px] mono text-[var(--color-ink-faint)] mt-0.5 truncate">
                      {o.address ? shortAddress(o.address) : 'not configured'}
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-[var(--color-line)] flex items-baseline justify-between gap-2">
                      <span className="eyebrow">Balance</span>
                      <span className="inline-flex items-baseline gap-1">
                        <span
                          className="text-[15px] font-medium tabular-nums tracking-tight leading-none"
                          style={{ fontFamily: 'var(--font-serif)' }}
                        >
                          {o.address ? human ?? '—' : '—'}
                        </span>
                        <span className="text-[9px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] leading-none">
                          USDC
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] focus-within:border-[var(--color-ink)] transition-colors">
            <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
              <span className="eyebrow">Amount</span>
              <button
                type="button"
                onClick={() => balHuman && setAmount(Number(balHuman))}
                disabled={!balHuman}
                className="text-[10px] mono text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-60"
              >
                {balHuman ? `${formatUsdc(balHuman, { withSuffix: false })} available` : '—'}
              </button>
            </div>
            <div className="px-4 pb-3 flex items-baseline gap-3">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="no-spinner flex-1 bg-transparent text-[32px] font-medium tracking-tight tabular-nums focus:outline-none placeholder:text-[var(--color-ink-faint)] min-w-0"
                style={{ fontFamily: 'var(--font-serif)' }}
                placeholder="0"
              />
              <span className="text-[14px] mono text-[var(--color-ink-dim)] font-semibold">USDC</span>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="eyebrow">Destination</span>
            <input
              type="text"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="0x…"
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)]"
            />
            {dest.length > 0 && !destValid && (
              <span className="text-[11px] text-[var(--color-critical)]">
                Not a valid 20-byte address.
              </span>
            )}
            {destValid && address && dest.trim().toLowerCase() === address.toLowerCase() && (
              <span className="text-[11px] text-[var(--color-ink-faint)]">
                Your connected wallet.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
            className="w-full px-4 py-3 rounded-lg text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
          >
            {phase === 'sending' && (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
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
            <div
              className="rounded-md px-3 py-2.5 flex items-center justify-between gap-3"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-positive) 30%, transparent)',
                background: 'color-mix(in oklab, var(--color-positive) 8%, transparent)',
              }}
            >
              <p className="text-[12px] text-[var(--color-positive)]">Withdrawal sent.</p>
              <a
                href={ARC_EXPLORER_TX(txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] mono text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] px-2 py-1 rounded-md border border-[var(--color-line)]"
              >
                {shortHash(txHash)}
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </a>
            </div>
          )}
          {phase === 'error' && error && (
            <p className="text-sm text-[var(--color-critical)]">Couldn&apos;t withdraw: {error}</p>
          )}
        </form>
      </div>
    </Card>
  );
}
