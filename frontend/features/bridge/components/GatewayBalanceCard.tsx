'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { api, type GatewayBalance } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
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
  background: 'var(--lp-card)',
  color: 'var(--lp-dark)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

type DepositChain = GatewayChainConfig;

const DEPOSIT_CHAINS: DepositChain[] = GATEWAY_CHAINS;

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
}: {
  value: DepositChain;
  onChange: (next: DepositChain) => void;
  disabled: boolean;
  eyebrow: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        {eyebrow}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="mt-2.5 w-full flex items-center justify-between gap-3 px-4 py-3 text-start transition-colors disabled:opacity-50"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 3,
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <ChainLogo chain={value.key} size={26} />
          <span className="block font-sans text-[14px] font-semibold tracking-tight text-[var(--lp-dark)] leading-tight">
            {value.name}
          </span>
        </span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={`text-[var(--lp-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M3 6l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
              background: 'var(--lp-card)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 4,
              boxShadow: '0 18px 50px -18px rgba(0,0,0,0.28)',
            }}
          >
            {DEPOSIT_CHAINS.map((c) => {
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
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[var(--lp-light)] transition-colors text-start"
                  >
                    <ChainLogo chain={c.key} size={22} />
                    <span className="font-sans text-[13px] font-semibold text-[var(--lp-dark)]">
                      {c.name}
                    </span>
                    {isActive && (
                      <span
                        aria-hidden
                        className="ms-auto inline-block w-[6px] h-[6px]"
                        style={{ background: 'var(--lp-accent)', borderRadius: 1 }}
                      />
                    )}
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
      <p className="text-[13px]" style={{ color: tone === 'ok' ? '#0a7553' : '#b03d3a' }}>
        {children}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={label}
        title={label}
        className="shrink-0 inline-flex items-center justify-center transition-colors hover:bg-[var(--lp-light)]"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1px solid var(--lp-border-light)',
          color: 'var(--lp-text-sub)',
        }}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M1 1l8 8M9 1l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
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

export function GatewayBalanceCard() {
  const t = useTranslations().gatewayCard;
  const errCopy = useTranslations().chainErrors;
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  const { address, chain, connector, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [balance, setBalance] = useState<GatewayBalance | null>(null);
  const [source, setSource] = useState<DepositChain>(DEPOSIT_CHAINS[0]);
  // Where a spend lands. Any of the twelve; Arc is the default because that is
  // where Karwan settles, but Gateway can mint on all of them via the forwarder.
  const [dest, setDest] = useState<DepositChain>(
    DEPOSIT_CHAINS.find((c) => c.key === 'arc') ?? DEPOSIT_CHAINS[0],
  );
  const [amount, setAmount] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [recipient, setRecipient] = useState<Recipient>('wallet');
  const [customAddress, setCustomAddress] = useState('');
  const [movePhase, setMovePhase] = useState<MovePhase>('idle');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pulledFrom, setPulledFrom] = useState<string[] | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [maxBusy, setMaxBusy] = useState(false);
  // Live stage map for the current move, and the tx receipts for both actions.
  const [moveSteps, setMoveSteps] = useState<StepMap>({});
  const [poolTx, setPoolTx] = useState<string | null>(null);
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

  const trimmedCustom = customAddress.trim();
  const customValid = /^0x[a-fA-F0-9]{40}$/.test(trimmedCustom);
  const recipientAddress =
    recipient === 'custom' ? (customValid ? trimmedCustom : undefined) : auth.address;

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
        chain: dest.appKit,
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
  const perChain = (balance?.chains ?? []).filter(
    (c) => Number(c.confirmed) > 0 || Number(c.pending) > 0,
  );

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
          to: { chain: dest.appKit, recipientAddress, useForwarder: true },
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

  // Gateway accepts only EOA signatures on a burn intent; a Circle account's
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
      <div className="p-6 h-full" style={CARD_STYLE}>
        <div className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
          {t.tag}
        </div>
        <h3 className="mt-2 text-[19px] font-bold tracking-tight">{t.title}</h3>
        <div
          className="mt-5 pt-5"
          style={{ borderTop: '1px solid var(--lp-border-light)' }}
        >
          <span
            className="inline-flex mono text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-1"
            style={{ background: 'var(--lp-accent)', color: 'var(--lp-dark)', borderRadius: 4 }}
          >
            {t.soonTag}
          </span>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[42ch]">
            {t.soonBody}
          </p>
        </div>
      </div>
    );
  }

  // No top margin and full height: the page owns the column spacing and stretches
  // this card to match the CCTP one beside it.
  return (
    <div className="p-6 h-full" style={CARD_STYLE}>
      <div className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
        {t.tag}
      </div>
      <h3 className="mt-2 text-[19px] font-bold tracking-tight">{t.title}</h3>

      <div className="mt-5 flex items-baseline gap-3 flex-wrap">
        <span className="text-[34px] font-extrabold tracking-tight tabular-nums">
          {formatUsdc(confirmed, { withSuffix: false })}
        </span>
        <span className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)]">
          {t.confirmed}
        </span>
        {hasPending && (
          <span className="mono text-[11px] uppercase tracking-[0.08em] text-[#b25425]">
            {formatUsdc(pending, { withSuffix: false })} {t.pending}
          </span>
        )}
      </div>

      {!funded && (
        <p className="mt-2 text-[13px] text-[var(--lp-text-sub)]">{t.empty}</p>
      )}

      <div
        className="mt-5 pt-5"
        style={{ borderTop: '1px solid var(--lp-border-light)' }}
      >
        {!isConnected ? (
          <p className="text-[13px] text-[var(--lp-text-sub)]">{t.connect}</p>
        ) : (
          <>
            <ChainDropdown
              value={source}
              onChange={setSource}
              disabled={busy}
              eyebrow={t.poolFrom}
            />

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
                {t.amount}
              </span>
              {walletUsdc != null && Number(walletUsdc) > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(walletUsdc)}
                  disabled={busy}
                  className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-50"
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
              className="mt-1.5 w-full px-3 py-2.5 text-[15px] tabular-nums outline-none focus:border-[var(--lp-accent)] disabled:opacity-50"
              style={{
                background: 'var(--lp-light)',
                border: '1px solid var(--lp-border-light)',
                borderRadius: 10,
              }}
            />

            <button
              type="button"
              onClick={() => void pool()}
              disabled={busy || (!onWrongChain && !amountValid)}
              className="mt-4 w-full py-3 mono text-[12px] font-bold uppercase tracking-[0.1em] transition-opacity disabled:opacity-40"
              style={{
                background: 'var(--lp-band-dark)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
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
        )}
      </div>

      {/* Spend. Only reachable once something is pooled, since there is nothing
          to move otherwise. */}
      {isConnected && Number(confirmed) > 0 && (
        <div
          className="mt-5 pt-5"
          style={{ borderTop: '1px solid var(--lp-border-light)' }}
        >
          <div className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
            {t.moveTag}
          </div>

          {/* Destination. Any of the twelve, not just Arc: every one reports
              forwarderSupported.destination, so Circle's relayer can mint there
              and the recipient needs no gas. */}
          <div className="mt-3">
            <ChainDropdown
              value={dest}
              onChange={setDest}
              disabled={movePhase === 'moving'}
              eyebrow={t.moveTo}
            />
          </div>

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
                  className="px-3 py-1.5 mono text-[11px] uppercase tracking-[0.08em] transition-colors disabled:opacity-50"
                  style={{
                    background: active ? 'rgba(175, 201, 91, 0.12)' : 'var(--lp-card)',
                    border: `1px solid ${active ? 'var(--lp-accent)' : 'var(--lp-border-light)'}`,
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
              className="mt-2 w-full px-3 py-2.5 text-[14px] mono outline-none focus:border-[var(--lp-accent)] disabled:opacity-50"
              style={{
                background: 'var(--lp-light)',
                border: `1px solid ${
                  trimmedCustom && !customValid ? '#b03d3a' : 'var(--lp-border-light)'
                }`,
                borderRadius: 10,
              }}
            />
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
              {t.amount}
            </span>
            <button
              type="button"
              onClick={() => void fillMoveMax()}
              disabled={movePhase === 'moving' || maxBusy}
              className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-50"
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
            className="mt-1.5 w-full px-3 py-2.5 text-[15px] tabular-nums outline-none focus:border-[var(--lp-accent)] disabled:opacity-50"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderRadius: 10,
            }}
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
            className="mt-4 w-full py-3 mono text-[12px] font-bold uppercase tracking-[0.1em] transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-dark)',
              border: 'none',
              borderRadius: 12,
            }}
          >
            {movePhase === 'moving'
              ? t.moving
              : t.moveCtaTemplate.replace('{chain}', dest.name)}
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
        </div>
      )}

      {/* Where the balance actually sits, per chain. Collapsed by default and
          parked at the bottom: the headline number is what the user came for,
          and the split only matters once they want to know what Gateway will
          draw from. */}
      {perChain.length > 0 && (
        <div
          className="mt-5 pt-5"
          style={{ borderTop: '1px solid var(--lp-border-light)' }}
        >
          <button
            type="button"
            onClick={() => setBreakdownOpen((v) => !v)}
            aria-expanded={breakdownOpen}
            className="w-full flex items-center justify-between gap-2 mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors"
          >
            {t.byChain}
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className={`transition-transform ${breakdownOpen ? 'rotate-180' : ''}`}
            >
              <path
                d="M3 6l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {breakdownOpen && (
            <div className="mt-3 flex flex-col gap-1.5">
              {perChain.map((c) => (
                <div key={c.chain} className="flex items-center gap-2 text-[13px]">
                  <ChainLogo chain={c.key as ChainKey} size={14} />
                  <span className="tabular-nums">
                    {formatUsdc(c.confirmed, { withSuffix: false })}
                  </span>
                  {Number(c.pending) > 0 && (
                    <span className="mono text-[10px] uppercase tracking-[0.08em] text-[#b25425]">
                      +{formatUsdc(c.pending, { withSuffix: false })} {t.pending}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
