'use client';
import { useEffect, useRef, useState } from 'react';
import { useChainId, useReadContract, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { formatUnits } from 'viem';
import { cn } from '@/shared/utils/cn';
import { Icon } from '@/shared/components/Icon';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX, ARC_USDC_ADDRESS, ARC_USDC_DECIMALS } from '../config';
import { useArcFund, type FundPhase, type FundRecord } from '../hooks/useArcFund';
import { useCircleFund, type CircleFundRecord } from '../hooks/useCircleFund';
import { useAuth } from '@/shared/hooks/useAuth';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { TopUpFromGateway } from '@/features/gateway/TopUpFromGateway';
import type { Messages } from '@/shared/i18n/messages/en';

const CARD_STYLE = {
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 20,
} as const;

const TONE_COLOR = {
  positive: 'var(--color-positive)',
  critical: 'var(--color-critical)',
  live: 'var(--ink-secondary)',
  warning: 'var(--color-warning)',
} as const;

interface AgentOption {
  key: 'buyer' | 'seller';
  label: string;
  address?: string;
}

export function ArcFundCard({
  buyerAgent,
  sellerAgent,
  defaultAgent = 'buyer',
}: {
  buyerAgent?: string;
  sellerAgent?: string;
  defaultAgent?: 'buyer' | 'seller';
}) {
  const af = useTranslations().arcFundCard;
  const gt = useTranslations().gatewayTopUp;
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isConnected = auth.isAuthenticated;
  const isCircleUser = auth.method === 'circle';
  // wagmi-reported chain of the connected EIP-1193 wallet. For Circle-only
  // users this defaults to whatever wagmi has (often the wagmi default chain
  // even when no wallet is connected), so we only read it for web3 users.
  const walletChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const onWrongChain = !isCircleUser && isConnected && walletChainId !== ARC_CHAIN_ID;
  // Balance reads target Arc directly via the wagmi public RPC, not the
  // wallet, so they remain accurate even when the wallet is on another chain.
  const arcBalance = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
  });
  const buyerArcBalance = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: buyerAgent ? [buyerAgent as `0x${string}`] : undefined,
    chainId: ARC_CHAIN_ID,
  });
  const sellerArcBalance = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: sellerAgent ? [sellerAgent as `0x${string}`] : undefined,
    chainId: ARC_CHAIN_ID,
  });
  // Two completely separate fund flows: wagmi-signed Arc USDC transfer for
  // web3 users, server-side Circle DCW transfer for Circle users. Both
  // hooks expose the same record shape, so the activity list below is shared.
  const wagmiFund = useArcFund();
  const circleFund = useCircleFund(address);
  const records = isCircleUser ? circleFund.records : wagmiFund.records;
  const start = isCircleUser ? circleFund.start : wagmiFund.start;
  const retry = isCircleUser ? circleFund.retry : wagmiFund.retry;
  const dismiss = isCircleUser ? circleFund.dismiss : wagmiFund.dismiss;

  function refetchAll() {
    arcBalance.refetch();
    buyerArcBalance.refetch();
    sellerArcBalance.refetch();
  }

  const lastDoneIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const r of records) {
      if (r.phase === 'done' && !lastDoneIds.current.has(r.id)) {
        lastDoneIds.current.add(r.id);
        refetchAll();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const refreshing =
    arcBalance.isRefetching || buyerArcBalance.isRefetching || sellerArcBalance.isRefetching;

  const [, setTick] = useState(0);
  const hasLive = records.some(
    (r) =>
      r.phase === 'switching' ||
      r.phase === 'signing' ||
      r.phase === 'confirming' ||
      r.phase === 'sending',
  );
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasLive]);

  const options: AgentOption[] = [
    { key: 'buyer', label: af.agentBuyerLabel, address: buyerAgent },
    { key: 'seller', label: af.agentSellerLabel, address: sellerAgent },
  ];

  const [selected, setSelected] = useState<'buyer' | 'seller'>(defaultAgent);
  useEffect(() => {
    if (!buyerAgent && sellerAgent) setSelected('seller');
    else if (buyerAgent && !sellerAgent) setSelected('buyer');
  }, [buyerAgent, sellerAgent]);

  const selectedAddress = options.find((o) => o.key === selected)?.address;

  const [amount, setAmount] = useState<number | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectedAgent = options.find((o) => o.key === selected);

  const activeCount = records.filter(
    (r) =>
      r.phase === 'switching' ||
      r.phase === 'signing' ||
      r.phase === 'confirming' ||
      r.phase === 'sending',
  ).length;
  const hasActiveTransfer = activeCount > 0;

  const canSubmit =
    isConnected &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!selectedAgent?.address &&
    !hasActiveTransfer &&
    !isSwitching;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedAgent?.address) return;
    // On wrong chain, switch only. Don't try to submit the transfer.
    // wagmi's wallet client needs the switch to actually commit before any
    // signing call will be routed to the new chain, otherwise the tx fires
    // on the old chain and reverts. After the switch lands, walletChainId
    // updates -> onWrongChain flips false -> the button label turns into
    // "Send to buyer agent" and the next click does the actual transfer.
    if (onWrongChain) {
      try {
        await switchChainAsync({ chainId: ARC_CHAIN_ID });
      } catch {
        // User declined the wallet prompt. Stay on the same button so they
        // can try again. No banner; the wallet's own toast surfaces it.
      }
      return;
    }
    start({
      agentKey: selected,
      agentAddress: selectedAgent.address as `0x${string}`,
      amountUsdc: amount as number,
    });
  }

  const arcHuman =
    arcBalance.data && !arcBalance.isLoading
      ? formatUnits(arcBalance.data, ARC_USDC_DECIMALS)
      : null;

  return (
    <section style={CARD_STYLE} className="flex h-full min-w-0 flex-col overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[22px] font-medium leading-tight tracking-[-0.015em] text-[var(--ink)]">
          {af.header.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {activeCount > 0 && (
            <span className="rounded-full bg-[var(--tint)] px-3 py-2 text-[13px] tabular-nums text-[var(--ink-secondary)]">
              {af.header.inFlightTemplate.replace('{count}', String(activeCount))}
            </span>
          )}
          <button
            type="button"
            onClick={refetchAll}
            disabled={refreshing}
            aria-label={af.header.refreshTitle}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--tint)] px-4 text-[13px] text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
          >
            {refreshing ? af.header.refreshing : af.header.refresh}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex min-w-0 w-full flex-1 flex-col gap-4">
        <fieldset>
          <legend className="text-[13px] font-medium text-[var(--ink)]">{af.recipient.eyebrow}</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options.map((o) => {
              const active = selected === o.key;
              const disabled = !o.address;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => o.address && setSelected(o.key)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={cn(
                    'min-h-12 w-full min-w-0 rounded-full px-4 py-3 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]',
                    active ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'bg-[var(--tint)] text-[var(--ink)] hover:bg-[var(--line)]',
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-[20px] bg-[var(--tint)] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="arc-fund-amount" className="text-[13px] font-medium text-[var(--ink)]">
              {af.amount.eyebrow}
            </label>
            {arcHuman != null && (
              <span className="text-[13px] tabular-nums text-[var(--ink-secondary)]">
                {af.amount.availableTemplate.replace('{amount}', formatUsdc(arcHuman, { withSuffix: false }))}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="arc-fund-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="no-spinner min-h-[52px] min-w-0 flex-1 rounded-[14px] bg-transparent px-2 text-[34px] font-medium tracking-[-0.015em] tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--action)]"
              placeholder="0"
            />
            <span className="text-[13px] text-[var(--ink-secondary)]">USDC</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-auto inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-full bg-[var(--action)] px-5 py-3 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
        >
          {!isConnected ? af.submit.signInToFund : isSwitching ? af.submit.switchingToArc : hasActiveTransfer ? af.submit.transferInProgress : (
            <>
              <span className="min-w-0 text-center leading-tight">
                {onWrongChain ? af.submit.switchToArc : af.submit.sendToTemplate.replace('{label}', selectedAgent?.label.toLowerCase() ?? af.submit.agentFallback)}
              </span>
              <Icon name="arrow-right" size={16} directional />
            </>
          )}
        </button>
        {hasActiveTransfer && <p className="text-[13px] leading-snug text-[var(--ink-secondary)]">{af.submit.activeNote}</p>}
      </form>

      {selectedAddress && (
        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <p className="text-[16px] font-medium text-[var(--ink)]">{gt.cta}</p>
          <div className="mt-3">
            <TopUpFromGateway recipient={selectedAddress} agent={selected} onFunded={refetchAll} />
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[16px] font-medium text-[var(--ink)]">{af.activity.eyebrow}</p>
            <p className="text-[13px] tabular-nums text-[var(--ink-secondary)]">
              {records.length} {records.length === 1 ? af.activity.transferOne : af.activity.transferMany}
            </p>
          </div>
          <ul className="space-y-2">
            {records.map((r) => (
              <FundRow key={r.id} record={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} onRetry={() => retry(r.id)} onDismiss={() => dismiss(r.id)} copy={af} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type AnyFundPhase = FundPhase | 'sending';

function phaseLabel(
  phase: AnyFundPhase,
  copy: Messages['arcFundCard']['phase'],
): string {
  switch (phase) {
    case 'switching':
      return copy.switching;
    case 'signing':
      return copy.signing;
    case 'confirming':
      return copy.confirming;
    case 'sending':
      return copy.sending;
    case 'unconfirmed':
      return copy.unconfirmed;
    case 'settling':
      return copy.settling;
    case 'done':
      return copy.done;
    case 'error':
      return copy.error;
  }
}

function phaseTone(phase: AnyFundPhase): 'live' | 'positive' | 'critical' {
  if (phase === 'done') return 'positive';
  if (phase === 'error') return 'critical';
  // Neither 'unconfirmed' nor 'settling' is critical. In both the transfer is
  // on chain, and in 'settling' it is confirmed outright: only Karwan's own
  // record is behind. Painting those red was the whole complaint.
  return 'live';
}

function elapsed(ts: number, copy: Messages['arcFundCard']['elapsed']): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return copy.secondsTemplate.replace('{s}', String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return copy.minutesTemplate.replace('{m}', String(m));
  const h = Math.floor(m / 60);
  return copy.hoursMinutesTemplate
    .replace('{h}', String(h))
    .replace('{m}', String(m % 60));
}

function FundRow({
  record,
  expanded,
  onToggle,
  onRetry,
  onDismiss,
  copy,
}: {
  record: FundRecord | CircleFundRecord;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  copy: Messages['arcFundCard'];
}) {
  const tone = phaseTone(record.phase);
  const elapsedSec = Math.max(0, Math.floor((Date.now() - record.startedAt) / 1000));
  const inFlightConfirming =
    record.phase === 'confirming' || record.phase === 'sending';
  const isSlow = inFlightConfirming && elapsedSec > 15;
  const isStuck = inFlightConfirming && elapsedSec > 120;
  // Retry on an unconfirmed record re-reads the receipt for the hash it already
  // has; runFlow never re-sends a transaction that was submitted.
  const canRetry =
    record.phase === 'error' ||
    record.phase === 'unconfirmed' ||
    record.phase === 'settling' ||
    isStuck;
  // A settling record can be dismissed: the money is with the agent, and the
  // record catches up on its own whether or not this row is on screen.
  const canDismiss =
    record.phase === 'done' ||
    record.phase === 'error' ||
    record.phase === 'settling' ||
    isStuck;
  const textColor =
    tone === 'positive'
      ? TONE_COLOR.positive
      : tone === 'critical'
        ? TONE_COLOR.critical
        : 'var(--lp-text-sub)';
  return (
    <li className="overflow-hidden rounded-[20px] bg-[var(--tint)]">
      <div className="flex min-w-0 items-center gap-2 p-3">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-full px-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[18px] font-medium tabular-nums text-[var(--ink)]">{formatUsdc(record.amountUsdc, { withSuffix: false })} USDC</span>
              <span className="inline-flex items-center gap-1 text-[13px] text-[var(--ink-secondary)]">
                <Icon name="arrow-right" size={16} directional />
                {record.agentKey === 'buyer' ? copy.row.agentKeyBuyer : copy.row.agentKeySeller}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
              <span style={{ color: textColor }}>{phaseLabel(record.phase, copy.phase)}</span>
              <span className="text-[var(--ink-secondary)]">{elapsed(record.startedAt, copy.elapsed)}</span>
              {isSlow && <span className="text-[var(--color-warning)]">{copy.row.slow}</span>}
            </div>
          </div>
          <Icon name="chevron-right" size={16} className={cn('shrink-0 text-[var(--ink-secondary)] transition-transform duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none', expanded ? '-rotate-90' : 'rotate-90')} />
        </button>
        {record.txHash && (
          <a href={ARC_EXPLORER_TX(record.txHash)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={copy.row.viewOnArcscan} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] tabular-nums text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">
            <Icon name="arrow-up-right" size={16} directional />
            {shortHash(record.txHash)}
          </a>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--line)] px-5 py-4">
          {record.error && (
            <div className="space-y-1 text-[13px] text-[var(--color-critical)]">
              <p className="font-medium">{copy.row.errorLabel}</p>
              <p className="leading-snug">{record.error}</p>
            </div>
          )}
          <div className="space-y-2 text-[13px] text-[var(--ink-secondary)]">
            {'reference' in record && record.reference && (
              <div className="flex items-baseline justify-between gap-3">
                <span>{copy.row.reference}</span>
                <span className="break-all text-end tabular-nums">{record.reference}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span>{copy.row.recipient}</span>
              <span className="tabular-nums">{shortAddress(record.agentAddress)}</span>
            </div>
          </div>
          {isStuck && <p className="text-[13px] leading-snug text-[var(--ink-secondary)]">{copy.row.stuckNote}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {canRetry && (
              <button type="button" onClick={onRetry} className="min-h-10 rounded-full bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">{copy.row.retry}</button>
            )}
            {canDismiss && (
              <button type="button" onClick={onDismiss} className="min-h-10 rounded-full px-4 py-2 text-[13px] text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">{copy.row.dismiss}</button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
