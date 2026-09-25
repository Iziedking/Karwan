'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { erc20Abi } from 'viem';
import { useAccount, useChainId, useReadContracts, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { api, ApiError } from '@/core/api';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { NetworkContext } from '@/shared/components/NetworkContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { moneySounds } from '@/shared/sound/moneySounds';
import { fill } from '@/features/deals/workspace/presentation';
import { DepositCard } from '@/features/deposit/components/DepositCard';
import { AddressText } from '@/features/money/components/AddressText';
import { formatAmount, formatBalance } from '@/features/money/balanceModel';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { chipAmount, groupAddress, parseAmount, shortfall, spendable } from '@/features/money/moneySheetModel';
import { toMicros } from '@/features/money/usdc';
import { SOURCE_CHAINS, SOURCE_CHAIN_KEYS, USDC_FAUCET, WITHDRAW_DEST_KEYS, type CctpChainKey } from '../config';
import { amountFromParams, intentFromParams, resumableRecord, startedRecord, willNotifyOnArrival, type CrossChainIntent } from '../crossChainIntent';
import { bridgeChainMeta, useBridges } from '../hooks/useBridge';
import { outAvailable, planOut, poolOutcome, routeSpeed, stepForPhase, walletSources, type TransferStep } from '../routePlan';
import { BridgeHistoryModal } from './BridgeHistorySection';
import { TransferProgress } from './TransferProgress';

const PRIMARY =
  'inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors duration-200 hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2';
const SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const QUIET =
  'inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const CHIP =
  'inline-flex min-h-11 items-center rounded-full border border-[var(--lp-outline-strong)] px-3.5 text-[13px] font-semibold text-[var(--lp-dark)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const OPTION =
  'flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-[var(--lp-border-light)] px-4 has-[:checked]:border-[var(--lp-dark)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent)]';
const SOFT = 'bg-[var(--lp-workspace-soft)] motion-safe:animate-pulse motion-reduce:animate-none rounded-[10px]';
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

type PoolDestination = Parameters<typeof api.gatewayCashOut>[0];

type Started =
  | { kind: 'bridge'; since: number; direction: 'in' | 'out'; chainKey: string }
  | { kind: 'pool'; startedAt: number; chainKey: CctpChainKey; step: TransferStep | 'failed'; leftSource: boolean; to: `0x${string}`; amount: number; requestId: string };

/// The one-click /bridge. The person picks a place and an amount; Karwan picks
/// the route. A payment request link is public; everything else needs an account.
export function CrossChainPage() {
  const params = useSearchParams();
  const intent = intentFromParams(params);
  const gate = useTranslations().bridge.signInGate;
  if (intent === 'pay') return <CrossChainFlow intent="pay" />;
  return (
    <AuthGuard gateTag={gate.tag} gateBody={gate.body}>
      <CrossChainFlow intent={intent} />
    </AuthGuard>
  );
}

function CrossChainFlow({ intent }: { intent: CrossChainIntent }) {
  const money = useTranslations().money;
  const t = money.cross;
  const sheet = money.sheet;
  const { locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const auth = useAuth();
  const account = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const balances = useMoneyBalances();
  const { bridges, startAppKitBridge, startWeb3Out, startCircleOut, recheck } = useBridges();
  const amountId = useId();
  const recipientId = useId();
  const inFlight = useRef(false);
  const [typed, setTyped] = useState(() => {
    const prefill = amountFromParams(params);
    return prefill ? String(prefill) : '';
  });
  const [source, setSource] = useState<CctpChainKey | null>(null);
  const [destination, setDestination] = useState<CctpChainKey>('baseSepolia');
  const [recipient, setRecipient] = useState(() => (intent === 'send' ? params.get('recipient') ?? '' : ''));
  const [started, setStarted] = useState<Started | null>(null);
  const [declined, setDeclined] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The transfer this visit picked up on return. Pinned by id, so it stays on
  // screen once it lands instead of dropping out with the other finished records.
  const [followId, setFollowId] = useState<string | null>(null);

  // A payment request is signed by whoever holds the wallet, signed in or not.
  const wallet = intent === 'pay' || auth.method === 'web3';
  const inbound = intent === 'add' || intent === 'pay';
  const payee = intent === 'pay' ? params.get('recipient') ?? '' : '';

  const owner = account.address;
  const reads = useReadContracts({
    contracts: SOURCE_CHAIN_KEYS.map((key) => ({
      address: SOURCE_CHAINS[key].usdc,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner ?? '0x0000000000000000000000000000000000000000'] as const,
      chainId: SOURCE_CHAINS[key].chainId,
    })),
    allowFailure: true,
    query: { enabled: !!owner && wallet && inbound, refetchInterval: 60_000 },
  });
  const sources = walletSources(SOURCE_CHAIN_KEYS, reads.data ?? []);
  const chosen = source ?? sources[0]?.key ?? null;

  const amount = parseAmount(typed);
  const route =
    !inbound && amount !== null && balances.balance !== null
      ? planOut({ amount, destination, balance: balances.balance, pool: balances.pool })
      : null;
  const routeKind = route?.kind ?? null;
  const available = inbound
    ? sources.find((option) => option.key === chosen)?.amount ?? null
    : balances.balance === null
      ? null
      : outAvailable(destination, balances.balance, balances.pool);
  // Arc takes its network fee in USDC, so a wallet burning on Arc keeps a cent
  // back. A source chain charges its fee in its own token, so an add keeps nothing.
  const max = available === null ? null : inbound ? available : spendable(available, 'send', wallet && routeKind !== 'pool');
  const target = intent === 'move' ? auth.address ?? '' : recipient.trim();
  const recipientOk = intent === 'send' ? ADDRESS.test(target) : true;
  const blocked =
    amount === null ||
    max === null ||
    toMicros(amount) > toMicros(max) ||
    !recipientOk ||
    (inbound && !chosen) ||
    (intent === 'pay' && !ADDRESS.test(payee));


  const record =
    started?.kind === 'bridge'
      ? startedRecord(bridges, started.since, { direction: started.direction, chainKey: started.chainKey })
      : null;
  const resumable = started || followId ? null : resumableRecord(bridges, Date.now(), inbound ? 'in' : 'out');
  const followed = followId ? bridges.find((b) => b.id === followId) ?? null : null;
  const tracked = record ?? followed ?? resumable;
  const resumableId = resumable?.id ?? null;
  useEffect(() => {
    if (resumableId) setFollowId(resumableId);
  }, [resumableId]);

  // While this page shows a transfer, its own wallet and arrival events stay
  // quiet: the page drops the coin when it lands.
  const trackedId = tracked?.id;
  const trackedBurn = tracked?.burnTxHash;
  const trackedMint = tracked?.mintTxHash;
  useEffect(() => {
    if (trackedId) moneySounds.claim({ ids: [trackedId, trackedBurn, trackedMint] });
  }, [trackedId, trackedBurn, trackedMint]);

  async function submit() {
    if (inFlight.current || blocked || amount === null) return;
    setDeclined(false);
    if (inbound) {
      const connector = account.connector;
      if (!account.isConnected || !connector) {
        openConnectModal?.();
        return;
      }
      if (!chosen) return;
      const mintRecipient = (intent === 'pay' ? payee : auth.address) as `0x${string}` | null;
      if (!mintRecipient) return;
      inFlight.current = true;
      moneySounds.submit();
      const since = Date.now();
      try {
        if (chainId !== SOURCE_CHAINS[chosen].chainId) await switchChainAsync({ chainId: SOURCE_CHAINS[chosen].chainId });
      } catch {
        inFlight.current = false;
        setDeclined(true);
        return;
      }
      setStarted({ kind: 'bridge', since, direction: 'in', chainKey: chosen });
      void startAppKitBridge({
        sourceChainKey: chosen,
        amountUsdc: amount,
        mintRecipient,
        getEvmProvider: () => connector.getProvider(),
      });
      return;
    }
    if (!auth.address || route === null || route.kind === 'short') return;
    if (wallet && route.kind === 'cctp' && (!account.isConnected || !account.connector)) {
      openConnectModal?.();
      return;
    }
    inFlight.current = true;
    moneySounds.submit();
    const to = target as `0x${string}`;
    if (route.kind === 'pool') {
      const pool = { kind: 'pool' as const, startedAt: Date.now(), chainKey: destination, to, amount, requestId: crypto.randomUUID() };
      setStarted({ ...pool, step: 'signed', leftSource: false });
      await askPool(pool, false);
      return;
    }
    setStarted({ kind: 'bridge', since: Date.now(), direction: 'out', chainKey: destination });
    const args = { destChainKey: destination, amountUsdc: amount, recipient: to, userAddress: auth.address };
    const connector = account.connector;
    if (wallet) {
      void startWeb3Out({
        ...args,
        getEvmProvider: () => (connector ? connector.getProvider() : Promise.reject(new Error('Wallet provider unavailable'))),
      });
    } else {
      void startCircleOut(args);
    }
  }

  /// Ask the backend about a Gateway cash-out. A re-ask uses the same request
  /// id, so it reports on the movement already made instead of making another.
  async function askPool(
    pool: { kind: 'pool'; startedAt: number; chainKey: CctpChainKey; to: `0x${string}`; amount: number; requestId: string },
    recheck: boolean,
  ) {
    let outcome: { step: TransferStep | 'failed'; leftSource: boolean };
    let keys: { ids: Array<string | null | undefined> } = { ids: [] };
    try {
      const result = await api.gatewayCashOut(pool.chainKey as PoolDestination, pool.to, pool.amount, pool.requestId);
      outcome = poolOutcome(result);
      keys = { ids: [result.reference, result.txHash] };
    } catch (err) {
      const named = err instanceof ApiError ? (err.body as { reference?: unknown } | null)?.reference : null;
      outcome = poolOutcome({ status: err instanceof ApiError ? err.status : null, reference: typeof named === 'string' ? named : null });
    }
    if (recheck && outcome.step === 'failed') return;
    setStarted({ ...pool, ...outcome });
    if (outcome.step === 'arrived') moneySounds.outcome('success', keys);
    else moneySounds.claim(keys);
  }

  function reset() {
    inFlight.current = false;
    setStarted(null);
    setFollowId(null);
    setDeclined(false);
  }

  const title =
    intent === 'add' ? t.titleAdd
      : intent === 'move' ? t.titleMove
        : intent === 'send' ? t.titleSend
          : fill(t.titlePay, { amount: formatAmount(amount ?? 0, locale) });

  const progress = (() => {
    if (tracked) {
      return {
        direction: tracked.direction ?? 'in',
        chainName: bridgeChainMeta(tracked.sourceChainKey).name,
        step: stepForPhase(tracked.phase),
        leftSource: !!tracked.burnTxHash,
        startedAt: tracked.startedAt,
        speed: routeSpeed(tracked.direction === 'out' ? 'cctpOut' : 'cctpIn'),
        onCheckAgain: () => void recheck(tracked.id),
      };
    }
    if (started?.kind === 'pool') {
      return {
        direction: 'out' as const,
        chainName: SOURCE_CHAINS[started.chainKey].name,
        step: started.step,
        leftSource: started.leftSource,
        startedAt: started.startedAt,
        speed: routeSpeed('pool'),
        onCheckAgain: () => void askPool(started, true),
      };
    }
    if (started?.kind === 'bridge') {
      return {
        direction: started.direction,
        chainName: bridgeChainMeta(started.chainKey as CctpChainKey).name,
        step: 'signed' as const,
        leftSource: false,
        startedAt: started.since,
        speed: routeSpeed(started.direction === 'out' ? 'cctpOut' : 'cctpIn'),
        onCheckAgain: () => {},
      };
    }
    return null;
  })();

  const chainOf = (key: CctpChainKey) => SOURCE_CHAINS[key].name;
  const cta =
    amount === null
      ? sheet.ctaNoAmount
      : inbound
        ? chosen
          ? fill(intent === 'pay' ? t.ctaPay : t.ctaAdd, { amount: formatAmount(amount, locale), chain: chainOf(chosen) })
          : t.chooseSource
        : fill(intent === 'move' ? t.ctaMove : t.ctaSend, { amount: formatAmount(amount, locale), chain: chainOf(destination) });

  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <header className="border-b border-[var(--lp-border-light)] pb-6">
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--lp-dark)]">{title}</h1>
        <div className="mt-3">
          <NetworkContext />
        </div>
      </header>

      <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-8">
        {progress ? (
          <TransferProgress
            {...progress}
            signer={wallet ? 'wallet' : 'account'}
            notifies={willNotifyOnArrival(intent)}
            onTryAgain={reset}
            onAnother={() => {
              reset();
              setTyped('');
            }}
            onDone={() => router.push(auth.isAuthenticated ? '/account' : '/')}
          />
        ) : intent === 'add' && !wallet ? (
          <section aria-labelledby="cross-where" className="space-y-6">
            <h2 id="cross-where" className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.fromExchange}</h2>
            <DepositCard />
            <p className="flex items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-4 text-[15px] text-[var(--lp-dark)]">
              {t.cardOrBank}
              <span className="text-[13px] text-[var(--lp-text-sub)]">{t.comingSoon}</span>
            </p>
          </section>
        ) : intent === 'move' && !wallet ? (
          <section className="space-y-3">
            <p className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--lp-dark)]">{t.moveNeedsWallet}</p>
            <Link href="/bridge?intent=send" className={QUIET}>{t.titleSend}</Link>
          </section>
        ) : (
          <>
            <section aria-labelledby="cross-where" className="space-y-4">
              <h2 id="cross-where" className="text-[20px] font-semibold text-[var(--lp-dark)]">{inbound ? t.whereFrom : t.whereTo}</h2>
              {inbound ? (
                <fieldset className="space-y-2">
                  <legend className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.fromWallet}</legend>
                  {!account.isConnected ? (
                    <button type="button" onClick={() => openConnectModal?.()} className={SECONDARY}>{t.connectWallet}</button>
                  ) : reads.isPending ? (
                    <div aria-busy="true" className="space-y-2">
                      <div className={`h-12 ${SOFT}`} />
                      <div className={`h-12 ${SOFT}`} />
                    </div>
                  ) : sources.length === 0 ? (
                    <p className="text-[15px] text-[var(--lp-text-sub)]">{t.walletEmpty}</p>
                  ) : (
                    sources.map((option) => (
                      <label key={option.key} className={OPTION}>
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="cross-source"
                            value={option.key}
                            checked={chosen === option.key}
                            onChange={() => setSource(option.key)}
                            className="size-4 accent-[var(--lp-dark)]"
                          />
                          <span className="text-[15px] font-semibold text-[var(--lp-dark)]">{chainOf(option.key)}</span>
                        </span>
                        <span className="text-[14px] tabular-nums text-[var(--lp-text-sub)]">{`${formatBalance(option.amount, locale)} USDC`}</span>
                      </label>
                    ))
                  )}
                  {intent === 'pay' && ADDRESS.test(payee) ? (
                    <p className="pt-2 text-[14px] text-[var(--lp-dark)]">
                      <AddressText template={t.payTo} address={groupAddress(payee)} />
                    </p>
                  ) : null}
                  {intent === 'add' ? (
                    <p className="flex items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-4 text-[15px] text-[var(--lp-dark)]">
                      {t.cardOrBank}
                      <span className="text-[13px] text-[var(--lp-text-sub)]">{t.comingSoon}</span>
                    </p>
                  ) : null}
                </fieldset>
              ) : (
                <fieldset className="space-y-3">
                  <legend className="sr-only">{t.whereTo}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {WITHDRAW_DEST_KEYS.map((key) => (
                      <label key={key} className={OPTION}>
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="cross-destination"
                            value={key}
                            checked={destination === key}
                            onChange={() => setDestination(key)}
                            className="size-4 accent-[var(--lp-dark)]"
                          />
                          <span className="text-[15px] font-semibold text-[var(--lp-dark)]">{chainOf(key)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {intent === 'move' && auth.address ? (
                    <p className="text-[14px] text-[var(--lp-dark)]">
                      <AddressText template={t.payTo} address={groupAddress(auth.address)} />
                    </p>
                  ) : (
                    <div>
                      <label htmlFor={recipientId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">{t.recipientLabel}</label>
                      <input
                        id={recipientId}
                        value={recipient}
                        onChange={(event) => setRecipient(event.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        dir="ltr"
                        className="mt-2 min-h-12 w-full rounded-[10px] border border-[var(--lp-outline-strong)] bg-transparent px-3 text-[15px] text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      />
                      {recipient.trim() !== '' && !ADDRESS.test(recipient.trim()) ? (
                        <p className="mt-2 text-[13px] text-[var(--color-critical)]">{sheet.recipientInvalid}</p>
                      ) : ADDRESS.test(recipient.trim()) ? (
                        <p className="mt-2 text-[13px] text-[var(--lp-dark)]">
                          <AddressText template={sheet.recipientCheck} address={groupAddress(recipient.trim())} />
                        </p>
                      ) : null}
                    </div>
                  )}
                </fieldset>
              )}
            </section>

            <section className="space-y-4">
              <label htmlFor={amountId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">{sheet.amountLabel}</label>
              <div className="flex items-baseline gap-2 border-b-2 border-[var(--lp-dark)] pb-2 focus-within:border-[var(--accent)]">
                <input
                  id={amountId}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  dir="ltr"
                  className="min-w-0 flex-1 bg-transparent text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
                />
                <span className="text-[18px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] tabular-nums text-[var(--lp-text-sub)]">
                  {available === null ? ' ' : fill(sheet.available, { amount: formatBalance(available, locale) })}
                </p>
                <div className="flex gap-2">
                  {(['quarter', 'half', 'max'] as const).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={CHIP}
                      disabled={max === null || max <= 0}
                      onClick={() => {
                        if (max !== null) setTyped(String(chipAmount(max, chip)));
                      }}
                    >
                      {sheet[chip]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1 text-[14px] text-[var(--lp-text-sub)]">
                {inbound ? <p>{t.walletShowsFee}</p> : null}
                <p>{routeKind === 'pool' ? t.usuallySeconds : t.usuallyUnderMinute}</p>
              </div>
              {amount !== null && max !== null && toMicros(amount) > toMicros(max) ? (
                <p className="text-[14px] text-[var(--lp-dark)]">{fill(sheet.short, { amount: formatAmount(shortfall(amount, max), locale) })}</p>
              ) : null}
              {intent === 'send' ? <p className="text-[14px] font-medium text-[var(--color-warning)]">{sheet.sendIrreversible}</p> : null}
              {declined ? (
                <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{sheet.declined}</p>
              ) : null}
              <button type="button" onClick={() => void submit()} disabled={blocked} className={PRIMARY}>{cta}</button>
            </section>
          </>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setHistoryOpen(true)} className={QUIET}>{t.history}</button>
          {USDC_FAUCET ? (
            <a href={USDC_FAUCET} target="_blank" rel="noreferrer" className="text-[13px] text-[var(--lp-text-sub)] underline underline-offset-4">
              {t.faucet}
            </a>
          ) : null}
        </footer>
      </div>

      <BridgeHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
