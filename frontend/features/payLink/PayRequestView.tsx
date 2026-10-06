'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useAccount, useChainId, useReadContract, useReadContracts, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { api, type DepositRequestPublic, type Reputation, type SealedReputation } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { moneySounds } from '@/shared/sound/moneySounds';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { cn } from '@/shared/utils/cn';
import { fill } from '@/features/deals/workspace/presentation';
import { formatAmount } from '@/features/money/balanceModel';
import { ARC_CCTP, SOURCE_CHAINS, SOURCE_CHAIN_KEYS, type CctpChainKey } from '@/features/bridge/config';
import { useBridges, type BridgeRecord } from '@/features/bridge/hooks/useBridge';
import { routeSpeed, stepForPhase, walletSources } from '@/features/bridge/routePlan';
import { TransferProgress } from '@/features/bridge/components/TransferProgress';
import { requestViewState } from '@/features/deposit/requestViewState';
import { isSealedReputation } from '@/features/reputation/sealed';
import { TIER_LABEL } from '@/features/reputation/tierColors';
import { ShareLink } from './ShareLink';
import { FundToPay } from './FundToPay';
import { AnyChainPay } from './AnyChainPay';
import { afterPaid } from './chainPayState';
import { SourcePicker } from './SourcePicker';
import { sourceRows } from './sourceRows';
import { ReceiptCard } from '@/features/receipt/ReceiptCard';
import { downloadReceiptImage } from '@/features/activity/receiptPresentation';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { LoginModal } from '@/shared/components/LoginModal';
import { BackButton } from '@/shared/components/BackButton';

type Source = 'arc' | CctpChainKey;
/// How the payer pays: their Karwan balance, a connected wallet, or an address for any chain.
type Method = 'account' | 'wallet' | 'chain';
const ZERO = '0x0000000000000000000000000000000000000000';
const PRIMARY =
  'flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--lp-accent)] px-5 text-[16px] font-bold text-[#10170b] transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]';

/// The page a payment link opens. It pays this one request: who asks, how
/// much, for what, from where, and one button. While the money moves it shows
/// each step live; when it lands on Arc the server checks the transfer on chain
/// and the request reads Paid for both sides.
export function PayRequestView({ token }: { token: string }) {
  const copy = useTranslations().payLink.pay;
  const { address } = useAuth();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['deposit-request', token],
    queryFn: () => api.getDepositRequest(token),
    enabled: !!token,
    staleTime: 15_000,
  });
  const request = data?.request ?? null;
  const view = requestViewState({ isPending, isError, hasRequest: request !== null });

  return (
    <main className="product-surface min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-[480px] px-4 pb-16 pt-8 sm:px-6">
        {view === 'loading' ? <div aria-busy className="h-[480px] rounded-[24px] bg-[var(--lp-card)] motion-safe:animate-pulse" /> : null}
        {view === 'unavailable' ? (
          <section>
            <h1 className="text-[24px] font-semibold text-[var(--lp-dark)]">{copy.unavailableTitle}</h1>
            <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{copy.unavailableBody}</p>
          </section>
        ) : null}
        {view === 'ready' && request ? (
          address?.toLowerCase() === request.recipientAddress.toLowerCase() ? (
            <OwnRequest request={request} />
          ) : (
            <PayRequest token={token} request={request} onPaid={() => void refetch()} />
          )
        ) : null}
      </div>
    </main>
  );
}

function useRequester(recipient: string) {
  const profile = useQuery({ queryKey: ['profile', recipient], queryFn: () => api.getProfile(recipient), staleTime: 60_000 });
  const reputation = useQuery({ queryKey: ['reputation', recipient], queryFn: () => api.reputation(recipient), staleTime: 60_000 });
  const p = profile.data?.profile;
  const name = p?.handle ? `@${p.handle}` : p?.displayName?.trim() || `${recipient.slice(0, 6)}…${recipient.slice(-4)}`;
  return { profile: p, name, reputation: reputation.data };
}

function Requester({ recipient }: { recipient: string }) {
  const t = useTranslations();
  const copy = t.payLink.pay;
  const { profile, name, reputation } = useRequester(recipient);
  const [failed, setFailed] = useState(false);
  const photo = profile?.profileImageDataUrl || profile?.xProfileImageUrl;
  const sealed: SealedReputation | null = reputation && isSealedReputation(reputation) ? reputation : null;
  const open: Reputation | null = reputation && !isSealedReputation(reputation) ? reputation : null;
  const settled = open?.successCount ?? 0;
  const recordLine = sealed
    ? sealed.tier === 'NEW' ? copy.recordNew : `${t.sealedRecord.tier} ${TIER_LABEL[sealed.tier]}`
    : settled > 0 && open?.tier ? fill(copy.record, { tier: open.tier, n: settled }) : copy.recordNew;
  return (
    <div className="flex items-center gap-3">
      {photo && !failed ? (
        <img src={photo} alt="" width={48} height={48} className="size-12 rounded-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <WalletAvatar address={recipient} size={48} />
      )}
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold text-[var(--lp-dark)]">{profile?.displayName?.trim() || name}</p>
        <p className="truncate text-[14px] text-[var(--lp-text-sub)] font-medium">
          {[profile?.handle ? `@${profile.handle}` : null, recordLine]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  );
}

function Amount({ value }: { value: string | null }) {
  return (
    <p className="text-[56px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--lp-dark)]">
      {value ?? '0'}
      <span className="ms-2 text-[20px] font-medium tracking-normal text-[var(--lp-text-sub)]">USDC</span>
    </p>
  );
}

function OwnRequest({ request }: { request: DepositRequestPublic }) {
  const copy = useTranslations().payLink.pay;
  const url = typeof window !== 'undefined' ? window.location.href : '';
  return (
    <section className="space-y-6">
      <BackButton tone="adaptive" showOnPublic fallbackHref="/request" />
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{copy.tag}</p>
      <Amount value={request.amountUsdc} />
      {request.purpose ? <p className="text-[15px] text-[var(--lp-dark)]">{fill(copy.forTemplate, { purpose: request.purpose })}</p> : null}
      <p className="text-[15px] text-[var(--lp-text-sub)]">{request.status === 'matched' ? copy.paidAlready : request.status === 'expired' ? copy.expired : request.status === 'cancelled' ? copy.cancelled : copy.yours}</p>
      {request.status === 'open' ? <ShareLink url={url} /> : null}
    </section>
  );
}

function PayRequest({ token, request, onPaid }: { token: string; request: DepositRequestPublic; onPaid: () => void }) {
  const messages = useTranslations();
  const copy = messages.payLink.pay;
  const activity = messages.activity;
  const { locale } = useLocale();
  const router = useRouter();
  const auth = useAuth();
  // Signed in with email or passkey: pay from the Karwan account on Arc.
  const viaAccount = auth.method === 'circle' && !!auth.address;
  const [signingIn, setSigningIn] = useState(false);
  const [method, setMethod] = useState<Method>(viaAccount ? 'account' : 'wallet');
  const next = afterPaid(auth.isAuthenticated);
  const finish = () => (next.kind === 'home' ? router.push(next.href) : setSigningIn(true));
  const account = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { bridges, startAppKitBridge, startWeb3ArcSend, startArcSend, recheck } = useBridges();
  const { name } = useRequester(request.recipientAddress);
  const recipient = request.recipientAddress as `0x${string}`;
  const amount = Number(request.amountUsdc ?? 0);
  const owner = viaAccount ? (auth.address as `0x${string}`) : account.address;

  const arcRead = useReadContract({
    address: ARC_CCTP.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner ?? ZERO],
    chainId: ARC_CCTP.chainId,
    // An account waiting on its own top-up also polls, in case a live event is missed.
    query: { enabled: !!owner, refetchInterval: viaAccount ? 10_000 : false },
  });
  const reads = useReadContracts({
    contracts: SOURCE_CHAIN_KEYS.map((key) => ({
      address: SOURCE_CHAINS[key].usdc,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner ?? ZERO] as const,
      chainId: SOURCE_CHAINS[key].chainId,
    })),
    allowFailure: true,
    query: { enabled: !!owner && !viaAccount },
  });
  const funded = walletSources(SOURCE_CHAIN_KEYS, reads.data ?? []);
  const [source, setSource] = useState<Source>('arc');
  const arcBalance = typeof arcRead.data === 'bigint' ? Number(arcRead.data) / 1_000_000 : null;
  const balance = source === 'arc' ? arcBalance : funded.find((s) => s.key === source)?.amount ?? (owner ? 0 : null);
  const chainName = (key: Source) => (key === 'arc' ? copy.arc : SOURCE_CHAINS[key].name);
  const short = balance !== null && balance < amount;
  const refetchArc = arcRead.refetch;
  const refetchBalance = useCallback(() => void refetchArc(), [refetchArc]);

  // The transfer this page started, followed from the click.
  const [followFrom, setFollowFrom] = useState<number | null>(null);
  const [paidSource, setPaidSource] = useState<Source>('arc');
  const [declined, setDeclined] = useState(false);
  const record: BridgeRecord | null =
    followFrom === null
      ? null
      : bridges.find((b) => b.startedAt >= followFrom && b.mintRecipient?.toLowerCase() === recipient.toLowerCase()) ?? null;
  const arcHash = record?.mintTxHash ?? null;
  const [paid, setPaid] = useState<DepositRequestPublic | null>(request.status === 'matched' ? request : null);
  /// Confirmed while the payer is still on the steps. The receipt opens when they press Done.
  const [confirmed, setConfirmed] = useState<DepositRequestPublic | null>(null);

  useEffect(() => {
    if (record) moneySounds.claim({ ids: [record.id, record.burnTxHash, record.mintTxHash] });
  }, [record]);

  // Once the money is on Arc, ask the server to check the transfer and mark the
  // request paid. A receipt not yet visible to the server is asked again.
  const confirming = useRef(false);
  useEffect(() => {
    if (!arcHash || paid || confirmed || confirming.current) return;
    confirming.current = true;
    let stop = false;
    void (async () => {
      for (let attempt = 0; attempt < 30 && !stop; attempt += 1) {
        try {
          const result = await api.confirmRequestPaid(token, arcHash, chainName(paidSource));
          if (result.request.status === 'matched') {
            setConfirmed(result.request);
            moneySounds.outcome('success', { ids: [arcHash] });
            onPaid();
            return;
          }
        } catch {
          // A refusal is final; the transfer still shows on the steps above.
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
      }
    })();
    return () => {
      stop = true;
      confirming.current = false;
    };
  }, [arcHash, paid, token]);

  async function pay() {
    if (viaAccount && auth.address) {
      if (short || amount <= 0) return;
      setDeclined(false);
      setFollowFrom(Date.now());
      setPaidSource('arc');
      moneySounds.submit();
      void startArcSend({ amountUsdc: amount, recipient, userAddress: auth.address });
      return;
    }
    if (!owner || !account.connector) {
      openConnectModal?.();
      return;
    }
    if (short || amount <= 0) return;
    const since = Date.now();
    setDeclined(false);
    setFollowFrom(since);
    setPaidSource(source);
    moneySounds.submit();
    if (source === 'arc') {
      void startWeb3ArcSend({ amountUsdc: amount, recipient, userAddress: owner });
      return;
    }
    try {
      if (chainId !== SOURCE_CHAINS[source].chainId) await switchChainAsync({ chainId: SOURCE_CHAINS[source].chainId });
    } catch {
      setFollowFrom(null);
      setDeclined(true);
      return;
    }
    const connector = account.connector;
    void startAppKitBridge({ sourceChainKey: source, amountUsdc: amount, mintRecipient: recipient, getEvmProvider: () => connector.getProvider() });
  }

  // Paid some other way while this page was open. A payment from another chain
  // stays on its own steps until it reaches the requester.
  useEffect(() => {
    if (request.status === 'matched' && !paid && method !== 'chain' && followFrom === null) setPaid(request);
  }, [request, paid, method, followFrom]);

  if (paid) {
    const receipt = activity.myMoney;
    const paidDate = paid.paidAt
      ? new Date(paid.paidAt).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const saveReceipt = () =>
      downloadReceiptImage(
        {
          title: copy.receiptKind,
          summary: `${fill(copy.paid, { amount: request.amountUsdc ?? '' })} ${fill(copy.paidTo, { name })}`,
          reference: null,
          amount: request.amountUsdc ? `${request.amountUsdc} USDC` : null,
          status: copy.paidBadge,
          date: paidDate,
          ...(arcHash ? { transaction: { label: copy.receiptRef, value: `${arcHash.slice(0, 8)}…${arcHash.slice(-4)}` } } : {}),
          referenceLabel: request.purpose ? copy.receiptFor : receipt.receiptReference,
          referenceNone: request.purpose || receipt.receiptReferenceNone,
          historicalNote: '',
          sharedNote: receipt.receiptSharedNote,
          done: true,
          dateLabel: copy.receiptDate,
          ...(paid.paidChain ? { network: paid.paidChain, networkLabel: copy.receiptFrom } : {}),
          ...(arcHash ? { verifyTitle: receipt.receiptVerifyTitle, verifyUrl: ARC_CCTP.explorerTx(arcHash) } : {}),
          footnote: ARC_NETWORK === 'testnet' ? receipt.receiptTestnet : undefined,
        },
        `karwan-receipt-${token.slice(0, 8)}.png`,
      );
    return (
      <section className="space-y-6 pt-2">
        <ReceiptCard
          status={{ label: copy.paidBadge, tone: 'done' }}
          kind={copy.receiptKind}
          amount={request.amountUsdc ? `${request.amountUsdc} USDC` : null}
          sentence={`${fill(copy.paid, { amount: request.amountUsdc ?? '' })} ${fill(copy.paidTo, { name })}`}
          rows={[
            { label: copy.receiptTo, value: name },
            ...(request.purpose ? [{ label: copy.receiptFor, value: request.purpose }] : []),
            ...(paid.paidChain ? [{ label: copy.receiptFrom, value: paid.paidChain }] : []),
            ...(paid.paidAt ? [{ label: copy.receiptDate, value: new Date(paid.paidAt).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }] : []),
            ...(arcHash ? [{ label: copy.receiptRef, value: `${arcHash.slice(0, 8)}…${arcHash.slice(-4)}`, mono: true }] : []),
          ]}
          verify={arcHash ? { href: ARC_CCTP.explorerTx(arcHash), title: receipt.receiptVerifyTitle, body: receipt.receiptVerifyBody, qrLabel: receipt.receiptProof } : undefined}
          footnote={ARC_NETWORK === 'testnet' ? receipt.receiptTestnet : undefined}
        />
        <p className="text-center text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.bothSee}</p>
        {next.kind === 'join' ? (
          <div className="border-t border-[var(--lp-border-light)] pt-5">
            <p className="text-[16px] font-semibold text-[var(--lp-dark)]">{copy.joinTitle}</p>
            <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.joinBody}</p>
          </div>
        ) : null}
        <button type="button" onClick={finish} className={PRIMARY}>{next.kind === 'home' ? copy.goHome : copy.joinCta}</button>
        <button
          type="button"
          onClick={saveReceipt}
          className="flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {copy.saveReceipt}
        </button>
        <LoginModal open={signingIn} onClose={() => setSigningIn(false)} postAuthHref={`/deposit/request/${token}`} />
      </section>
    );
  }

  if (request.status !== 'open' && request.status !== 'matched') {
    return (
      <section className="space-y-4">
        <Requester recipient={request.recipientAddress} />
        <Amount value={request.amountUsdc} />
        <p className="text-[15px] text-[var(--lp-text-sub)]">{request.status === 'expired' ? copy.expired : copy.cancelled}</p>
      </section>
    );
  }

  if (followFrom !== null) {
    return (
      <section className="space-y-6">
        <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{fill(copy.paying, { name })}</p>
        <Amount value={request.amountUsdc} />
        <TransferProgress
          direction="in"
          chainName={chainName(paidSource)}
          signer={viaAccount ? 'account' : 'wallet'}
          step={record ? stepForPhase(record.phase) : 'signed'}
          leftSource={!!(record?.burnTxHash || record?.mintTxHash)}
          startedAt={record?.startedAt ?? followFrom}
          speed={paidSource === 'arc' ? 'seconds' : routeSpeed('cctpIn')}
          notifies={false}
          payee={name}
          onCheckAgain={() => record && void recheck(record.id)}
          onTryAgain={() => setFollowFrom(null)}
          onAnother={() => setFollowFrom(null)}
          onDone={() => (confirmed ? setPaid(confirmed) : finish())}
        />
      </section>
    );
  }

  return (
    <section>
      <p className="text-[14px] font-semibold text-[var(--lp-text-sub)]">{copy.tag}</p>
      <div className="mt-5">
        <Requester recipient={request.recipientAddress} />
      </div>
      <div className="mt-7">
        <Amount value={request.amountUsdc} />
      </div>
      {request.purpose ? <p className="mt-3 text-[15px] text-[var(--lp-dark)]">{fill(copy.forTemplate, { purpose: request.purpose })}</p> : null}

      <p className="mt-8 text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.payWith}</p>
      <div role="radiogroup" aria-label={copy.payWith} className="mt-2 space-y-2">
        {viaAccount ? (
          <PayOption
            icon="balance"
            selected={method === 'account'}
            onSelect={() => setMethod('account')}
            title={copy.optBalance}
            sub={arcBalance !== null ? fill(copy.accountBalance, { amount: formatAmount(arcBalance, locale) }) : undefined}
          />
        ) : (
          <PayOption icon="wallet" selected={method === 'wallet'} onSelect={() => setMethod('wallet')} title={copy.optWallet} sub={copy.optWalletSub} />
        )}
        {request.anyChain ? (
          <PayOption icon="chain" selected={method === 'chain'} onSelect={() => setMethod('chain')} title={copy.optChain} sub={copy.optChainSub} />
        ) : null}
        <PayOption icon="card" soon={copy.soon} title={copy.optCard} sub={copy.optCardSub} />
        <PayOption icon="phone" soon={copy.soon} title={copy.optUssd} sub={copy.optUssdSub} />
      </div>

      {method === 'chain' ? (
        <AnyChainPay token={token} request={request} name={name} onDelivered={(r) => setPaid(r)} />
      ) : (
      <>
      {method === 'wallet' ? (
      <>
      <p className="mt-6 text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.payFrom}</p>
      <SourcePicker
        {...sourceRows({
          connected: !!owner,
          arc: arcBalance,
          chains: [...SOURCE_CHAIN_KEYS],
          amounts: Object.fromEntries(funded.map((f) => [f.key, f.amount])) as Partial<Record<CctpChainKey, number>>,
        })}
        selected={source}
        onSelect={setSource}
        nameOf={chainName}
        connected={!!owner}
      />
      {owner && balance !== null ? (
        <p className={cn('mt-3 text-[14px]', short ? 'text-[var(--color-critical)]' : 'text-[var(--lp-text-sub)]')}>
          {short ? fill(copy.notEnough, { chain: chainName(source) }) : fill(copy.walletOn, { chain: chainName(source), amount: formatAmount(balance, locale) })}
        </p>
      ) : null}
      </>
      ) : null}
      {viaAccount && auth.address && short && arcBalance !== null && !request.anyChain ? (
        <FundToPay
          owner={auth.address}
          shortfall={formatAmount(Math.ceil((amount - arcBalance) * 100) / 100, locale)}
          name={name}
          onLanded={refetchBalance}
        />
      ) : null}
      {declined ? <p role="status" className="mt-3 text-[14px] text-[var(--lp-text-sub)] font-medium">{copy.connect}</p> : null}

      <button type="button" onClick={() => void pay()} disabled={!!owner && (short || amount <= 0)} className={cn(PRIMARY, 'mt-10')}>
        {owner ? fill(copy.payCta, { amount: request.amountUsdc ?? '' }) : copy.connect}
      </button>
      {!owner && !auth.isAuthenticated ? (
        <button
          type="button"
          onClick={() => setSigningIn(true)}
          className="mx-auto mt-2 flex min-h-11 items-center px-3 text-[14px] text-[var(--lp-text-sub)] underline-offset-4 hover:text-[var(--lp-dark)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] font-medium"
        >
          {copy.useEmail}
        </button>
      ) : null}
      </>
      )}
      <LoginModal open={signingIn} onClose={() => setSigningIn(false)} postAuthHref={null} />
      {method !== 'chain' ? (
      <p className="mt-3 text-center text-[14px] text-[var(--lp-text-sub)] font-medium">
        {[source === 'arc' ? copy.arrivesArc : copy.arrivesOther, fill(copy.expires, { date: new Date(request.expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })].join(' · ')}
      </p>
      ) : null}
    </section>
  );
}

const OPTION_ICON: Record<'balance' | 'wallet' | 'chain' | 'card' | 'phone', string> = {
  balance: 'M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M17 13h1',
  chain: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
};

/// One way to pay. Rails that are not live yet show and say so, and do nothing.
function PayOption({ icon, title, sub, selected, onSelect, soon }: {
  icon: keyof typeof OPTION_ICON;
  title: string;
  sub?: string;
  selected?: boolean;
  onSelect?: () => void;
  soon?: string;
}) {
  const body = (
    <>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0"><path d={OPTION_ICON[icon]} /></svg>
      <span className="min-w-0 flex-1 text-start">
        <span className="block text-[15px] font-semibold">{title}</span>
        {sub ? <span className="mt-0.5 block text-[14px] font-medium text-[var(--lp-text-sub)]">{sub}</span> : null}
      </span>
      {soon ? <span className="shrink-0 rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[13px] font-medium text-[var(--lp-text-sub)]">{soon}</span> : null}
    </>
  );
  if (soon) {
    return <div aria-disabled className="flex min-h-16 items-center gap-3 rounded-[16px] border border-[var(--lp-border-light)] px-4 py-3 text-[var(--lp-text-sub)]">{body}</div>;
  }
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
