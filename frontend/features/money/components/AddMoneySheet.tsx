'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { erc20Abi } from 'viem';
import { useAccount, useChainId, useReadContracts, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { MoneyFrame } from '@/shared/components/MoneyFrame';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { buttonClasses } from '@/shared/components/Button';
import { Hint } from '@/shared/components/Hint';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { moneySounds } from '@/shared/sound/moneySounds';
import { fill } from '@/features/deals/workspace/presentation';
import { DepositCard, Qr } from '@/features/deposit/components/DepositCard';
import { shortAddress } from '@/shared/utils/format';
import { SOURCE_CHAINS, SOURCE_CHAIN_KEYS, type CctpChainKey } from '@/features/bridge/config';
import { startedRecord } from '@/features/bridge/crossChainIntent';
import { useBridges } from '@/features/bridge/hooks/useBridge';
import { routeSpeed, stepForPhase, walletSources } from '@/features/bridge/routePlan';
import { TransferProgress } from '@/features/bridge/components/TransferProgress';
import { gatewayDeposit, gatewayEstimateSpend, gatewaySpend } from '@/features/gateway/lib';
import { pressKey } from '../amountEntry';
import { chipAmount, fromWalletPoolSpend } from '../moneySheetModel';
import { topUpWithFees } from '../sendFromWhole';
import { toMicros } from '../usdc';
import { addSources, arrivesIn, readyIn, type MoveSource } from '../moveSources';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { AmountHero } from './AmountHero';
import { Keypad } from './Keypad';
import { NetworkLogo } from './NetworkLogo';
import { useMoneyText } from '../hooks/useMoneyText';
import { useAmountInput } from '../hooks/useAmountInput';

export type AddSheetMode = 'add' | 'moveToBalance' | 'addToPool';
type Step = 'pick' | 'amount' | 'exchange' | 'progress' | 'done' | 'landed';
type Landed = { amount: number; from: string; seconds: number | null; walletFee: boolean };

const ROW =
  'flex min-h-16 w-full items-center gap-3 rounded-[16px] border bg-[var(--raised)] px-3.5 text-start transition-colors duration-[var(--dur-press)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-[var(--raised)] px-3.5 text-[14px] font-medium text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const LABEL = 'text-[13px] font-medium text-[var(--ink-muted)]';

function IconCircle({ path }: { path: string }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--ink)]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </span>
  );
}
const TRANSFER_PATH = 'M4 8h13l-3-3M20 16H7l3 3';
const EXCHANGE_PATH = 'M12 4v12m0 0-5-5m5 5 5-5M5 20h14';
const CARD_PATH = 'M3 6h18v13H3zM3 10.5h18';

/// The one money sheet for adding (view 51): where the money is, then the
/// amount, then progress in the same sheet. Also opens on the Transfer balance
/// to move it to the balance, or to add to it from a network.
export function AddMoneySheet({ open = true, page = false, mode, onClose, onLanded }: {
  open?: boolean;
  /// Shown as its own page (view 51, fourth round) rather than a sheet.
  page?: boolean;
  mode: AddSheetMode;
  onClose: () => void;
  /// Called with the note to show once money lands in the balance.
  onLanded?: (note: string) => void;
}) {
  const pages = useTranslations().moneyPages;
  const all = useTranslations();
  const t = all.moneyMove;
  const sheetCopy = all.money.sheet;
  const entry = all.money.entry;
  const money = useMoneyText();
  const auth = useAuth();
  const account = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const balances = useMoneyBalances();
  const { bridges, startAppKitBridge, recheck } = useBridges();
  const wide = useMediaQuery('(min-width: 768px)');
  const keypad = useMediaQuery('(pointer: coarse)');
  const inline = wide && mode === 'add';
  const titleId = useId();
  const amountId = useId();
  const inFlight = useRef(false);

  const [step, setStep] = useState<Step>('pick');
  const [chosen, setChosen] = useState<MoveSource | null>(null);
  // Your currency leads and USDC sits small under it (owner, 9 Nov 2026, Figma 228:675).
  const amt = useAmountInput(null);
  const { typed, setTyped } = amt;
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [since, setSince] = useState(0);
  const [doneNote, setDoneNote] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [landedCard, setLandedCard] = useState<Landed | null>(null);

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
    query: { enabled: open && !!owner, refetchInterval: 60_000 },
  });
  const networks = useMemo(() => walletSources(SOURCE_CHAIN_KEYS, reads.data ?? []), [reads.data]);
  const isWallet = auth.method === 'web3';
  const sources = addSources({ account: isWallet ? 'wallet' : 'email', walletConnected: account.isConnected, networks, pool: balances.pool });
  const networkSources = sources.filter((s): s is Extract<MoveSource, { kind: 'network' }> => s.kind === 'network');
  const poolSource = sources.find((s) => s.kind === 'pool') ?? null;

  // Each opening starts where its mode starts.
  useEffect(() => {
    if (!open) return;
    inFlight.current = false;
    setDeclined(false);
    setBusy(false);
    setDoneNote(null);
    setLandedCard(null);
    setPickerOpen(false);
    if (mode === 'moveToBalance') {
      setChosen({ kind: 'pool', amount: balances.pool });
      amt.setFromUsdc(balances.pool > 0 ? chipAmount(balances.pool, 'max') : null, 'down');
      setStep('amount');
    } else {
      setChosen(null);
      setTyped('');
      setStep('pick');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const chainName = (key: string) => SOURCE_CHAINS[key as CctpChainKey]?.name ?? key;
  const max = chosen && chosen.kind !== 'exchange' ? chosen.amount : null;
  const amount = amt.usdc;
  const over = amount !== null && max !== null && toMicros(amount) > toMicros(max);
  const blocked = amount === null || max === null || over || busy;

  const record = step === 'progress' && chosen?.kind === 'network' ? startedRecord(bridges, since, { direction: 'in', chainKey: chosen.chain }) : null;
  const landed = record?.phase === 'done';
  const recordId = record?.id;
  useEffect(() => {
    if (!landed || !chosen || chosen.kind !== 'network' || amount === null) return;
    onLanded?.(money.fill(t.home.added, { amount: amount }, { network: chainName(chosen.chain) }, { exact: true }));
    balances.refetch();
    // The card stays until the person presses Done (owner's test, 5 Nov 2026).
    setLandedCard({ amount, from: chainName(chosen.chain), seconds: record?.startedAt ? Math.max(1, Math.round((Date.now() - record.startedAt) / 1000)) : null, walletFee: true });
    setStep('landed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, recordId]);

  // On a computer the richest network is picked at once, so the amount shows with it.
  useEffect(() => {
    if (open && inline && step === 'pick' && !chosen && networkSources[0]) pick(networkSources[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inline, step, chosen, networkSources[0]?.chain]);

  function pick(source: MoveSource) {
    if (source.kind === 'exchange') {
      setChosen(source);
      setStep('exchange');
      return;
    }
    setChosen(source);
    amt.setFromUsdc(chipAmount(source.amount, 'max'), 'down');
    setDeclined(false);
    // On a computer the network, the amount and the button share one screen.
    if (!(inline && source.kind === 'network')) setStep('amount');
  }

  async function provider() {
    const connector = account.connector;
    if (!connector) throw new Error('no wallet connected');
    return connector.getProvider();
  }

  async function submit() {
    if (inFlight.current || blocked || !chosen || amount === null || !auth.address) return;
    inFlight.current = true;
    setDeclined(false);
    setBusy(true);
    moneySounds.submit();
    const me = auth.address as `0x${string}`;
    try {
      if (chosen.kind === 'network' && mode === 'addToPool') {
        if (chainId !== SOURCE_CHAINS[chosen.chain].chainId) await switchChainAsync({ chainId: SOURCE_CHAINS[chosen.chain].chainId });
        await gatewayDeposit({ provider: await provider(), amount: String(amount), chain: SOURCE_CHAINS[chosen.chain].appKit });
        setDoneNote(money.fill(t.pool.onItsWay, { amount: amount }, {}, { exact: true }) + ' · ' + (readyIn(chosen.chain) === 'seconds' ? t.pool.readySeconds : t.pool.readyAbout15));
        balances.refetch();
        setStep('done');
        return;
      }
      if (chosen.kind === 'network') {
        if (!account.isConnected || !account.connector) { openConnectModal?.(); inFlight.current = false; setBusy(false); return; }
        if (chainId !== SOURCE_CHAINS[chosen.chain].chainId) await switchChainAsync({ chainId: SOURCE_CHAINS[chosen.chain].chainId });
        const started = Date.now();
        setSince(started);
        setStep('progress');
        void startAppKitBridge({ sourceChainKey: chosen.chain, amountUsdc: amount, mintRecipient: me, getEvmProvider: provider });
        return;
      }
      if (chosen.kind === 'pool') {
        const p = await provider();
        const fees = await gatewayEstimateSpend({ provider: p, amount: String(amount), recipientAddress: me });
        const spent = await gatewaySpend({ provider: p, amount: String(topUpWithFees(amount, fees)), recipientAddress: me });
        const state = fromWalletPoolSpend({ txHash: spent.txHash });
        if (state.kind === 'confirmed') {
          moneySounds.outcome('success', { ids: [spent.txHash] });
          onLanded?.(money.fill(t.home.added, { amount: amount }, { network: t.pool.transferBalance }, { exact: true }));
          balances.refetch();
          setLandedCard({ amount, from: t.pool.transferBalance, seconds: null, walletFee: true });
          setStep('landed');
          return;
        }
        setDoneNote(money.fill(t.pool.onItsWay, { amount: amount }, {}, { exact: true }));
        setStep('done');
      }
    } catch (error) {
      const state = fromWalletPoolSpend({ error });
      if (state.kind === 'failed') {
        setDeclined(true);
        setStep(chosen.kind === 'network' && mode !== 'addToPool' ? 'amount' : step);
      } else {
        setDoneNote(money.fill(t.pool.onItsWay, { amount: amount }, {}, { exact: true }));
        setStep('done');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const title = mode === 'moveToBalance' ? t.pool.moveTitle : mode === 'addToPool' ? t.pool.addTitle : t.add.title;
  const cta =
    amount === null
      ? sheetCopy.ctaNoAmount
      : mode === 'moveToBalance'
        ? money.fill(t.pool.moveCta, { amount: amount }, {}, { exact: true })
        : money.fill(t.add.cta, { amount: amount }, {}, { exact: true });

  const noWallet = !account.isConnected;
  const networkRow = (source: Extract<MoveSource, { kind: 'network' }>) => {
    const sub = mode === 'addToPool'
      ? (readyIn(source.chain) === 'seconds' ? t.pool.readySeconds : t.pool.readyAbout15)
      : (arrivesIn(source.chain) === 'seconds' ? t.add.arrivesSeconds : t.add.arrivesTwenty);
    return { name: chainName(source.chain), sub };
  };
  // Back on a page steps back inside the flow first, then leaves it.
  const stepBack = step === 'amount' && mode !== 'moveToBalance' && !inline;
  const back = () => {
    if (busy) return;
    if (stepBack || step === 'exchange') { setStep('pick'); return; }
    onClose();
  };
  const heading =
    step === 'amount' && mode !== 'moveToBalance' && chosen?.kind === 'network'
      ? fill(t.add.from, { network: chainName(chosen.chain) })
      : step === 'amount' && chosen?.kind === 'pool' && mode === 'add'
        ? t.pool.transferBalance
        : step === 'exchange' ? t.add.exchange : title;

  const amountBlock = (source: Exclude<MoveSource, { kind: 'exchange' }>) => (
    <div data-add-amount className="space-y-4">
      {mode === 'moveToBalance' ? (
        <dl className="divide-y divide-[var(--line)] rounded-[16px] bg-[var(--raised)] px-4">
          {[[t.pool.from, t.pool.transferBalance], [t.pool.to, t.pool.yourBalance], [t.pool.arrives, t.pool.inSeconds]].map(([k, v]) => (
            <div key={k} className="flex min-h-11 items-center justify-between gap-3 text-[14px]">
              <dt className="text-[var(--ink-secondary)]">{k}</dt>
              <dd className="font-semibold text-[var(--ink)]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <AmountHero id={amountId} label={sheetCopy.amountLabel} value={typed} onChange={setTyped} keypad={keypad} sign={amt.sign} />
      {amt.local && amount !== null ? <p data-exact-usdc dir="ltr" className="-mt-2 text-center text-[14px] font-medium tabular-nums text-[var(--ink-muted)]">{money.usdc(amount, { exact: true })}</p> : null}
      <p className="text-center text-[14px] font-medium text-[var(--ink-secondary)]" dir="auto">
        {source.kind === 'network'
          ? money.fill(t.add.there, { amount: source.amount }, { network: chainName(source.chain) })
          : money.fill(sheetCopy.available, { amount: source.amount })}
      </p>
      <div className="flex justify-center gap-2">
        {(['quarter', 'half', 'max'] as const).map((chip) => (
          <button key={chip} type="button" className={CHIP} disabled={source.amount <= 0} onClick={() => amt.setFromUsdc(chipAmount(source.amount, chip), 'down')}>
            {sheetCopy[chip]}
          </button>
        ))}
      </div>
      {keypad ? <Keypad onKey={(key) => setTyped((value) => pressKey(value, key))} label={entry.keypad} backLabel={entry.back} /> : null}
      {over ? <p className="text-center text-[14px] font-medium text-[var(--ink)]">{money.fill(sheetCopy.short, { amount: amount! - source.amount }, {}, { exact: true })}</p> : null}
      {declined ? <p role="alert" className="text-center text-[14px] font-medium text-[var(--color-critical)]">{t.add.declined}</p> : null}
      <p className="text-center text-[13px] font-medium text-[var(--ink-muted)]">{source.kind === 'network' ? t.add.walletFee : t.pool.confirmOnce}</p>
      <button type="button" onClick={() => void submit()} disabled={blocked} aria-busy={busy} className={buttonClasses({ size: 'lg', className: 'w-full' })}>
        {cta}
      </button>
    </div>
  );

  const faucetLink = ARC_NETWORK === 'testnet' ? (
    <Link href="/profile/wallets" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--ink)] hover:underline">{pages.added.freeTest}</Link>
  ) : null;

  const otherWays = mode !== 'add' ? null : inline ? (
    <p data-other-ways className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
      <span className="font-medium text-[var(--ink-muted)]">{pages.added.otherWays}</span>
      {poolSource ? (
        <button type="button" onClick={() => { setChosen(poolSource); amt.setFromUsdc(chipAmount(poolSource.amount, 'max'), 'down'); setStep('amount'); }} className="min-h-11 font-semibold text-[var(--ink)] hover:underline">{t.pool.transferBalance}</button>
      ) : null}
      <button type="button" onClick={() => pick({ kind: 'exchange' })} className="min-h-11 font-semibold text-[var(--ink)] hover:underline">{t.add.exchange}</button>
      {faucetLink}
    </p>
  ) : (
    <div className="space-y-2">
      {poolSource ? (
        <button type="button" onClick={() => pick(poolSource)} className={`${ROW} border-[var(--line)]`}>
          <IconCircle path={TRANSFER_PATH} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[var(--ink)]">{t.pool.transferBalance}</span>
            <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{t.add.arrivesSeconds}</span>
          </span>
          <span dir="ltr" className="text-[15px] font-semibold tabular-nums text-[var(--ink)]">{money.text(poolSource.amount)}</span>
        </button>
      ) : null}
      <span className={`${LABEL} block pt-2`}>{t.add.otherWays}</span>
      <button type="button" onClick={() => pick({ kind: 'exchange' })} className={`${ROW} border-[var(--line)]`}>
        <IconCircle path={EXCHANGE_PATH} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--ink)]">{t.add.exchange}</span>
          <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{t.add.exchangeNote}</span>
        </span>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[14px] font-semibold text-[var(--ink)]">{t.add.show}</span>
      </button>
      <div aria-disabled className={`${ROW} border-[var(--line)] opacity-50`}>
        <IconCircle path={CARD_PATH} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--ink)]">{t.add.card}</span>
          <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{t.add.soon}</span>
        </span>
      </div>
      {faucetLink}
    </div>
  );

  return (
    <MoneyFrame page={page} open={open} labelledBy={titleId} busy={busy} onClose={page ? back : onClose}>
      <div data-add-money-sheet data-step={step} className="space-y-5">
        {!page && stepBack ? (
          <button type="button" onClick={() => setStep('pick')} className="-ms-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-[15px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)]">
            <span aria-hidden className="rtl:rotate-180">‹</span>
            {heading}
          </button>
        ) : null}
        {step !== 'landed' ? (
          <h2 id={titleId} className={`flex items-center gap-2 font-semibold text-[var(--ink)] ${page ? 'text-[26px] tracking-[-0.02em]' : 'text-[20px]'} ${!page && stepBack ? 'sr-only' : ''}`}>
            {page ? heading : title}
            {mode === 'addToPool' ? <Hint>{t.pool.addTip}</Hint> : null}
          </h2>
        ) : null}

        {step === 'pick' ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className={LABEL}>{t.add.fromWallet}</span>
                {!wide && networkSources.length > 1 ? <span className="text-[13px] font-medium text-[var(--ink-secondary)]">{t.add.swipe} <span aria-hidden className="inline-block rtl:rotate-180">→</span></span> : null}
              </div>
              {noWallet ? (
                <button type="button" onClick={() => openConnectModal?.()} className={`${ROW} border-[var(--line)]`}>
                  <IconCircle path={TRANSFER_PATH} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[var(--ink)]">{t.add.connect}</span>
                    <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{t.add.connectNote}</span>
                  </span>
                </button>
              ) : reads.isPending ? (
                <div aria-busy="true" className="h-[132px] rounded-[16px] bg-[var(--raised)] motion-safe:animate-pulse" />
              ) : networkSources.length === 0 ? (
                <p className="text-[15px] text-[var(--ink-secondary)]">{t.add.empty}</p>
              ) : wide ? (
                <NetworkPicker sources={networkSources} label={t.add.networks} change={t.add.change} describe={networkRow} open={pickerOpen} setOpen={setPickerOpen} onPick={pick} />
              ) : (
                <NetworkCards sources={networkSources} describe={networkRow} onPick={pick} label={t.add.networks} />
              )}
            </div>
            {inline && chosen?.kind === 'network' ? amountBlock(chosen) : null}
            {otherWays}
          </div>
        ) : null}

        {step === 'exchange' ? (
          <div className="space-y-4">
            {!page ? (
              <button type="button" onClick={() => setStep('pick')} className="-ms-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-[15px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)]">
                <span aria-hidden className="rtl:rotate-180">‹</span>{t.add.exchange}
              </button>
            ) : null}
            {isWallet && auth.address ? <WalletDeposit address={auth.address} /> : <DepositCard />}
          </div>
        ) : null}

        {step === 'amount' && chosen && chosen.kind !== 'exchange' ? amountBlock(chosen) : null}

        {step === 'progress' && chosen?.kind === 'network' ? (
          <TransferProgress
            direction="in"
            chainName={chainName(chosen.chain)}
            signer="wallet"
            step={record ? stepForPhase(record.phase) : 'signed'}
            leftSource={!!record?.burnTxHash}
            startedAt={record?.startedAt ?? since}
            speed={routeSpeed('cctpIn')}
            notifies
            onCheckAgain={() => { if (record) void recheck(record.id); }}
            onTryAgain={() => setStep('amount')}
            onAnother={() => setStep('pick')}
            onDone={onClose}
          />
        ) : null}

        {step === 'landed' && landedCard ? (
          <div data-added-card className="space-y-6 text-center">
            <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--raised)] text-[var(--ink)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
            </span>
            <div className="space-y-1.5">
              <h2 id={titleId} role="status" className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]" dir="auto">
                {money.fill(pages.added.title, { amount: landedCard.amount }, {}, { exact: true })}
              </h2>
              <p className="text-[15px] text-[var(--ink-secondary)]">{fill(pages.added.fromLine, { network: landedCard.from })}</p>
            </div>
            <dl className="divide-y divide-[var(--line)] rounded-[16px] bg-[var(--raised)] px-4 text-start">
              {([
                [pages.added.from, landedCard.from],
                [pages.added.to, pages.added.yourBalance],
                ...(landedCard.seconds ? [[pages.added.took, fill(pages.added.seconds, { n: landedCard.seconds })]] : []),
                ...(landedCard.walletFee ? [[pages.added.fee, pages.added.feeWallet]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex min-h-12 items-center justify-between gap-3 text-[14px]">
                  <dt className="text-[var(--ink-secondary)]">{k}</dt>
                  <dd className="font-semibold text-[var(--ink)]">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/activity" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[var(--ink)] hover:underline">{pages.added.allActivity}</Link>
            <div className="grid gap-2.5">
              <button type="button" data-added-done onClick={onClose} className={buttonClasses({ size: 'lg', className: 'w-full' })}>{pages.added.done}</button>
              {mode === 'add' ? (
                <button type="button" onClick={() => { setLandedCard(null); setChosen(null); setTyped(''); setStep('pick'); }} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{pages.added.addMore}</button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="space-y-4 text-center">
            <p role="status" className="text-[15px] font-medium text-[var(--ink)]">{doneNote}</p>
            <button type="button" onClick={onClose} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{pages.added.done}</button>
          </div>
        ) : null}
      </div>
    </MoneyFrame>
  );
}
type NetworkSource = Extract<MoveSource, { kind: 'network' }>;
type Describe = (source: NetworkSource) => { name: string; sub: string };

/// On a phone: the networks as cards in a row that swipes, the next one
/// peeking in, with dots under them.
function NetworkCards({ sources, describe, onPick, label }: { sources: NetworkSource[]; describe: Describe; onPick: (s: MoveSource) => void; label: string }) {
  const money = useMoneyText();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  return (
    <div>
      <div
        ref={scroller}
        role="list"
        aria-label={label}
        data-network-cards
        onScroll={(event) => {
          const el = event.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          if (card) setIndex(Math.round(Math.abs(el.scrollLeft) / (card.offsetWidth + 10)));
        }}
        className="-me-6 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pe-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sources.map((source, i) => {
          const { name, sub } = describe(source);
          return (
            <button
              key={source.chain}
              role="listitem"
              type="button"
              onClick={() => onPick(source)}
              data-network={source.chain}
              className={`flex h-[140px] w-[148px] shrink-0 snap-start flex-col justify-between rounded-[16px] border bg-[var(--raised)] p-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${i === 0 ? 'border-[1.5px] border-[var(--ink)]' : 'border-[var(--line)]'}`}
            >
              <NetworkLogo chain={source.chain} name={name} size={32} />
              <span>
                <span className="block text-[15px] font-semibold text-[var(--ink)]">{name}</span>
                <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{sub}</span>
              </span>
              <span dir="ltr" className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">{money.text(source.amount)}</span>
            </button>
          );
        })}
      </div>
      {sources.length > 1 ? (
        <div aria-hidden className="mt-2.5 flex justify-center gap-1.5">
          {sources.map((s, i) => (
            <span key={s.chain} className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${i === index ? 'w-4 bg-[var(--ink)]' : 'w-1.5 bg-[var(--line-strong)]'}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/// On a computer: the richest network in one row, with a small Change list
/// of every network and its amount.
function NetworkPicker({ sources, label, change, describe, open, setOpen, onPick }: {
  sources: NetworkSource[];
  label: string;
  change: string;
  describe: Describe;
  open: boolean;
  setOpen: (open: boolean) => void;
  onPick: (s: MoveSource) => void;
}) {
  const money = useMoneyText();
  const [current, setCurrent] = useState<NetworkSource>(sources[0]);
  const listId = useId();
  const { name, sub } = describe(current);
  return (
    <div className="relative">
      <div className={`${ROW} border-[1.5px] border-[var(--ink)]`}>
        <button type="button" onClick={() => onPick(current)} data-network={current.chain} className="flex min-w-0 flex-1 items-center gap-3 text-start focus-visible:outline-none">
          <NetworkLogo chain={current.chain} name={name} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[var(--ink)]">{name}</span>
            <span className="block text-[13px] font-medium text-[var(--ink-secondary)]"><span dir="ltr">{money.text(current.amount)}</span> · {sub}</span>
          </span>
        </button>
        {sources.length > 1 ? (
          <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
            {change}
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        ) : null}
      </div>
      {open ? (
        <ul id={listId} role="listbox" aria-label={label} className="absolute end-0 z-10 mt-2 w-[300px] rounded-[14px] border border-[var(--line-strong)] bg-[var(--raised)] py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          {sources.map((source) => {
            const d = describe(source);
            return (
              <li key={source.chain} role="option" aria-selected={source.chain === current.chain}>
                <button
                  type="button"
                  onClick={() => { setCurrent(source); setOpen(false); onPick(source); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-start hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:bg-[var(--surface)] ${source.chain === current.chain ? 'bg-[var(--surface)]' : ''}`}
                >
                  <NetworkLogo chain={source.chain} name={d.name} size={24} />
                  <span className="flex-1 text-[14px] font-medium text-[var(--ink)]">{d.name}</span>
                  <span dir="ltr" className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">{money.text(source.amount)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/// A wallet account has no deposit address of its own on the server: its
/// wallet address takes USDC on Arc and on every other network listed here.
function WalletDeposit({ address }: { address: string }) {
  const all = useTranslations();
  const w = all.moneyPages.walletSteps;
  const arc = ARC_NETWORK === 'testnet' ? 'Arc Testnet' : 'Arc';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // The address is on screen in full; nothing to fix if the clipboard says no.
    }
  };
  // Three steps in one card (owner, 9 Nov 2026, Figma 228:641): the network, the
  // address with its QR, and the note that it is being watched for.
  return (
    <div data-wallet-deposit className="divide-y divide-[var(--line)] rounded-[20px] border border-[var(--line)] bg-[var(--raised)] px-5">
      <section className="py-5">
        {/* What happens on another network is a note behind the (i), not a paragraph (owner, 9 Nov 2026). */}
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">
          {fill(w.pick, { arc })}
          <Hint align="end">{fill(w.pickNote, { arc })}</Hint>
        </h3>
      </section>
      <section className="space-y-4 py-5">
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">{w.send}</h3>
        <div className="flex justify-center"><Qr value={address} label={w.qrAlt} /></div>
        <div className="flex items-center gap-3 rounded-[14px] bg-[var(--surface)] py-2 ps-4 pe-2">
          <p dir="ltr" title={address} className="min-w-0 flex-1 truncate text-[16px] font-semibold tabular-nums text-[var(--ink)]">{shortAddress(address)}</p>
          <button type="button" onClick={() => void copy()} className={buttonClasses({ size: 'md', className: 'shrink-0 px-5' })}>
            {copied ? all.deposit.copied : all.deposit.copy}
          </button>
        </div>
        <p dir="ltr" className="select-all break-all text-center font-mono text-[13px] text-[var(--ink-muted)]">{address}</p>
        <p className="rounded-[12px] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--ink)]">{w.onlyUsdc}</p>
      </section>
      <section className="space-y-1.5 py-5">
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">{w.wait}</h3>
        <p role="status" className="flex items-center gap-2 text-[14px] text-[var(--ink-secondary)]">
          <span aria-hidden className="size-2 rounded-full bg-[var(--action)] motion-safe:animate-pulse" />
          {w.watching}
        </p>
      </section>
    </div>
  );
}
