'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { api, ApiError, type BridgeChainKey, type AppKitBridgeChainKey } from '@/core/api';
import { useBridges } from '@/features/bridge/hooks/useBridge';
import { BridgeActivityStrip } from '@/features/bridge/components/BridgeActivityStrip';
import { useHiddenActivityBridgeIds } from '@/features/bridge/components/BridgeCard';
import type { CctpChainKey } from '@/features/bridge/config';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { formatUsdc, shortAddress, shortHash } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type DestKey = 'arc' | AppKitBridgeChainKey;
type WalletKind = 'identity' | 'sellerAgent' | 'buyerAgent';
type CashoutCopy = Messages['cashoutPage'];

const DESTINATIONS: { key: DestKey; name: string; short: string }[] = [
  { key: 'arc', name: 'Arc Testnet', short: 'Arc' },
  { key: 'sepolia', name: 'Ethereum Sepolia', short: 'Ethereum' },
  { key: 'baseSepolia', name: 'Base Sepolia', short: 'Base' },
  { key: 'arbitrumSepolia', name: 'Arbitrum Sepolia', short: 'Arbitrum' },
  { key: 'optimismSepolia', name: 'OP Sepolia', short: 'Optimism' },
  { key: 'polygonAmoy', name: 'Polygon Amoy', short: 'Polygon' },
  { key: 'solanaDevnet', name: 'Solana Devnet', short: 'Solana' },
];

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidForChain(addr: string, chain: DestKey): boolean {
  const v = addr.trim();
  if (!v) return false;
  if (chain === 'solanaDevnet') return SOL_RE.test(v);
  return EVM_RE.test(v);
}

interface WalletSlice {
  address: string | null;
  arcBalanceUsdc: string | null;
  available: boolean;
}

interface CashoutInfo {
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

export default function CashoutPage() {
  const cp = useTranslations().cashoutPage;
  return (
    <AuthGuard
      gateTag={cp.signInGate.tag}
      gateTitle={
        <>
          {cp.signInGate.titleBefore} <Accent>USDC</Accent>
          <Punc>.</Punc>
        </>
      }
      gateBody={cp.signInGate.body}
      gateButtonLabel={cp.signInGate.buttonLabel}
    >
      <CashoutPageInner />
    </AuthGuard>
  );
}

function CashoutPageInner() {
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId ?? '';
  const auth = useAuth();
  const cp = useTranslations().cashoutPage;
  const [info, setInfo] = useState<CashoutInfo | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setFetchState('loading');
    api
      .cashoutInfo(jobId)
      .then((res) => {
        if (!alive) return;
        setInfo(res);
        setFetchState('ready');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : cp.errors.couldNotLoad);
        setFetchState('error');
      });
    return () => {
      alive = false;
    };
  }, [jobId, cp.errors.couldNotLoad]);

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[60ch] fade-up">
          <SectionTag tone="dark" dot="live">
            {cp.hero.tag}
          </SectionTag>
          <HeroHeadline size="lg">
            {cp.hero.titleBefore} <Accent>USDC</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-7 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[52ch]">
            {info
              ? cp.hero.earnedTemplate.replace('{amount}', formatUsdc(info.dealAmountUsdc))
              : cp.hero.loading}
          </p>
          <div className="mt-7 flex flex-wrap gap-2 mono text-[10px] uppercase tracking-[0.14em] text-white/55">
            <Link
              href={`/deals/${jobId}`}
              className="inline-flex items-center gap-1.5 hover:text-[var(--lp-accent)] transition-colors"
            >
              [:{cp.hero.backToDeal}:]
            </Link>
          </div>
        </div>
      </Band>

      <Band tone="light" compact>
        {fetchState === 'loading' && (
          <PageCard className="p-6 sm:p-8">
            <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {cp.loading.label}
            </p>
          </PageCard>
        )}
        {fetchState === 'error' && (
          <PageCard className="p-6 sm:p-8">
            <p className="text-[14px] text-[var(--lp-text-sub)]">
              {cp.errors.couldNotLoadDeal} {loadError ?? ''}
            </p>
          </PageCard>
        )}
        {fetchState === 'ready' && info && <CashoutContent info={info} jobId={jobId} copy={cp} />}
      </Band>

      <Band tone="light" compact>
        <SectionTag>{cp.comingSoon.tag}</SectionTag>
        <HeroHeadline size="md">
          {cp.comingSoon.titleBefore} <Accent>{cp.comingSoon.titleAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          {cp.comingSoon.body}
        </p>
        <div className="mt-7">
          <ComingSoonTile label={cp.comingSoon.tileLabel} comingSoonLabel={cp.comingSoon.comingSoon} />
        </div>
      </Band>
    </FullBleed>
  );
}

function CashoutContent({
  info,
  jobId,
  copy,
}: {
  info: CashoutInfo;
  jobId: string;
  copy: CashoutCopy;
}) {
  if (!info.settledAt) {
    return (
      <PageCard className="p-6 sm:p-8">
        <SectionTag>{copy.notReady.tag}</SectionTag>
        <HeroHeadline size="md">
          {copy.notReady.titleBefore} <Accent>{copy.notReady.titleAccent}</Accent> {copy.notReady.titleAfter}
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          {copy.notReady.body}
        </p>
        <div className="mt-7">
          <Link href={`/deals/${jobId}`}>
            <CTAPill variant="secondary" tone="light">
              {copy.notReady.cta}
            </CTAPill>
          </Link>
        </div>
      </PageCard>
    );
  }

  if (info.legacyEscrow) {
    return (
      <PageCard className="p-6 sm:p-8">
        <SectionTag>{copy.legacy.tag}</SectionTag>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          {copy.legacy.body}
        </p>
        <div className="mt-7">
          <Link href="/legacy">
            <CTAPill variant="secondary" tone="light">
              {copy.legacy.cta}
            </CTAPill>
          </Link>
        </div>
      </PageCard>
    );
  }

  return <WithdrawForm info={info} copy={copy} />;
}

function WithdrawForm({ info, copy }: { info: CashoutInfo; copy: CashoutCopy }) {
  const isWeb3Account = info.accountKind === 'wallet';
  const bridge = useBridges();
  const { address: connectedAddress, isConnected, connector } = useAccount();
  const { openConnectModal } = useConnectModal();
  const auth = useAuth();
  const hidden = useHiddenActivityBridgeIds(auth.address ?? null);

  // The wallet picker defaults to the deal wallet because that's where the
  // escrow released to. Sellers who already swept funds into identity, or who
  // want to sweep their buyer wallet, can flip the switch.
  const sellerAgentAvail = info.sellerAgentWallet.available;
  const buyerAgentAvail = info.buyerAgentWallet.available;
  // Identity is a custodial source for email accounts; for web3 accounts it's
  // the user's own connected wallet, which is always an option (they sign it).
  const identityAvail = isWeb3Account || info.identityWallet.available;
  const defaultWallet: WalletKind = sellerAgentAvail ? 'sellerAgent' : 'identity';
  const [walletKind, setWalletKind] = useState<WalletKind>(defaultWallet);

  // Web3 identity means the user's own EOA signs the withdraw, rather than a
  // custodial Karwan wallet. Every other combination is custodial.
  const isWeb3Identity = isWeb3Account && walletKind === 'identity';

  const activeWallet =
    walletKind === 'identity'
      ? info.identityWallet
      : walletKind === 'buyerAgent'
        ? info.buyerAgentWallet
        : info.sellerAgentWallet;
  const balanceNum = Number(activeWallet.arcBalanceUsdc ?? 0);
  const balance = Number.isFinite(balanceNum) ? balanceNum : 0;

  const [dest, setDest] = useState<DestKey>('arc');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ txHash: string; explorerUrl: string } | null>(null);
  const [bridgeResult, setBridgeResult] = useState<{ bridgeId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Web3 own-wallet out isn't wired for Solana yet (no wagmi Solana connector),
  // so a wallet user withdrawing from identity can't pick it.
  const destBlockedForWeb3Identity = isWeb3Identity && dest === 'solanaDevnet';

  const amountNum = useMemo(() => Number(amount), [amount]);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= balance;
  const recipientValid = isValidForChain(recipient, dest);
  const canSubmit = amountValid && recipientValid && !submitting && !destBlockedForWeb3Identity;

  // Web3 out records for the progress strip (own-wallet Arc sends + bridge-outs).
  const web3OutRecords = useMemo(
    () => bridge.bridges.filter((b) => b.direction === 'out'),
    [bridge.bridges],
  );

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);

    // Web3 identity: the user's own wallet signs. Route through the bridge
    // engine (self-signed Arc transfer, or Arc-burn bridge-out) and let the
    // activity strip show progress, rather than the custodial result cards.
    if (isWeb3Identity) {
      if (!isConnected || !connectedAddress) {
        openConnectModal?.();
        return;
      }
      const recip = recipient.trim() as `0x${string}`;
      if (dest === 'arc') {
        await bridge.startWeb3ArcSend({
          amountUsdc: amountNum,
          recipient: recip,
          userAddress: connectedAddress,
        });
      } else if (dest === 'solanaDevnet') {
        setError(copy.errors.solanaRoadmap);
        return;
      } else {
        await bridge.startWeb3Out({
          destChainKey: dest as CctpChainKey,
          amountUsdc: amountNum,
          recipient: recip,
          userAddress: connectedAddress,
          // The Arc burn now goes through App Kit so Circle's forwarder mints on
          // the destination; that needs the wallet's provider, not just a signer.
          getEvmProvider: () =>
            connector?.getProvider() ?? Promise.reject(new Error('Wallet provider unavailable')),
        });
      }
      setAmount('');
      setRecipient('');
      return;
    }

    // Custodial: Karwan signs from the identity, seller-agent, or buyer-agent
    // wallet.
    setResult(null);
    setBridgeResult(null);
    setSubmitting(true);
    try {
      if (dest === 'arc') {
        const r = await api.cashoutArc({
          jobId: info.jobId,
          recipient: recipient.trim(),
          amountUsdc: amountNum,
          walletKind,
          // One id per submission: a retry of this same click dedupes at
          // Circle instead of transferring twice.
          requestId: crypto.randomUUID(),
        });
        setResult({ txHash: r.txHash, explorerUrl: r.explorerUrl });
      } else if (dest === 'solanaDevnet') {
        setError(copy.errors.solanaRoadmap);
      } else {
        const bridgeId = `cashout-${info.jobId.slice(2, 10)}-${Date.now().toString(36)}`;
        const r = await api.bridgeOut({
          bridgeId,
          address: info.sellerAddress,
          destChainKey: dest as BridgeChainKey,
          amountUsdc: amountNum,
          recipient: recipient.trim(),
          sourceKind: walletKind,
          ...(walletKind === 'sellerAgent' ? { sourceJobId: info.jobId } : {}),
        });
        setBridgeResult({ bridgeId: r.bridgeId });
      }
    } catch (err) {
      const message =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : err instanceof Error
            ? err.message
            : copy.errors.withdrawFailed;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <PageCard className="p-6 sm:p-8">
        <SectionTag>{copy.sent.tag}</SectionTag>
        <HeroHeadline size="md">
          {amount} USDC <Accent>{copy.sent.titleAccent}</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          {copy.sent.body}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={result.explorerUrl} target="_blank" rel="noreferrer">
            <CTAPill variant="secondary" tone="light">
              {copy.sent.viewTx.replace('{hash}', shortHash(result.txHash))}
            </CTAPill>
          </a>
          <CTAPill
            variant="secondary"
            tone="light"
            onClick={() => {
              setResult(null);
              setAmount('');
              setRecipient('');
            }}
          >
            {copy.sent.sendMore}
          </CTAPill>
        </div>
      </PageCard>
    );
  }

  if (bridgeResult) {
    return (
      <BridgeProgressCard
        bridgeId={bridgeResult.bridgeId}
        amount={amount}
        destLabel={destLabel(dest)}
        onSendMore={() => {
          setBridgeResult(null);
          setAmount('');
          setRecipient('');
        }}
        copy={copy}
      />
    );
  }

  return (
    <PageCard className="p-6 sm:p-8">
      <SectionTag>{copy.withdraw.tag}</SectionTag>
      <HeroHeadline size="md">
        {copy.withdraw.titleBefore} <Accent>USDC</Accent>
        <Punc>.</Punc>
      </HeroHeadline>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        {copy.withdraw.body}
      </p>

      <div className="mt-7">
        <FieldLabel>
          {copy.withdraw.fromWalletLabel}{' '}
          <span
            className="normal-case text-[var(--lp-text-muted)] cursor-help"
            title={copy.withdraw.fromWalletTooltip}
          >
            ({copy.withdraw.whatIsThis})
          </span>
        </FieldLabel>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <WalletPickerTile
            kind="sellerAgent"
            active={walletKind === 'sellerAgent'}
            disabled={!sellerAgentAvail}
            address={info.sellerAgentWallet.address}
            balanceUsdc={info.sellerAgentWallet.arcBalanceUsdc}
            label={copy.withdraw.dealWalletLabel}
            sub={copy.withdraw.dealWalletSub}
            activeLabel={copy.withdraw.active}
            notProvisionedLabel={copy.withdraw.notProvisioned}
            onClick={() => setWalletKind('sellerAgent')}
          />
          <WalletPickerTile
            kind="buyerAgent"
            active={walletKind === 'buyerAgent'}
            disabled={!buyerAgentAvail}
            address={info.buyerAgentWallet.address}
            balanceUsdc={info.buyerAgentWallet.arcBalanceUsdc}
            label={copy.withdraw.buyerWalletLabel}
            sub={copy.withdraw.buyerWalletSub}
            activeLabel={copy.withdraw.active}
            notProvisionedLabel={copy.withdraw.notProvisioned}
            onClick={() => setWalletKind('buyerAgent')}
          />
          <WalletPickerTile
            kind="identity"
            active={walletKind === 'identity'}
            disabled={!identityAvail}
            address={info.identityWallet.address}
            balanceUsdc={
              // Web3 identity balance isn't a custodial read; the engine checks
              // the live wallet balance on submit. Show the backend read if any.
              info.identityWallet.arcBalanceUsdc
            }
            label={copy.withdraw.identityWalletLabel}
            sub={isWeb3Account ? copy.withdraw.identityWalletSubWeb3 : copy.withdraw.identityWalletSub}
            activeLabel={copy.withdraw.active}
            notProvisionedLabel={copy.withdraw.notProvisioned}
            onClick={() => setWalletKind('identity')}
          />
        </div>
        {isWeb3Identity && (
          <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {isConnected ? copy.withdraw.web3IdentitySigns : copy.withdraw.web3IdentityConnect}
          </p>
        )}
      </div>

      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat
          label={copy.withdraw.sourceBalance}
          value={
            activeWallet.arcBalanceUsdc
              ? formatUsdc(activeWallet.arcBalanceUsdc)
              : '—'
          }
        />
        <Stat label={copy.withdraw.fromDeal} value={formatUsdc(info.dealAmountUsdc)} />
      </div>

      <div className="mt-7">
        <FieldLabel>{copy.withdraw.destinationChain}</FieldLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESTINATIONS.map((d) => {
            const active = dest === d.key;
            // Own-wallet withdraws can't reach Solana yet (no wagmi connector).
            const disabled = isWeb3Identity && d.key === 'solanaDevnet';
            return (
              <button
                key={d.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setDest(d.key);
                  setRecipient('');
                  setError(null);
                }}
                className="mono text-[11px] uppercase tracking-[0.14em] px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: active ? 'var(--lp-band-dark)' : 'var(--lp-card)',
                  color: active ? '#ffffff' : 'var(--lp-dark)',
                  border: active
                    ? '1px solid var(--lp-band-dark)'
                    : '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 3,
                }}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <FieldLabel>
          {copy.withdraw.recipientAddress}{' '}
          <span className="text-[var(--lp-text-muted)] normal-case">
            ({dest === 'solanaDevnet' ? 'Solana' : 'EVM'})
          </span>
        </FieldLabel>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={dest === 'solanaDevnet' ? copy.withdraw.base58Placeholder : '0x…'}
          spellCheck={false}
          className="mt-2 w-full bg-[var(--lp-light)] px-4 py-2.5 text-[14px] mono focus:outline-none placeholder:text-[var(--lp-text-muted)] text-[var(--lp-dark)]"
          style={{
            border:
              recipient && !recipientValid
                ? '1px solid rgba(176,61,58,0.6)'
                : '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        />
        {recipient && !recipientValid && (
          <p className="mt-1.5 text-[12px] text-[#b03d3a]">
            {copy.withdraw.invalidAddress.replace(
              '{kind}',
              dest === 'solanaDevnet' ? 'Solana' : 'EVM',
            )}
          </p>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>{copy.withdraw.amountLabel}</FieldLabel>
          <button
            type="button"
            onClick={() => setAmount(balance.toString())}
            className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            {copy.withdraw.max}
          </button>
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
          className="mt-2 w-full bg-[var(--lp-light)] px-4 py-2.5 text-[14px] mono focus:outline-none placeholder:text-[var(--lp-text-muted)] text-[var(--lp-dark)]"
          style={{
            border:
              amount && !amountValid
                ? '1px solid rgba(176,61,58,0.6)'
                : '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        />
        {amount && Number(amount) > balance && (
          <p className="mt-1.5 text-[12px] text-[#b03d3a]">
            {copy.withdraw.overBalance.replace('{balance}', String(balance))}
          </p>
        )}
      </div>

      {error && (
        <div
          className="mt-5 px-3.5 py-2.5 text-[13px]"
          style={{
            background: 'rgba(176,61,58,0.10)',
            color: '#b03d3a',
            border: '1px solid rgba(176,61,58,0.35)',
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 3,
          }}
        >
          {error}
        </div>
      )}

      <div className="mt-7">
        <CTAPill onClick={onSubmit} disabled={!canSubmit}>
          {isWeb3Identity && !isConnected
            ? copy.withdraw.connectWallet
            : submitting
              ? dest === 'arc'
                ? copy.withdraw.sendingOnArc
                : copy.withdraw.bridgingOut
              : dest === 'arc'
                ? copy.withdraw.sendTo.replace('{chain}', destLabel(dest))
                : copy.withdraw.bridgeTo.replace('{chain}', destLabel(dest))}
        </CTAPill>
      </div>

      {/* Web3 own-wallet withdraws animate through the shared activity strip
          (self-signed, no custodial polling). Custodial paths render their own
          result/progress cards above instead. */}
      {isWeb3Account && web3OutRecords.length > 0 && (
        <div className="mt-6">
          <BridgeActivityStrip
            records={web3OutRecords}
            hidden={hidden}
            isActive={bridge.isActive}
          />
        </div>
      )}
    </PageCard>
  );
}

/// Maps backend bridge status to a user-facing label and progress percent.
/// Pipeline: burning -> burned -> attested -> minted.
function bridgeStageCopy(
  status: string,
  copy: CashoutCopy['bridgeStage'],
): { label: string; pct: number; done: boolean; failed: boolean } {
  switch (status) {
    case 'burning':
      return { label: copy.burning, pct: 25, done: false, failed: false };
    case 'burned':
      return { label: copy.burned, pct: 50, done: false, failed: false };
    case 'attested':
      return { label: copy.attested, pct: 75, done: false, failed: false };
    case 'minted':
      return { label: copy.minted, pct: 100, done: true, failed: false };
    case 'error':
      return { label: copy.errored, pct: 100, done: false, failed: true };
    default:
      return { label: status, pct: 10, done: false, failed: false };
  }
}

interface BridgeProgressCardProps {
  bridgeId: string;
  amount: string;
  destLabel: string;
  onSendMore: () => void;
  copy: CashoutCopy;
}

/// Inline bridge progress card. Polls every 4s, exposes the burn and mint
/// tx hashes as they land. Keeps the cashout flow on a single page.
function BridgeProgressCard({
  bridgeId,
  amount,
  destLabel,
  onSendMore,
  copy,
}: BridgeProgressCardProps) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.bridgeStatus>> | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const r = await api.bridgeStatus(bridgeId);
        if (!alive) return;
        setStatus(r);
        setPollError(null);
        if (r.status !== 'minted' && r.status !== 'error') {
          timer = setTimeout(tick, 4000);
        }
      } catch (err) {
        if (!alive) return;
        setPollError(err instanceof Error ? err.message : copy.bridgeProgress.couldNotCheck);
        timer = setTimeout(tick, 8000);
      }
    }
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [bridgeId, copy.bridgeProgress.couldNotCheck]);

  const stage = bridgeStageCopy(status?.status ?? 'burning', copy.bridgeStage);

  return (
    <PageCard className="p-6 sm:p-8">
      <SectionTag>
        {stage.done
          ? copy.bridgeProgress.tagBridged
          : stage.failed
            ? copy.bridgeProgress.tagFailed
            : copy.bridgeProgress.tagBridging}
      </SectionTag>
      <HeroHeadline size="md">
        {amount} USDC{' '}
        <Accent>
          {stage.done
            ? copy.bridgeProgress.accentArrived
            : stage.failed
              ? copy.bridgeProgress.accentErrored
              : copy.bridgeProgress.accentBridging}
        </Accent>
        <Punc>.</Punc>
      </HeroHeadline>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        {stage.done
          ? copy.bridgeProgress.bodyDone.replace('{chain}', destLabel)
          : stage.failed
            ? copy.bridgeProgress.bodyFailed
            : copy.bridgeProgress.bodyInProgress.replace('{chain}', destLabel)}
      </p>

      <div className="mt-7">
        <div
          className="h-2 w-full overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 999,
          }}
        >
          <div
            className="h-full transition-[width] duration-500"
            style={{
              width: `${stage.pct}%`,
              background: stage.failed ? '#b03d3a' : 'var(--lp-accent)',
              borderRadius: 999,
            }}
          />
        </div>
        <p className="mt-2 mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {stage.label}
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BridgeFact
          label={copy.bridgeProgress.burnLabel}
          value={status?.sourceTxHash ? shortHash(status.sourceTxHash) : '—'}
          href={status?.sourceTxHash ? `https://testnet.arcscan.app/tx/${status.sourceTxHash}` : undefined}
        />
        <BridgeFact
          label={copy.bridgeProgress.mintLabel.replace('{chain}', destLabel)}
          value={
            status?.mintTxHash
              ? shortHash(status.mintTxHash)
              : stage.done
                ? '—'
                : copy.bridgeProgress.pending
          }
          href={status?.mintTxHash ? undefined : undefined}
        />
      </dl>

      {pollError && (
        <p className="mt-4 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {copy.bridgeProgress.retrying} {pollError}
        </p>
      )}

      {(stage.done || stage.failed) && (
        <div className="mt-7 flex flex-wrap gap-3">
          <CTAPill onClick={onSendMore}>
            {stage.done ? copy.bridgeProgress.sendMore : copy.bridgeProgress.tryAgain}
          </CTAPill>
        </div>
      )}
    </PageCard>
  );
}

function BridgeFact({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <div
      className="px-4 py-3"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      <p className="mt-1.5 mono text-[13px] tabular-nums text-[var(--lp-dark)]">{value}</p>
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block hover:opacity-85">
        {body}
      </a>
    );
  }
  return body;
}

function WalletPickerTile({
  active,
  disabled,
  address,
  balanceUsdc,
  label,
  sub,
  activeLabel,
  notProvisionedLabel,
  onClick,
}: {
  kind: WalletKind;
  active: boolean;
  disabled: boolean;
  address: string | null;
  balanceUsdc: string | null;
  label: string;
  sub: string;
  activeLabel: string;
  notProvisionedLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-start p-4 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
      style={{
        background: active ? 'rgba(175, 201, 91,0.10)' : 'var(--lp-card)',
        border: active
          ? '1px solid rgba(175, 201, 91,0.55)'
          : '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-sans text-[14px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
          {label}
        </p>
        {active && (
          <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
            {activeLabel}
          </span>
        )}
      </div>
      <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {sub}
      </p>
      <p className="mt-2 mono text-[11px] tabular-nums text-[var(--lp-text-sub)]">
        {address ? shortAddress(address) : notProvisionedLabel}
      </p>
      <p className="mt-1.5 font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
        {balanceUsdc ? formatUsdc(balanceUsdc) : '—'}
      </p>
    </button>
  );
}

function destLabel(k: DestKey): string {
  return DESTINATIONS.find((d) => d.key === k)?.short ?? k;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
      [:{children}:]
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-4 py-3"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      <p className="mt-1.5 font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
        {value}
      </p>
    </div>
  );
}

function ComingSoonTile({
  label,
  comingSoonLabel,
}: {
  label: string;
  comingSoonLabel: string;
}) {
  return (
    <div
      className="px-5 py-7 text-center relative"
      style={{
        background: 'var(--lp-card)',
        border: '1px dashed var(--lp-border-light)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
        opacity: 0.55,
      }}
    >
      <p className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      <p className="mt-2 font-sans text-[16px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
        {comingSoonLabel}
      </p>
    </div>
  );
}
