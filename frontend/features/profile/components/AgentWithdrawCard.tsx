'use client';
import { useEffect, useMemo, useState } from 'react';
import { useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { cn } from '@/shared/utils/cn';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind } from '@/shared/hooks/useAddressKind';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX } from '../config';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

type Phase = 'idle' | 'sending' | 'done' | 'error';

interface AgentOption {
  key: 'buyer' | 'seller';
  label: string;
  address?: string;
}

const CARD_STYLE = {
  background: 'var(--lp-card)',
  color: 'var(--lp-dark)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

const TONE_COLOR = {
  positive: '#0a7553',
  critical: '#b03d3a',
} as const;

export function AgentWithdrawCard({
  buyerAgent,
  sellerAgent,
  defaultAgent = 'buyer',
}: {
  buyerAgent?: string;
  sellerAgent?: string;
  defaultAgent?: 'buyer' | 'seller';
}) {
  const aw = useTranslations().agentWithdrawCard;
  // useAuth covers both web3 and Circle users. The withdraw flow is already
  // backend-signed (the agent DCW signs server-side), so swapping the address
  // source unblocks Circle users with zero behavioral change to the request.
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;

  const buyerBalance = useBalance({
    address: (buyerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });
  const sellerBalance = useBalance({
    address: (sellerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });

  const options: AgentOption[] = [
    { key: 'buyer', label: aw.agents.buyer, address: buyerAgent },
    { key: 'seller', label: aw.agents.seller, address: sellerAgent },
  ];

  const [selected, setSelected] = useState<'buyer' | 'seller'>(defaultAgent);
  useEffect(() => {
    if (!buyerAgent && sellerAgent) setSelected('seller');
    else if (buyerAgent && !sellerAgent) setSelected('buyer');
  }, [buyerAgent, sellerAgent]);

  const [amount, setAmount] = useState<number | ''>('');
  const [dest, setDest] = useState('');
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
  /// EOA-vs-contract verification on the destination. The user's own wallets
  /// (identity + both agent SCAs) are passed in as trusted so the common
  /// "withdraw to my own agent / identity" path skips the RPC and never
  /// trips the "contract address — funds may be locked" warning. Circle SCAs
  /// have bytecode (4337), so without the trust list they classified as
  /// contracts and blocked submit, which was confusing on a withdraw flow
  /// where pasting your own buyer agent address is a perfectly normal move.
  /// Any address NOT on the trust list still goes through the real check
  /// so a fat-finger paste to some random contract still gets warned.
  const trustedAddresses = useMemo(
    () => [address, buyerAgent, sellerAgent].filter((a): a is string => !!a),
    [address, buyerAgent, sellerAgent],
  );
  const destKind = useAddressKind(dest, { enabled: destValid, trustedAddresses });
  const destIsEoa = destValid && destKind.kind === 'eoa';
  const destIsContract = destValid && destKind.kind === 'contract';
  const canSubmit =
    isConnected &&
    !!selectedAgent?.address &&
    destValid &&
    !destIsContract &&
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
    <section
      style={CARD_STYLE}
      className="p-6 md:p-8 h-full min-w-0 flex flex-col overflow-hidden"
    >
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        {aw.header.eyebrow}
      </span>
      <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
        {aw.header.title}
      </h2>
      <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {aw.header.subtitle}
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-5">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {aw.form.fromEyebrow}
          </span>
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  aria-pressed={active}
                  className={cn(
                    'relative overflow-hidden text-start p-4 transition-colors text-[var(--lp-dark)]',
                    !active && !disabled && 'hover:-translate-y-0.5',
                  )}
                  style={{
                    background: active
                      ? 'rgba(175, 201, 91,0.10)'
                      : disabled
                        ? 'var(--lp-light)'
                        : 'var(--lp-card)',
                    border: active
                      ? '1px solid var(--lp-accent)'
                      : '1px solid var(--lp-border-light)',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                    borderBottomLeftRadius: 12,
                    borderBottomRightRadius: 3,
                    boxShadow: active ? '0 1px 0 rgba(175, 201, 91,0.18)' : 'none',
                  }}
                >
                  {active && (
                    <>
                      <span
                        aria-hidden
                        className="absolute start-0 top-0 bottom-0 w-[3px]"
                        style={{ background: 'var(--lp-accent)' }}
                      />
                      <span
                        aria-hidden
                        data-instrument-blink
                        className="absolute top-2.5 end-2.5 inline-block w-[6px] h-[6px]"
                        style={{
                          background: 'var(--lp-accent)',
                          animation: 'instrumentBlink 1.6s ease-in-out infinite',
                        }}
                      />
                    </>
                  )}
                  <div className="flex items-center gap-2.5">
                    <WalletAvatar address={o.address ?? '0x0'} size={26} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold tracking-[-0.01em] leading-tight">
                        {o.label}
                      </p>
                      <p className="mono text-[10px] tabular-nums mt-0.5 truncate text-[var(--lp-text-muted)]">
                        {o.address ? shortAddress(o.address) : aw.agents.notConfigured}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 flex items-baseline justify-between gap-2 border-t border-[var(--lp-border-light)]">
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      {aw.agents.balanceLabel}
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-sans text-[15px] font-extrabold tabular-nums tracking-[-0.01em] leading-none">
                        {o.address ? (human ?? '-') : '-'}
                      </span>
                      <span className="mono text-[9px] uppercase tracking-[0.14em] leading-none text-[var(--lp-text-muted)]">
                        USDC
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="withdraw-amount transition-shadow p-5"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <div className="flex items-baseline justify-between">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {aw.form.amountEyebrow}
            </span>
            <button
              type="button"
              onClick={() => balHuman && setAmount(Number(balHuman))}
              disabled={!balHuman}
              className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-60"
            >
              {balHuman
                ? aw.form.availableTemplate.replace(
                    '{amount}',
                    formatUsdc(balHuman, { withSuffix: false }),
                  )
                : '-'}
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
              className="no-spinner flex-1 bg-transparent font-sans text-[34px] font-extrabold tracking-[-0.025em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] text-[var(--lp-dark)] min-w-0"
              placeholder={aw.form.amountPlaceholder}
            />
            <span
              className="inline-flex items-center gap-1.5 bg-[var(--lp-card)] px-3 py-1.5"
              style={{
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 2,
              }}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
              <span className="mono text-[11px] font-bold uppercase tracking-[0.12em]">USDC</span>
            </span>
          </div>
          <style jsx>{`
            .withdraw-amount:focus-within {
              border-color: var(--lp-dark);
              box-shadow: 0 0 0 3px rgba(175, 201, 91, 0.25);
            }
          `}</style>
        </div>

        <label className="block space-y-2">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {aw.form.destinationEyebrow}
          </span>
          <input
            type="text"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder={aw.form.destinationPlaceholder}
            className="withdraw-dest w-full bg-[var(--lp-light)] px-4 py-3 text-[13px] mono tabular-nums focus:outline-none transition-shadow text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)]"
            style={{
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          />
          {dest.length > 0 && !destValid && (
            <p
              className="relative ps-3 pe-2.5 py-2 text-[11.5px] inline-flex items-center gap-2 overflow-hidden"
              style={{
                background: 'var(--lp-card)',
                color: 'var(--lp-dark)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 2,
              }}
            >
              <span
                aria-hidden
                className="absolute start-0 top-0 bottom-0 w-[3px]"
                style={{ background: TONE_COLOR.critical }}
              />
              <span
                aria-hidden
                className="inline-block w-[5px] h-[5px]"
                style={{ background: TONE_COLOR.critical, borderRadius: 1 }}
              />
              {aw.errors.invalidAddress}
            </p>
          )}
          {destValid && address && dest.trim().toLowerCase() === address.toLowerCase() && (
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {aw.form.yourWalletHint}
            </span>
          )}
          {destValid && (!address || dest.trim().toLowerCase() !== address.toLowerCase()) && (
            <DestVerifyBanner kind={destKind.kind} copy={aw.form.verify} />
          )}
          <style jsx>{`
            .withdraw-dest:focus {
              border-color: var(--lp-dark);
              box-shadow: 0 0 0 3px rgba(175, 201, 91, 0.25);
            }
          `}</style>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-auto w-full inline-flex items-center justify-center gap-2 px-5 py-4 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
          style={{
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
            boxShadow: canSubmit ? '0 4px 0 rgba(0,0,0,0.22)' : 'none',
          }}
        >
          {phase === 'sending' && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            >
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path
                d="M14 8a6 6 0 0 0-6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
          {!isConnected
            ? aw.submit.signIn
            : phase === 'sending'
              ? aw.submit.sending
              : aw.submit.withdrawTemplate.replace(
                  '{agent}',
                  selectedAgent?.label.toLowerCase() ?? aw.submit.agentFallback,
                )}
        </button>

        {phase === 'done' && txHash && (
          <div
            className="relative flex items-center justify-between gap-3 ps-4 pe-3 py-2.5 overflow-hidden"
            style={{
              background: 'var(--lp-card)',
              color: 'var(--lp-dark)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 2,
            }}
          >
            <span
              aria-hidden
              className="absolute start-0 top-0 bottom-0 w-[3px]"
              style={{ background: TONE_COLOR.positive }}
            />
            <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold">
              <span
                aria-hidden
                className="inline-block w-[6px] h-[6px]"
                style={{ background: TONE_COLOR.positive, borderRadius: 1 }}
              />
              {aw.success.message}
            </span>
            <a
              href={ARC_EXPLORER_TX(txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mono text-[10px] tabular-nums text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] px-2 py-1 transition-colors"
              style={{
                background: 'var(--lp-card)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {shortHash(txHash)}
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M5.5 4.5h6v6M11 5l-6.5 6.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </a>
          </div>
        )}
        {phase === 'error' && error && (
          <div
            className="overflow-hidden"
            style={{
              background: 'var(--lp-card)',
              border: `1px solid ${TONE_COLOR.critical}`,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
              boxShadow: '0 1px 0 rgba(176,61,58,0.18)',
            }}
          >
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5"
              style={{ background: TONE_COLOR.critical }}
            >
              <span aria-hidden className="inline-block w-[5px] h-[5px] bg-white" />
              <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                {aw.errors.failedTag}
              </span>
            </div>
            <p className="px-3 py-2.5 text-[13px] leading-snug text-[var(--lp-dark)]">
              {error}
            </p>
          </div>
        )}
      </form>
    </section>
  );
}

function DestVerifyBanner({
  kind,
  copy,
}: {
  kind: 'idle' | 'invalid' | 'checking' | 'eoa' | 'contract';
  copy: { checking: string; verifiedEoa: string; contractDanger: string };
}) {
  if (kind === 'idle' || kind === 'invalid') return null;
  const tone =
    kind === 'eoa'
      ? { bg: 'rgba(10, 117, 83, 0.10)', text: TONE_COLOR.positive, border: 'rgba(10, 117, 83, 0.30)' }
      : kind === 'contract'
        ? { bg: 'rgba(176, 61, 58, 0.10)', text: TONE_COLOR.critical, border: 'rgba(176, 61, 58, 0.30)' }
        : { bg: 'var(--lp-card)', text: 'var(--lp-text-sub)', border: 'var(--lp-border-light)' };
  const label =
    kind === 'checking'
      ? copy.checking
      : kind === 'eoa'
        ? copy.verifiedEoa
        : copy.contractDanger;
  return (
    <div
      className="inline-flex items-start gap-2 px-3 py-2 text-[11.5px]"
      style={{
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
      }}
    >
      <span
        aria-hidden
        className={
          kind === 'checking'
            ? 'mt-1 inline-block w-[6px] h-[6px] rounded-full animate-pulse motion-reduce:animate-none shrink-0'
            : 'mt-1 inline-block w-[6px] h-[6px] shrink-0'
        }
        style={{ background: tone.text, borderRadius: kind === 'checking' ? 999 : 1 }}
      />
      <span className="leading-snug">{label}</span>
    </div>
  );
}
