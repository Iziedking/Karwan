'use client';
import { useCallback, useEffect, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { api, type GatewayBalance } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { formatUsdc } from '@/shared/utils/format';
import { GATEWAY_CHAINS, type GatewayChainConfig } from '../config';
import { loadGatewayKit, gatewaySpend, gatewayDeposit } from '@/features/gateway/lib';
import { GatewayProgress, type StepMap } from '@/features/gateway/GatewayProgress';
import { chainErrorMessage } from '@/shared/utils/chainError';

/// Circle Gateway pooled balance + deposit.
///
/// The balance is USDC locked in the GatewayWallet contract, not USDC in the
/// wallet, so it reads zero until the user pools some. The read is a plain
/// address query the backend caches; the deposit must be signed by the user's
/// own EOA, because Gateway rejects EIP-1271 (smart-account) signatures on
/// burn intents. That split is why the balance comes from our API and the
/// deposit runs through App Kit in the browser.
///
/// Additive to the CCTP bridge above it: CCTP still owns single source to Arc.
/// Gateway earns its place when USDC is stranded across several chains and the
/// user wants it spendable as one balance.

const CARD_STYLE = {
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: 20,
} as const;

type DepositChain = GatewayChainConfig;

const DEPOSIT_CHAINS: DepositChain[] = GATEWAY_CHAINS;
/// Arc is where Karwan settles, so moving pooled USDC onto it is the DEPOSIT
/// half of this rail and moving it anywhere else is the withdraw half. Splitting
/// the chain list on that line is what keeps the two out of one form.
const ARC_CHAIN = DEPOSIT_CHAINS.find((c) => c.key === 'arc') ?? DEPOSIT_CHAINS[0];
const OUT_CHAINS = DEPOSIT_CHAINS.filter((c) => c.key !== 'arc');

/// App Kit reports allocations by its own chain name ('Base_Sepolia'), which is
/// not what we show users. Fall back to the raw name rather than dropping a
/// chain we do not recognise.
function chainLabel(appKitChain: string): string {
  return DEPOSIT_CHAINS.find((c) => c.appKit === appKitChain)?.name ?? appKitChain;
}

/// Chain picker, same shape as the CCTP card's source dropdown: one button that
/// shows the active chain, an absolute list, and a click-outside catcher behind
/// it. Twelve chains is well past what a chip row can carry.
function ChainDropdown({
  value,
  onChange,
  disabled,
  eyebrow,
  options = DEPOSIT_CHAINS,
}: {
  value: DepositChain;
  onChange: (next: DepositChain) => void;
  disabled: boolean;
  eyebrow: string;
  options?: DepositChain[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <span className="mono text-[14px] text-[var(--ink-secondary)] font-medium">
        {eyebrow}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="mt-2.5 min-h-[52px] w-full flex items-center justify-between gap-3 px-4 py-3 text-start transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-50"
        style={{
          background: 'var(--tint)',
          borderRadius: 14,
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">

          <span className="block font-sans text-[14px] font-medium tracking-tight text-[var(--ink)] leading-tight">
            {value.name}
          </span>
        </span>
<Icon name="chevron-right" size={16} className={`text-[var(--ink-secondary)] transition-transform duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
            style={{ background: 'transparent' }}
          />
          <ul
            role="listbox"
            className="absolute z-20 start-0 end-0 mt-2 p-1.5 fade-up max-h-[300px] overflow-y-auto"
            style={{
              background: 'var(--surface)',
              borderRadius: 20,
            }}
          >
            {options.map((c) => {
              const isActive = c.key === value.key;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                    className={`min-h-12 w-full flex items-center gap-2.5 rounded-full px-3 py-3 text-start transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] ${isActive ? "bg-[var(--tint)]" : "hover:bg-[var(--tint)]"}`}
                  >

                    <span className="font-sans text-[14px] font-medium text-[var(--ink)]">
                      {c.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/// One of the two inbound steps. Numbered, because the order is real: nothing
/// can be moved to Arc until a deposit has confirmed.
function StepTab({
  index,
  active,
  disabled,
  onClick,
  children,
}: {
  index: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="inline-flex min-h-10 items-center gap-2 px-4 py-2 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? 'var(--ink)' : 'var(--tint)',
        borderRadius: 999,
        color: active ? 'var(--canvas)' : 'var(--ink)',
      }}
    >
      <span
        aria-hidden
        className="text-[14px]"
        style={{ color: active ? 'var(--canvas)' : 'var(--ink-secondary)' }}
      >
        {index}
      </span>
      {children}
    </button>
  );
}

/// A settled result the user can clear. Both outcomes stick around until
/// dismissed rather than auto-fading: a pool or a move is a money event, and
/// the txHash line is the only receipt shown in-app.
function StatusLine({
  tone,
  onDismiss,
  label,
  children,
}: {
  tone: 'ok' | 'bad';
  onDismiss: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex items-start justify-between gap-2">
      <p className="text-[14px]" style={{ color: tone === 'ok' ? 'var(--color-positive)' : 'var(--color-critical)' }}>
        {children}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={label}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] px-3 text-[14px] text-[var(--ink)] hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
      >
{label}
      </button>
    </div>
  );
}

type Phase = 'idle' | 'switching' | 'depositing' | 'done' | 'error';
type MovePhase = 'idle' | 'moving' | 'moved' | 'error';
/// Wallet or a pasted address. Agent wallets are deliberately absent: they are
/// topped up in context (profile, deal, post-a-job), not from this page, and an
/// agent address only means anything on Arc anyway, while this can send to any
/// of the twelve chains.
type Recipient = 'wallet' | 'custom';
type Step = 'add' | 'move';

export function GatewayBalanceCard({
  direction = 'in',
}: {
  direction?: 'in' | 'out';
} = {}) {
  const t = useTranslations().gatewayCard;
  const errCopy = useTranslations().chainErrors;
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  const { address, chain, connector, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();

  const [balance, setBalance] = useState<GatewayBalance | null>(null);
  const [source, setSource] = useState<DepositChain>(DEPOSIT_CHAINS[0]);
  // Where a spend lands, when the user picks. Gateway can mint on any of the
  // twelve via the forwarder, so every non-Arc chain is a valid target.
  // Outbound destination only. Inbound the destination is Arc and is not a
  // choice, so this never holds it.
  const [dest, setDest] = useState<DepositChain>(OUT_CHAINS[0]);
  // Inbound is two signatures, not one: pool from a chain, then land on Arc. One
  // step is on screen at a time.
  const [step, setStep] = useState<Step>('add');
  const [amount, setAmount] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [recipient, setRecipient] = useState<Recipient>('wallet');
  const [customAddress, setCustomAddress] = useState('');
  const [movePhase, setMovePhase] = useState<MovePhase>('idle');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pulledFrom, setPulledFrom] = useState<string[] | null>(null);
  const [maxBusy, setMaxBusy] = useState(false);
  // Live stage map for the current move, and the tx receipts for both actions.
  const [moveSteps, setMoveSteps] = useState<StepMap>({});
  const [poolTx, setPoolTx] = useState<string | null>(null);
  const [poolReference, setPoolReference] = useState<string | null>(null);
  const [moveTx, setMoveTx] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!auth.address) return;
    api
      .getGatewayBalance()
      .then(({ balance: b }) => setBalance(b))
      .catch(() => setBalance(null));
  }, [auth.address]);

  useEffect(() => {
    load();
  }, [load]);

  // The wallet's USDC on the selected source, so Max reflects what can actually
  // be pooled. This is wallet USDC, distinct from the pooled figure above it.
  const wallet = useBalance({
    address,
    token: source.usdc,
    chainId: source.chainId,
    query: { enabled: isConnected, refetchInterval: 10_000 },
  });
  const walletUsdc = wallet.data
    ? formatUnits(wallet.data.value, wallet.data.decimals)
    : null;

  const inbound = direction === 'in';
  const activeDest = inbound ? ARC_CHAIN : dest;

  // Flipping direction is a different question, so it starts clean rather than
  // showing the previous direction's result under the new form.
  useEffect(() => {
    setStep('add');
    setPhase('idle');
    setMovePhase('idle');
    setError(null);
    setMoveError(null);
  }, [direction]);

  const onWrongChain = isConnected && chain?.id !== source.chainId;
  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const busy = phase === 'switching' || phase === 'depositing';

  async function pool() {
    if (!connector) return;
    setError(null);
    try {
      if (onWrongChain) {
        setPhase('switching');
        await switchChainAsync({ chainId: source.chainId });
      }
      setPhase('depositing');

      const provider = await connector.getProvider();
      if (!provider) throw new Error('Wallet provider unavailable');

      const receipt = await gatewayDeposit({
        provider,
        amount: String(parsed),
        chain: source.appKit,
      });
      setPoolTx(receipt.explorerUrl ?? null);

      // Gateway indexes the deposit a beat after the source tx lands, and our
      // read is cached for 30s. Drop the cache so the panel stops serving the
      // pre-deposit zero, then re-read.
      await api.refreshGatewayBalance().catch(() => {});
      setPhase('done');
      setAmount('');
      load();
      // The deposit shows up as Pending first, then flips to Confirmed once
      // Gateway finalises it. Re-read once more so the user sees that land.
      setTimeout(() => {
        void api.refreshGatewayBalance().then(load).catch(() => {});
      }, 12_000);
    } catch (err) {
      setPhase('error');
      setError(chainErrorMessage(err, errCopy, t.failed));
    }
  }

  async function poolCircle() {
    setError(null);
    setPhase('depositing');
    try {
      const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-circle`;
      const receipt = await api.gatewayDeposit(parsed, 'identity', requestId);
      if (!receipt.reference) throw new Error('receipt reference unavailable');
      setPoolReference(receipt.reference);
      await api.refreshGatewayBalance().catch(() => {});
      setPhase('done');
      setAmount('');
      load();
    } catch (err) {
      setPhase('error');
      setError(chainErrorMessage(err, errCopy, t.failed));
    }
  }

  const trimmedCustom = customAddress.trim();
  const customValid = /^0x[a-fA-F0-9]{40}$/.test(trimmedCustom);
  // Inbound has no recipient choice. "Bring my own money where Karwan settles"
  // is the whole action, and a custom-address field on that path is a way to
  // send a deposit to someone else by accident.
  const recipientAddress =
    !inbound && recipient === 'custom'
      ? customValid
        ? trimmedCustom
        : undefined
      : auth.address;

  /// Spend the pooled balance onto the chosen chain. No chain switch and no
  /// source-chain gas: the wallet signs one chain-agnostic burn intent set, and
  /// useForwarder hands the destination mint to Circle's relayer, so the
  /// recipient needs no gas there either. Every one of the twelve reports
  /// forwarderSupported.destination, which is what makes any of them a valid
  /// target rather than only Arc.
  ///
  /// `from` carries no allocations, which is deliberate: Gateway then decides
  /// which chains to draw from, pulling across several in one go if it must.
  async function move() {
    if (!connector || !recipientAddress) return;
    setMoveError(null);
    setPulledFrom(null);
    try {
      setMovePhase('moving');
      setMoveSteps({});
      setMoveTx(null);
      const provider = await connector.getProvider();
      if (!provider) throw new Error('Wallet provider unavailable');

      const res = await gatewaySpend({
        provider,
        amount: String(Number(moveAmount)),
        recipientAddress,
        chain: activeDest.appKit,
        // Stages land as they happen, so the forwarder's mint stops being an
        // invisible wait after the signature.
        onStep: (name, step) => setMoveSteps((prev) => ({ ...prev, [name]: step })),
      });

      setMoveTx(res.explorerUrl ?? null);
      setPulledFrom(
        res.allocations.map(
          (a) => `${formatUsdc(a.amount, { withSuffix: false })} ${chainLabel(a.chain)}`,
        ),
      );
      await api.refreshGatewayBalance().catch(() => {});
      setMovePhase('moved');
      setMoveAmount('');
      load();
    } catch (err) {
      setMovePhase('error');
      setMoveError(chainErrorMessage(err, errCopy, t.moveFailed));
    }
  }

  const confirmed = balance?.confirmed ?? '0';
  const pending = balance?.pending ?? '0';
  const hasPending = Number(pending) > 0;
  const funded = Number(confirmed) > 0 || hasPending;
  const canMove = Number(confirmed) > 0;
  // A finished or failed move keeps its form on screen: the status line under it
  // is the only receipt shown in-app, and emptying the balance must not take it
  // away the moment it succeeds.
  const showMove =
    canMove || movePhase === 'moving' || movePhase === 'moved' || movePhase === 'error';

  /// Max is NOT the whole pooled balance.
  ///
  /// Gateway takes a forwarding fee out of the spend, so asking to move the full
  /// confirmed figure always fails ("Insufficient total maxFee ... to cover
  /// forwarding fee"). Ask the SDK what it will charge and hold that back, so the
  /// button proposes an amount that can actually settle.
  ///
  /// The estimate is retried at 90% because estimateSpend can itself reject the
  /// full balance for the very same reason. The fee is near-flat, so the figure
  /// it returns for 90% is the one that applies at max.
  async function fillMoveMax() {
    const total = Number(confirmed);
    if (!connector || !recipientAddress || !(total > 0)) {
      setMoveAmount(confirmed);
      return;
    }
    setMaxBusy(true);
    try {
      const provider = await connector.getProvider();
      const { kit, adapter } = await loadGatewayKit(provider);
      const estimate = async (amount: number) =>
        (await kit.unifiedBalance.estimateSpend({
          from: { adapter },
          to: { chain: activeDest.appKit, recipientAddress, useForwarder: true },
          amount: String(amount),
          token: 'USDC',
        } as never)) as { fees?: Array<{ token?: string; amount?: string }> };

      let est;
      try {
        est = await estimate(total);
      } catch {
        est = await estimate(total * 0.9);
      }

      const fee = (est.fees ?? [])
        .filter((f) => (f.token ?? 'USDC').toUpperCase() === 'USDC')
        .reduce((sum, f) => sum + Number(f.amount ?? 0), 0);

      const spendable = total - fee;
      setMoveAmount(spendable > 0 ? spendable.toFixed(6) : '0');
    } catch {
      // Could not price it. Offer the full balance and let the humanised error
      // tell them to trim it, rather than silently inventing a fee.
      setMoveAmount(confirmed);
    } finally {
      setMaxBusy(false);
    }
  }

  // Browser Gateway spends require an EOA; custodial Circle accounts use the
  // wallets are smart accounts, whose EIP-1271 signatures it rejects. So this
  // rail genuinely cannot work for an email user, and the card used to end on
  // "Connect a wallet to pool USDC" — asking the one kind of user who signed up
  // precisely so they would never have to hold a wallet. Say it is not ready for
  // them instead, and wire it the day an SCA can sign a burn intent.
  //
  // Their money is not stranded meanwhile: the backend runs its own pooled
  // balance for Circle accounts through a delegate EOA, invisibly, and CCTP
  // beside this tab moves USDC for them today.
  if (isCircleUser) {
    return (
      <div data-guide="bridge-gateway" className="h-full p-5 sm:p-6" style={CARD_STYLE}>
        <div>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-secondary)] max-w-[42ch] font-medium">
            {t.soonBody}
          </p>
          <label className="mt-5 block">
            <span className="mono text-[14px] font-medium text-[var(--ink-secondary)]">
              {t.amount}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              placeholder="0.00"
              className="mt-1.5 min-h-[52px] w-full rounded-[14px] bg-[var(--tint)] px-4 text-[32px] font-medium tabular-nums text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-50"
              aria-label={`${t.amount} USDC`}
            />
          </label>
          <button
            type="button"
            onClick={() => void poolCircle()}
            disabled={busy || !amountValid}
            aria-busy={busy}
            className="mt-4 min-h-12 w-full rounded-full px-5 py-3 text-[15px] font-medium transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
            style={{
              background: 'var(--action)',
              color: 'var(--on-action)',
              borderRadius: 999,
            }}
          >
            {phase === 'depositing' ? t.depositing : t.cta}
          </button>
          {phase === 'done' && (
            <StatusLine tone="ok" onDismiss={() => setPhase('idle')} label={t.dismiss}>
              {t.pooled}
              {poolReference && (
                <span className="ms-1 mono text-[14px]">{poolReference}</span>
              )}
            </StatusLine>
          )}
          {phase === 'error' && (
            <StatusLine tone="bad" onDismiss={() => setPhase('idle')} label={t.dismiss}>
              {error ?? t.failed}
            </StatusLine>
          )}
        </div>
      </div>
    );
  }

  // No top margin and full height: the page owns the column spacing and stretches
  // this card to match the CCTP one beside it.
  return (
    <div data-guide="bridge-gateway" className="p-6 h-full" style={CARD_STYLE}>

      {hasPending && (
        <p className="text-[14px] tabular-nums text-[var(--color-warning)]">
          {formatUsdc(pending)} {t.pending}
        </p>
      )}

      {/* Only above the pooling form. Anywhere else the panel below already
          says there is nothing to move, and two sentences saying the same thing
          read as a fault. */}
      {!funded && inbound && step === 'add' && (
        <p className="mt-2 text-[14px] text-[var(--ink-secondary)] font-medium">{t.empty}</p>
      )}

      <div className="mt-5">
        {/* Deposit and withdraw were one card with two stacked forms: pool USDC
            above a move form with a free destination and a custom-address field.
            That is a screen offering to take money in and send it out at once,
            and the direction toggle above has already asked which one this is.
            So the card answers only that, and inbound is a sequence because
            pooling and landing on Arc genuinely are two signatures. */}
        {isConnected && inbound && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            <StepTab index="01" active={step === 'add'} onClick={() => setStep('add')}>
              {t.stepAdd}
            </StepTab>
            <StepTab
              index="02"
              active={step === 'move'}
              // Gateway will not spend a pending deposit, so until one confirms
              // this tab leads to a form that can only fail.
              disabled={!canMove}
              onClick={() => setStep('move')}
            >
              {t.moveCta}
            </StepTab>
          </div>
        )}
        {!isConnected ? (
          // A web3 user's SIWE cookie outlives the wagmi connection, so after a
          // reload they are signed in but not connected. This used to be a bare
          // sentence telling them to connect with no way to do it from here.
          <div className="space-y-3">
            <p className="text-[14px] text-[var(--ink-secondary)] font-medium">{t.connect}</p>
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              disabled={!openConnectModal}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--action)] px-5 py-3 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
            >
              {t.connectCta}
            </button>
          </div>
        ) : inbound && step === 'add' ? (
          <>
            <ChainDropdown
              value={source}
              onChange={setSource}
              disabled={busy}
              eyebrow={t.poolFrom}
            />

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="mono text-[14px] font-medium text-[var(--ink-secondary)]">
                {t.amount}
              </span>
              {walletUsdc != null && Number(walletUsdc) > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(walletUsdc)}
                  disabled={busy}
                  className="min-h-10 rounded-full px-3 text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] font-medium"
                >
                  {t.maxTemplate.replace(
                    '{amount}',
                    formatUsdc(walletUsdc, { withSuffix: false }),
                  )}
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              placeholder="0.00"
              className="mt-1.5 min-h-[52px] w-full rounded-[14px] bg-[var(--tint)] px-4 text-[16px] tabular-nums text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-50"
              aria-label={t.amount}
            />

            <button
              type="button"
              onClick={() => void pool()}
              disabled={busy || (!onWrongChain && !amountValid)}
              aria-busy={busy}
              className="mt-4 min-h-12 w-full rounded-full px-5 py-3 text-[15px] font-medium transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
              style={{
                background: 'var(--action)',
              color: 'var(--on-action)',
              borderRadius: 999,
              }}
            >
              {phase === 'switching'
                ? t.switching
                : phase === 'depositing'
                  ? t.depositing
                  : onWrongChain
                    ? t.switchTemplate.replace('{chain}', source.name)
                    : t.cta}
            </button>

            {phase === 'done' && (
              <StatusLine tone="ok" onDismiss={() => setPhase('idle')} label={t.dismiss}>
                {t.pooled}
                {/* Deposit has no step events (it is a plain approve + deposit),
                    but its result carries the explorer URL, which we used to
                    discard. It is the only receipt the user gets. */}
                {poolTx && (
                  <>
                    {' '}
                    <a
                      href={poolTx}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {t.viewTx}
                    </a>
                  </>
                )}
              </StatusLine>
            )}
            {phase === 'error' && (
              <StatusLine tone="bad" onDismiss={() => setPhase('idle')} label={t.dismiss}>
                {error ?? t.failed}
              </StatusLine>
            )}
          </>
        ) : showMove ? (
          <>
            {/* Destination. Inbound it is Arc and only Arc, so there is a
                sentence where the picker was. Outbound it is any of the others:
                each reports forwarderSupported.destination, so Circle's relayer
                mints there and the recipient needs no gas. */}
            {inbound ? (
              <p className="text-[14px] leading-relaxed text-[var(--ink-secondary)] max-w-[42ch] font-medium">
                {t.arcPinned}
              </p>
            ) : (
              <>
                <div className="mt-3">
                  <ChainDropdown
                    value={dest}
                    onChange={setDest}
                    options={OUT_CHAINS}
                    disabled={movePhase === 'moving'}
                    eyebrow={t.moveTo}
                  />
                </div>
              </>
            )}

            {!inbound && (
              <>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(
                  [
                    ['wallet', t.toWallet],
                    ['custom', t.toCustom],
                  ] as Array<[Recipient, string]>
                ).map(([key, label]) => {
                  const active = recipient === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRecipient(key)}
                      disabled={movePhase === 'moving'}
                      aria-pressed={active}
                      className="min-h-10 px-4 py-2 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
                      style={{
                        background: active ? 'var(--ink)' : 'var(--tint)',
                        color: active ? 'var(--canvas)' : 'var(--ink)',
                        borderRadius: 999,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {recipient === 'custom' && (
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  disabled={movePhase === 'moving'}
                  placeholder="0x..."
                  spellCheck={false}
                  aria-label={t.toCustom}
                  aria-invalid={!!trimmedCustom && !customValid}
                  className="mt-2 min-h-[52px] w-full rounded-[14px] bg-[var(--tint)] px-4 text-[16px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-50"
                />
              )}
              </>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="mono text-[14px] font-medium text-[var(--ink-secondary)]">
                {t.amount}
              </span>
              <button
                type="button"
                onClick={() => void fillMoveMax()}
                disabled={movePhase === 'moving' || maxBusy}
                className="mono text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink)] transition-colors disabled:opacity-50 font-medium"
              >
                {t.maxTemplate.replace(
                  '{amount}',
                  formatUsdc(confirmed, { withSuffix: false }),
                )}
              </button>
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={moveAmount}
              onChange={(e) => setMoveAmount(e.target.value)}
              disabled={movePhase === 'moving'}
              placeholder="0.00"
              className="mt-1.5 min-h-[52px] w-full rounded-[14px] bg-[var(--tint)] px-4 text-[16px] tabular-nums text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-50"
              aria-label={t.amount}
            />

            <button
              type="button"
              onClick={() => void move()}
              disabled={
                movePhase === 'moving' ||
                !recipientAddress ||
                !(Number(moveAmount) > 0) ||
                Number(moveAmount) > Number(confirmed)
              }
              aria-busy={movePhase === 'moving'}
              className="mt-4 min-h-12 w-full rounded-full px-5 py-3 text-[15px] font-medium transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
              style={{
                background: 'var(--action)',
                color: 'var(--on-action)',
                borderRadius: 999,
              }}
            >
              {movePhase === 'moving'
                ? t.moving
                : t.moveCtaTemplate.replace('{chain}', activeDest.name)}
            </button>

            {/* Live stages. Kept up while moving AND after it lands, so the
                finished run reads as a receipt rather than vanishing. */}
            {(movePhase === 'moving' || movePhase === 'moved') && (
              <GatewayProgress steps={moveSteps} />
            )}

            {movePhase === 'moved' && (
              <StatusLine tone="ok" onDismiss={() => setMovePhase('idle')} label={t.dismiss}>
                {t.moved}
                {pulledFrom && pulledFrom.length > 0 && (
                  <> {t.pulledTemplate.replace('{chains}', pulledFrom.join(', '))}</>
                )}
                {moveTx && (
                  <>
                    {' '}
                    <a
                      href={moveTx}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {t.viewTx}
                    </a>
                  </>
                )}
              </StatusLine>
            )}
            {movePhase === 'error' && (
              <StatusLine tone="bad" onDismiss={() => setMovePhase('idle')} label={t.dismiss}>
                {moveError ?? t.moveFailed}
              </StatusLine>
            )}
          </>
        ) : (
          // Nothing pooled, so there is nothing to move. A form here could
          // only be submitted into a failure.
          <p className="text-[14px] leading-relaxed text-[var(--ink-secondary)] max-w-[42ch] font-medium">
            {t.outEmpty}
          </p>
        )}
      </div>

    </div>
  );
}
