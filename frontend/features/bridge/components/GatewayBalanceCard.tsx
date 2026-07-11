'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { api, type GatewayBalance } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { formatUsdc } from '@/shared/utils/format';
import {
  SOURCE_CHAINS,
  SOURCE_CHAIN_KEYS,
  APPKIT_CHAIN,
  APPKIT_ARC_CHAIN,
  ARC_TESTNET,
} from '../config';

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

interface DepositChain {
  key: ChainKey;
  chainId: number;
  usdc: `0x${string}`;
  name: string;
  appKit: string;
}

const DEPOSIT_CHAINS: DepositChain[] = [
  ...SOURCE_CHAIN_KEYS.map((k) => ({
    key: k as ChainKey,
    chainId: SOURCE_CHAINS[k].chainId,
    usdc: SOURCE_CHAINS[k].usdc,
    name: SOURCE_CHAINS[k].shortName,
    appKit: APPKIT_CHAIN[k],
  })),
  {
    key: 'arc' as ChainKey,
    chainId: ARC_TESTNET.chainId,
    usdc: ARC_TESTNET.usdc,
    name: 'Arc',
    appKit: APPKIT_ARC_CHAIN,
  },
];

/// App Kit reports allocations by its own chain name ('Base_Sepolia'), which is
/// not what we show users. Fall back to the raw name rather than dropping a
/// chain we do not recognise.
function chainLabel(appKitChain: string): string {
  return DEPOSIT_CHAINS.find((c) => c.appKit === appKitChain)?.name ?? appKitChain;
}

type Phase = 'idle' | 'switching' | 'depositing' | 'done' | 'error';
type MovePhase = 'idle' | 'moving' | 'moved' | 'error';
type Recipient = 'wallet' | 'buyer' | 'seller';

/// Gateway's EIP-712 domain is { name: 'GatewayWallet', version: '1' } with no
/// chainId and no verifyingContract, and the signed payload is a BurnIntent[]
/// set. So one signature authorises burns across several source chains at once:
/// no chain switching, no source-chain gas. Paired with a forwarder destination
/// (no destination adapter) the mint lands on Arc without Arc gas either. This
/// is the capability CCTP cannot match, and the reason Gateway is here at all.
async function loadKit(provider: unknown) {
  const { AppKit } = await import('@circle-fin/app-kit');
  const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2');
  const adapter: unknown = await createViemAdapterFromProvider({
    provider: provider as never,
  });
  return { kit: new AppKit(), adapter };
}

export function GatewayBalanceCard({
  agents,
}: {
  agents?: { buyer?: string; seller?: string };
}) {
  const t = useTranslations().gatewayCard;
  const auth = useAuth();
  const { address, chain, connector, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [balance, setBalance] = useState<GatewayBalance | null>(null);
  const [source, setSource] = useState<DepositChain>(DEPOSIT_CHAINS[0]);
  const [amount, setAmount] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [recipient, setRecipient] = useState<Recipient>('wallet');
  const [movePhase, setMovePhase] = useState<MovePhase>('idle');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pulledFrom, setPulledFrom] = useState<string[] | null>(null);
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
      const { kit, adapter } = await loadKit(provider);

      // allowanceStrategy defaults to 'authorize' (EIP-2612 permit): one
      // signature, no separate approve tx. That only works because the signer
      // is an EOA. A Circle smart account would have to fall back to 'approve'.
      await kit.unifiedBalance.deposit({
        from: { adapter, chain: source.appKit },
        amount: String(parsed),
        token: 'USDC',
      } as never);

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
      setError(err instanceof Error ? err.message : t.failed);
    }
  }

  const recipientAddress =
    recipient === 'buyer'
      ? agents?.buyer
      : recipient === 'seller'
        ? agents?.seller
        : auth.address;

  /// Spend the pooled balance onto Arc. No chain switch and no source-chain gas:
  /// the wallet signs one chain-agnostic burn intent set, and useForwarder hands
  /// the Arc mint to Circle's relayer, so the recipient needs no Arc gas either.
  /// `from` carries no allocations, which is deliberate: Gateway then decides
  /// which chains to draw from, pulling across several in one go if it must.
  async function move() {
    if (!connector || !recipientAddress) return;
    setMoveError(null);
    setPulledFrom(null);
    try {
      setMovePhase('moving');
      const provider = await connector.getProvider();
      if (!provider) throw new Error('Wallet provider unavailable');
      const { kit, adapter } = await loadKit(provider);

      const res = (await kit.unifiedBalance.spend({
        from: { adapter },
        to: {
          chain: APPKIT_ARC_CHAIN,
          recipientAddress,
          useForwarder: true,
        },
        amount: String(Number(moveAmount)),
        token: 'USDC',
      } as never)) as { allocations?: Array<{ chain: string; amount: string }> };

      setPulledFrom(
        (res?.allocations ?? []).map(
          (a) => `${formatUsdc(a.amount, { withSuffix: false })} ${chainLabel(a.chain)}`,
        ),
      );
      await api.refreshGatewayBalance().catch(() => {});
      setMovePhase('moved');
      setMoveAmount('');
      load();
    } catch (err) {
      setMovePhase('error');
      setMoveError(err instanceof Error ? err.message : t.moveFailed);
    }
  }

  const confirmed = balance?.confirmed ?? '0';
  const pending = balance?.pending ?? '0';
  const hasPending = Number(pending) > 0;
  const funded = Number(confirmed) > 0 || hasPending;
  const perChain = (balance?.chains ?? []).filter(
    (c) => Number(c.confirmed) > 0 || Number(c.pending) > 0,
  );

  return (
    <div className="mt-6 p-6" style={CARD_STYLE}>
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

      {perChain.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
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

      <div
        className="mt-5 pt-5"
        style={{ borderTop: '1px solid var(--lp-border-light)' }}
      >
        {!isConnected ? (
          <p className="text-[13px] text-[var(--lp-text-sub)]">{t.connect}</p>
        ) : (
          <>
            <div className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
              {t.poolFrom}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEPOSIT_CHAINS.map((c) => {
                const active = c.key === source.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSource(c)}
                    disabled={busy}
                    aria-pressed={active}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 mono text-[11px] uppercase tracking-[0.08em] transition-colors disabled:opacity-50"
                    style={{
                      background: active ? 'rgba(175, 201, 91, 0.12)' : 'var(--lp-card)',
                      border: `1px solid ${active ? 'var(--lp-accent)' : 'var(--lp-border-light)'}`,
                      borderRadius: 999,
                    }}
                  >
                    <ChainLogo chain={c.key} size={13} />
                    {c.name}
                  </button>
                );
              })}
            </div>

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
              <p className="mt-3 text-[13px] text-[#0a7553]">{t.pooled}</p>
            )}
            {phase === 'error' && (
              <p className="mt-3 text-[13px] text-[#b03d3a]">{error ?? t.failed}</p>
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

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ['wallet', t.toWallet, auth.address],
                ['buyer', t.toBuyer, agents?.buyer],
                ['seller', t.toSeller, agents?.seller],
              ] as Array<[Recipient, string, string | undefined]>
            )
              .filter(([, , addr]) => !!addr)
              .map(([key, label]) => {
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

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
              {t.amount}
            </span>
            <button
              type="button"
              onClick={() => setMoveAmount(confirmed)}
              disabled={movePhase === 'moving'}
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
            {movePhase === 'moving' ? t.moving : t.moveCta}
          </button>

          {movePhase === 'moved' && (
            <p className="mt-3 text-[13px] text-[#0a7553]">
              {t.moved}
              {pulledFrom && pulledFrom.length > 0 && (
                <>
                  {' '}
                  {t.pulledTemplate.replace('{chains}', pulledFrom.join(', '))}
                </>
              )}
            </p>
          )}
          {movePhase === 'error' && (
            <p className="mt-3 text-[13px] text-[#b03d3a]">{moveError ?? t.moveFailed}</p>
          )}
        </div>
      )}
    </div>
  );
}
