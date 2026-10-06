'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { api, ApiError, type BridgeChainKey } from '@/core/api';
import { useBridges, type BridgeRecord } from '@/features/bridge/hooks/useBridge';
import { SOURCE_CHAINS, SOURCE_CHAIN_KEYS, ARC_CCTP, type CctpChainKey } from '@/features/bridge/config';
import { routeSpeed, stepForPhase, type TransferStep } from '@/features/bridge/routePlan';
import { TransferProgress } from '@/features/bridge/components/TransferProgress';
import { ReceiptCard } from '@/features/receipt/ReceiptCard';
import { downloadReceiptImage } from '@/features/activity/receiptPresentation';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatAmount } from '@/features/money/balanceModel';
import { fill } from '@/features/deals/workspace/presentation';
import { cn } from '@/shared/utils/cn';
import { moneySounds } from '@/shared/sound/moneySounds';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { parseRecipient, stepForBridgeStatus } from './recipient';

const PRIMARY =
  'flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--lp-accent)] px-5 text-[16px] font-bold text-[#10170b] transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]';
const SECONDARY =
  'flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';
const FIELD =
  'mt-2 w-full min-h-12 rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 text-[15px] text-[var(--lp-dark)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

/// Where a seller can send earnings: Arc first, then the chains a withdrawal can reach.
const OUT_KEYS: CctpChainKey[] = (['baseSepolia', 'sepolia', 'arbitrumSepolia', 'optimismSepolia', 'polygonAmoy'] as CctpChainKey[])
  .filter((k) => SOURCE_CHAIN_KEYS.includes(k));
type Network = 'arc' | CctpChainKey;

interface WalletSlice { address: string | null; arcBalanceUsdc: string | null; available: boolean }
export interface CashoutInfo {
  jobId: string;
  sellerAddress: string;
  dealAmountUsdc: string;
  settledAt: number | null;
  legacyEscrow: boolean;
  accountKind: 'circle' | 'wallet';
  identityWallet: WalletSlice;
  sellerAgentWallet: WalletSlice;
  buyerAgentWallet: WalletSlice;
}

type Sent = { amount: number; to: string; network: Network; txHash: string | null; reference: string | null; at: number };
type Moving = { kind: 'bridge'; bridgeId: string; reference: string } | { kind: 'wallet'; since: number };

/// A seller's earnings from one deal: where they go, the steps while they move,
/// then the receipt. Same shape as paying a request.
export function CashoutView({ jobId }: { jobId: string }) {
  const copy = useTranslations().cashoutFlow;
  const [info, setInfo] = useState<CashoutInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.cashoutInfo(jobId).then((r) => alive && setInfo(r as CashoutInfo)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [jobId]);

  return (
    <main className="product-surface min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-[480px] px-4 pb-16 pt-8 sm:px-6">
        <Link href={`/deals/${jobId}`} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">
          <span aria-hidden className="me-1.5 rtl:-scale-x-100">←</span>{copy.back}
        </Link>
        {failed ? <p role="alert" className="mt-6 text-[15px] text-[var(--lp-dark)]">{copy.loadError}</p> : null}
        {!info && !failed ? <div aria-busy className="mt-6 h-[420px] rounded-[24px] bg-[var(--lp-card)] motion-safe:animate-pulse" /> : null}
        {info ? <CashoutBody info={info} jobId={jobId} /> : null}
      </div>
    </main>
  );
}

function CashoutBody({ info, jobId }: { info: CashoutInfo; jobId: string }) {
  const copy = useTranslations().cashoutFlow;
  if (!info.settledAt) {
    return (
      <section className="mt-6">
        <h1 className="text-[24px] font-semibold text-[var(--lp-dark)]">{copy.notReadyTitle}</h1>
        <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{copy.notReadyBody}</p>
        <Link href={`/deals/${jobId}`} className={cn(SECONDARY, 'mt-8')}>{copy.openDeal}</Link>
      </section>
    );
  }
  if (info.legacyEscrow) return <p className="mt-6 text-[15px] text-[var(--lp-dark)]">{copy.legacyBody}</p>;
  return <CashoutForm info={info} jobId={jobId} />;
}

function CashoutForm({ info, jobId }: { info: CashoutInfo; jobId: string }) {
  const copy = useTranslations().cashoutFlow;
  const { locale } = useLocale();
  const ownWallet = info.accountKind === 'wallet';
  // Earnings sit on the deal's seller wallet for an email account, or already
  // in a wallet account's own wallet.
  const fromDeal = !ownWallet && info.sellerAgentWallet.available && Number(info.sellerAgentWallet.arcBalanceUsdc ?? 0) > 0;
  const source = ownWallet ? info.identityWallet : fromDeal ? info.sellerAgentWallet : info.identityWallet;
  const available = Number(source.arcBalanceUsdc ?? 0) || 0;
  const canMoveToBalance = !ownWallet && fromDeal && !!info.identityWallet.address;

  const [option, setOption] = useState<'balance' | 'wallet'>(canMoveToBalance ? 'balance' : 'wallet');
  const [network, setNetwork] = useState<Network>('arc');
  const [recipientText, setRecipientText] = useState('');
  const [amountText, setAmountText] = useState(available ? String(available) : '');
  const [tagMissing, setTagMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [confirmed, setConfirmed] = useState<Sent | null>(null);

  const account = useAccount();
  const { openConnectModal } = useConnectModal();
  const bridges = useBridges();

  const chainName = (n: Network) => (n === 'arc' ? 'Arc' : SOURCE_CHAINS[n].name);
  const amount = Number(amountText);
  const amountOk = Number.isFinite(amount) && amount > 0 && amount <= available + 1e-9;
  const recipient = parseRecipient(recipientText, network);
  const toBalance = option === 'balance';
  const ready = amountOk && (toBalance || recipient.kind === 'address' || recipient.kind === 'tag') && !busy;

  async function resolveTo(): Promise<{ address: string; label: string } | null> {
    if (toBalance) return { address: info.identityWallet.address!, label: copy.yourBalance };
    if (recipient.kind === 'address') return { address: recipient.address, label: `${recipient.address.slice(0, 6)}…${recipient.address.slice(-4)}` };
    if (recipient.kind === 'tag') {
      const r = await api.resolveKarwanTag(recipient.tag).catch(() => null);
      if (!r || !r.found) {
        setTagMissing(true);
        return null;
      }
      return { address: r.address, label: `@${r.tag}` };
    }
    return null;
  }

  async function submit() {
    if (!ready) return;
    setError(null);
    setTagMissing(false);
    if (ownWallet && (!account.address || !account.connector)) {
      openConnectModal?.();
      return;
    }
    setBusy(true);
    try {
      const to = await resolveTo();
      if (!to) return;
      const dest: Network = toBalance ? 'arc' : network;
      moneySounds.submit();
      if (ownWallet) {
        const since = Date.now();
        setMoving({ kind: 'wallet', since });
        setSent({ amount, to: to.label, network: dest, txHash: null, reference: null, at: since });
        const connector = account.connector!;
        if (dest === 'arc') {
          void bridges.startWeb3ArcSend({ amountUsdc: amount, recipient: to.address as `0x${string}`, userAddress: account.address! });
        } else {
          void bridges.startWeb3Out({
            destChainKey: dest,
            amountUsdc: amount,
            recipient: to.address as `0x${string}`,
            userAddress: account.address!,
            getEvmProvider: () => connector.getProvider(),
          });
        }
        return;
      }
      const walletKind = fromDeal ? 'sellerAgent' : 'identity';
      if (dest === 'arc') {
        const r = await api.cashoutArc({ jobId: info.jobId, recipient: to.address, amountUsdc: amount, walletKind, requestId: crypto.randomUUID() });
        moneySounds.outcome('success', { ids: [r.txHash] });
        setConfirmed({ amount, to: to.label, network: 'arc', txHash: r.txHash, reference: r.reference, at: Date.now() });
        return;
      }
      const r = await api.bridgeOut({
        bridgeId: `cashout-${info.jobId.slice(2, 10)}-${Date.now().toString(36)}`,
        address: info.sellerAddress,
        destChainKey: dest as BridgeChainKey,
        amountUsdc: amount,
        recipient: to.address,
        sourceKind: walletKind,
        ...(walletKind === 'sellerAgent' ? { sourceJobId: info.jobId } : {}),
      });
      setSent({ amount, to: to.label, network: dest, txHash: null, reference: r.reference, at: Date.now() });
      setMoving({ kind: 'bridge', bridgeId: r.bridgeId, reference: r.reference });
    } catch (err) {
      setMoving(null);
      setError(err instanceof ApiError && err.detail ? String(err.detail) : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  if (confirmed) return <Receipt sent={confirmed} jobId={jobId} chainName={chainName(confirmed.network)} />;

  if (moving && sent) {
    return (
      <MovingSteps
        moving={moving}
        sent={sent}
        chainName={chainName(sent.network)}
        records={bridges.bridges}
        onRecheck={(id) => void bridges.recheck(id)}
        onDone={(txHash) => setConfirmed({ ...sent, txHash: txHash ?? sent.txHash })}
        onAgain={() => {
          setMoving(null);
          setSent(null);
        }}
      />
    );
  }

  return (
    <section className="mt-6">
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{copy.earnings}</p>
      <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--lp-dark)]">
        {formatAmount(available, locale)}
        <span className="ms-2 text-[20px] font-medium tracking-normal text-[var(--lp-text-sub)]">USDC</span>
      </p>
      {ownWallet ? <p className="mt-3 text-[15px] text-[var(--lp-text-sub)]">{copy.inWallet}</p> : null}
      {available <= 0 ? (
        <p className="mt-6 text-[15px] text-[var(--lp-dark)]">{copy.nothingLeft}</p>
      ) : (
        <>
          <p className="mt-8 text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.sendTo}</p>
          <div role="radiogroup" aria-label={copy.sendTo} className="mt-2 space-y-2">
            {canMoveToBalance ? (
              <Option icon="balance" title={copy.optBalance} sub={copy.optBalanceSub} selected={option === 'balance'} onSelect={() => setOption('balance')} />
            ) : null}
            <Option icon="wallet" title={copy.optWallet} sub={copy.optWalletSub} selected={option === 'wallet'} onSelect={() => setOption('wallet')} />
            <Option icon="bank" title={copy.optBank} sub={copy.optBankSub} soon={copy.soon} />
          </div>

          {option === 'wallet' ? (
            <div className="mt-6 space-y-5">
              <div>
                <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.network}</p>
                <div role="radiogroup" aria-label={copy.network} className="mt-2 flex flex-wrap gap-2">
                  {(['arc', ...OUT_KEYS] as Network[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={network === n}
                      onClick={() => setNetwork(n)}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                        network === n ? 'border-[var(--lp-accent)] text-[var(--lp-dark)] shadow-[inset_0_0_0_1px_var(--lp-accent)]' : 'border-[var(--lp-border-light)] text-[var(--lp-text-sub)]',
                      )}
                    >
                      <ChainLogo chain={n} size={20} />
                      {chainName(n)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{network === 'arc' ? copy.addressArc : copy.address}</span>
                <input
                  value={recipientText}
                  onChange={(e) => {
                    setRecipientText(e.target.value);
                    setTagMissing(false);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  className={FIELD}
                />
                {recipient.kind === 'invalid' ? (
                  <span role="status" className="mt-1.5 block text-[14px] text-[var(--color-critical)]">{fill(copy.invalidAddress, { chain: chainName(network) })}</span>
                ) : tagMissing ? (
                  <span role="status" className="mt-1.5 block text-[14px] text-[var(--color-critical)]">{copy.noTag}</span>
                ) : null}
              </label>
            </div>
          ) : null}

          <label className="mt-5 block">
            <span className="flex items-center justify-between text-[14px] font-medium text-[var(--lp-text-sub)]">
              {copy.amount}
              <button type="button" onClick={() => setAmountText(String(available))} className="min-h-9 px-1 font-semibold text-[var(--lp-dark)] underline underline-offset-4">
                {fill(copy.max, { amount: formatAmount(available, locale) })}
              </button>
            </span>
            <input value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="decimal" dir="ltr" className={cn(FIELD, 'tabular-nums')} />
            {amountText && Number(amountText) > available + 1e-9 ? (
              <span role="status" className="mt-1.5 block text-[14px] text-[var(--color-critical)]">{fill(copy.overBalance, { amount: formatAmount(available, locale) })}</span>
            ) : null}
          </label>

          {error ? <p role="alert" className="mt-4 text-[14px] text-[var(--color-critical)]">{error}</p> : null}
          <button type="button" onClick={() => void submit()} disabled={!ready} className={cn(PRIMARY, 'mt-8')}>
            {ownWallet && !account.address
              ? copy.connect
              : toBalance
                ? fill(copy.moveCta, { amount: formatAmount(amountOk ? amount : available, locale) })
                : network === 'arc'
                  ? fill(copy.sendCta, { amount: formatAmount(amountOk ? amount : available, locale) })
                  : fill(copy.sendChainCta, { amount: formatAmount(amountOk ? amount : available, locale), chain: chainName(network) })}
          </button>
          <p className="mt-3 text-center text-[14px] font-medium text-[var(--lp-text-sub)]">
            {toBalance || network === 'arc' ? copy.landsSeconds : copy.landsMinute}
          </p>
        </>
      )}
    </section>
  );
}

/// The live steps of a withdrawal to another chain, or of a wallet account's
/// own send, until the person presses Done.
function MovingSteps({ moving, sent, chainName, records, onRecheck, onDone, onAgain }: {
  moving: Moving;
  sent: Sent;
  chainName: string;
  records: BridgeRecord[];
  onRecheck: (id: string) => void;
  onDone: (txHash: string | null) => void;
  onAgain: () => void;
}) {
  const [status, setStatus] = useState<{ status: string; movementState?: string; burnTxHash?: string | null; mintTxHash?: string | null } | null>(null);
  useEffect(() => {
    if (moving.kind !== 'bridge') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const r = await api.bridgeStatus(moving.bridgeId).catch(() => null);
      if (!alive) return;
      if (r) setStatus(r as typeof status);
      const step = r ? stepForBridgeStatus(r) : 'leaving';
      if (step !== 'arrived' && step !== 'failed') timer = setTimeout(tick, 4000);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [moving]);

  const record = moving.kind === 'wallet' ? records.find((b) => b.direction === 'out' && b.startedAt >= moving.since) ?? null : null;
  const step: TransferStep | 'failed' =
    moving.kind === 'bridge' ? (status ? stepForBridgeStatus(status) : 'leaving') : record ? stepForPhase(record.phase) : 'signed';
  const leftSource = moving.kind === 'bridge' ? !!status?.burnTxHash : !!(record?.burnTxHash || record?.mintTxHash);
  const arcOnly = sent.network === 'arc';

  return (
    <section className="mt-6 space-y-6">
      <TransferProgress
        direction="out"
        chainName={chainName}
        signer={moving.kind === 'wallet' ? 'wallet' : 'account'}
        step={step}
        leftSource={leftSource}
        startedAt={sent.at}
        speed={arcOnly ? 'seconds' : routeSpeed('cctpOut')}
        notifies={false}
        payee={sent.to}
        onCheckAgain={() => record && onRecheck(record.id)}
        onTryAgain={onAgain}
        onAnother={onAgain}
        onDone={() => onDone(record?.mintTxHash ?? record?.burnTxHash ?? status?.burnTxHash ?? null)}
      />
    </section>
  );
}

function Receipt({ sent, jobId, chainName }: { sent: Sent; jobId: string; chainName: string }) {
  const copy = useTranslations().cashoutFlow;
  const receipt = useTranslations().activity.myMoney;
  const { locale } = useLocale();
  const date = new Date(sent.at).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const amount = `${formatAmount(sent.amount, locale)} USDC`;
  const sentence = fill(copy.sentence, { amount: formatAmount(sent.amount, locale), to: sent.to });
  const verify = sent.network === 'arc' && sent.txHash ? ARC_CCTP.explorerTx(sent.txHash) : null;
  return (
    <section className="mt-6 space-y-6">
      <ReceiptCard
        status={{ label: copy.sentBadge, tone: 'done' }}
        kind={copy.receiptKind}
        amount={amount}
        sentence={sentence}
        rows={[
          { label: copy.rowTo, value: sent.to },
          { label: copy.rowNetwork, value: chainName },
          { label: copy.rowDate, value: date },
          ...(sent.reference ? [{ label: copy.rowRef, value: sent.reference, mono: true }] : []),
        ]}
        verify={verify ? { href: verify, title: receipt.receiptVerifyTitle, body: receipt.receiptVerifyBody, qrLabel: receipt.receiptProof } : undefined}
        footnote={ARC_NETWORK === 'testnet' ? receipt.receiptTestnet : undefined}
      />
      <button
        type="button"
        onClick={() =>
          downloadReceiptImage(
            {
              title: copy.receiptKind,
              summary: sentence,
              reference: sent.reference,
              amount,
              status: copy.sentBadge,
              date,
              referenceLabel: copy.rowRef,
              referenceNone: '',
              historicalNote: '',
              sharedNote: receipt.receiptSharedNote,
              done: true,
              dateLabel: copy.rowDate,
              network: chainName,
              networkLabel: copy.rowNetwork,
              ...(verify ? { verifyTitle: receipt.receiptVerifyTitle, verifyUrl: verify } : {}),
              footnote: ARC_NETWORK === 'testnet' ? receipt.receiptTestnet : undefined,
            },
            `karwan-cashout-${jobId.slice(2, 10)}.png`,
          )
        }
        className={SECONDARY}
      >
        {copy.saveReceipt}
      </button>
    </section>
  );
}

const ICON: Record<'balance' | 'wallet' | 'bank', string> = {
  balance: 'M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2',
  wallet: 'M7 7h12l-3-3M17 17H5l3 3',
  bank: 'M3 9l9-5 9 5M5 9v9M19 9v9M9 9v9M15 9v9M3 20h18',
};

function Option({ icon, title, sub, selected, onSelect, soon }: {
  icon: keyof typeof ICON;
  title: string;
  sub: string;
  selected?: boolean;
  onSelect?: () => void;
  soon?: string;
}) {
  const body = (
    <>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0"><path d={ICON[icon]} /></svg>
      <span className="min-w-0 flex-1 text-start">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[14px] font-medium text-[var(--lp-text-sub)]">{sub}</span>
      </span>
      {soon ? <span className="shrink-0 rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[13px] font-medium text-[var(--lp-text-sub)]">{soon}</span> : null}
    </>
  );
  if (soon) return <div aria-disabled className="flex min-h-16 items-center gap-3 rounded-[16px] border border-[var(--lp-border-light)] px-4 py-3 text-[var(--lp-text-sub)]">{body}</div>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-[16px] border px-4 py-3 text-[var(--lp-dark)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
        selected ? 'border-[var(--lp-accent)] shadow-[inset_0_0_0_1px_var(--lp-accent)]' : 'border-[var(--lp-border-light)] hover:border-[var(--lp-outline-strong)]',
      )}
    >
      {body}
    </button>
  );
}
