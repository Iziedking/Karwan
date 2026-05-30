'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, type BridgeChainKey, type AppKitBridgeChainKey } from '@/core/api';
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
import { SignInGate } from '@/shared/components/SignInGate';
import { formatUsdc, shortAddress, shortHash } from '@/shared/utils/format';

type DestKey = 'arc' | AppKitBridgeChainKey;
type WalletKind = 'identity' | 'sellerAgent';

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
}

export default function CashoutPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId ?? '';
  const auth = useAuth();
  const [info, setInfo] = useState<CashoutInfo | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !jobId) return;
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
        setLoadError(err instanceof Error ? err.message : 'could not load');
        setFetchState('error');
      });
    return () => {
      alive = false;
    };
  }, [auth.isAuthenticated, jobId]);

  if (!auth.isAuthenticated) {
    return (
      <SignInGate
        tag="CASHOUT"
        title={
          <>
            Move your <Accent>USDC</Accent>
            <Punc>.</Punc>
          </>
        }
        body="Sign in to the account this deal settled on to withdraw."
        buttonLabel="Sign in"
      />
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[60ch] fade-up">
          <SectionTag tone="dark" dot="live">
            CASHOUT
          </SectionTag>
          <HeroHeadline size="lg">
            Move your <Accent>USDC</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-7 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[52ch]">
            {info
              ? `You earned ${formatUsdc(info.dealAmountUsdc)} on this deal. Send it to any wallet on Arc, or bridge to another chain.`
              : 'Loading your earnings…'}
          </p>
          <div className="mt-7 flex flex-wrap gap-2 mono text-[10px] uppercase tracking-[0.14em] text-white/55">
            <Link
              href={`/deals/${jobId}`}
              className="inline-flex items-center gap-1.5 hover:text-[var(--lp-accent)] transition-colors"
            >
              [:back to deal:]
            </Link>
          </div>
        </div>
      </Band>

      <Band tone="light" compact>
        {fetchState === 'loading' && (
          <PageCard className="p-6 sm:p-8">
            <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              Loading…
            </p>
          </PageCard>
        )}
        {fetchState === 'error' && (
          <PageCard className="p-6 sm:p-8">
            <p className="text-[14px] text-[var(--lp-text-sub)]">
              Could not load this deal. {loadError ?? ''}
            </p>
          </PageCard>
        )}
        {fetchState === 'ready' && info && <CashoutContent info={info} jobId={jobId} />}
      </Band>

      <Band tone="light" compact>
        <SectionTag>COMING SOON</SectionTag>
        <HeroHeadline size="md">
          Cash out to <Accent>local currency</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          Direct off-ramp to NGN, KES, INR, AED and more. Powered by Circle.
        </p>
        <div className="mt-7">
          <ComingSoonTile label="Off-ramp" />
        </div>
      </Band>
    </FullBleed>
  );
}

function CashoutContent({ info, jobId }: { info: CashoutInfo; jobId: string }) {
  if (!info.settledAt) {
    return (
      <PageCard className="p-6 sm:p-8">
        <SectionTag>NOT READY</SectionTag>
        <HeroHeadline size="md">
          Deal isn&apos;t <Accent>settled</Accent> yet
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          Come back once the buyer releases the final milestone.
        </p>
        <div className="mt-7">
          <Link href={`/deals/${jobId}`}>
            <CTAPill variant="secondary" tone="light">
              Open the deal
            </CTAPill>
          </Link>
        </div>
      </PageCard>
    );
  }

  if (info.legacyEscrow) {
    return (
      <PageCard className="p-6 sm:p-8">
        <SectionTag>LEGACY ESCROW</SectionTag>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          This deal settled on a legacy escrow contract. Cash out from the legacy surface.
        </p>
        <div className="mt-7">
          <Link href="/legacy">
            <CTAPill variant="secondary" tone="light">
              Open legacy surface
            </CTAPill>
          </Link>
        </div>
      </PageCard>
    );
  }

  if (info.accountKind === 'wallet') return <WalletAccountState />;
  return <CircleWithdrawForm info={info} />;
}

function WalletAccountState() {
  return (
    <PageCard className="p-6 sm:p-8">
      <SectionTag>WALLET ACCOUNT</SectionTag>
      <HeroHeadline size="md">
        Your USDC <Accent>already landed</Accent>
        <Punc>.</Punc>
      </HeroHeadline>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        The escrow released straight to your connected wallet on Arc. Use your wallet to bridge
        or send it elsewhere.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--lp-text-muted)] max-w-[52ch]">
        In-product wallet withdraw is on the roadmap.
      </p>
      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ComingSoonTile label="Bridge from wallet" />
        <ComingSoonTile label="Send on Arc" />
      </div>
    </PageCard>
  );
}

function CircleWithdrawForm({ info }: { info: CashoutInfo }) {
  // The wallet picker defaults to the deal wallet because that's where the
  // escrow released to. Sellers who already swept funds into identity can
  // flip the switch.
  const sellerAgentAvail = info.sellerAgentWallet.available;
  const identityAvail = info.identityWallet.available;
  const defaultWallet: WalletKind = sellerAgentAvail ? 'sellerAgent' : 'identity';
  const [walletKind, setWalletKind] = useState<WalletKind>(defaultWallet);

  const activeWallet = walletKind === 'identity' ? info.identityWallet : info.sellerAgentWallet;
  const balanceNum = Number(activeWallet.arcBalanceUsdc ?? 0);
  const balance = Number.isFinite(balanceNum) ? balanceNum : 0;

  const [dest, setDest] = useState<DestKey>('arc');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ txHash: string; explorerUrl: string } | null>(null);
  const [bridgeResult, setBridgeResult] = useState<{ bridgeId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountNum = useMemo(() => Number(amount), [amount]);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= balance;
  const recipientValid = isValidForChain(recipient, dest);
  const canSubmit = amountValid && recipientValid && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
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
        });
        setResult({ txHash: r.txHash, explorerUrl: r.explorerUrl });
      } else if (dest === 'solanaDevnet') {
        setError(
          'Solana withdraw is on the roadmap. Use Ethereum Sepolia or another EVM chain for now.',
        );
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
            : 'Withdraw failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <PageCard className="p-6 sm:p-8">
        <SectionTag>SENT</SectionTag>
        <HeroHeadline size="md">
          {amount} USDC <Accent>on its way</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
          Transfer confirmed on Arc.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={result.explorerUrl} target="_blank" rel="noreferrer">
            <CTAPill variant="secondary" tone="light">
              View tx {shortHash(result.txHash)}
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
            Send more
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
      />
    );
  }

  return (
    <PageCard className="p-6 sm:p-8">
      <SectionTag>WITHDRAW</SectionTag>
      <HeroHeadline size="md">
        Send your <Accent>USDC</Accent>
        <Punc>.</Punc>
      </HeroHeadline>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        Pick the source wallet, the destination chain, paste the address, set the amount.
      </p>

      <div className="mt-7">
        <FieldLabel>
          From wallet{' '}
          <span
            className="normal-case text-[var(--lp-text-muted)] cursor-help"
            title="Released escrow USDC lands on the deal wallet (your per-deal seller agent). Identity wallet is your main address. Switch to whichever currently holds the USDC you want to send."
          >
            (what is this?)
          </span>
        </FieldLabel>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <WalletPickerTile
            kind="sellerAgent"
            active={walletKind === 'sellerAgent'}
            disabled={!sellerAgentAvail}
            address={info.sellerAgentWallet.address}
            balanceUsdc={info.sellerAgentWallet.arcBalanceUsdc}
            label="Deal wallet"
            sub="Where the escrow released"
            onClick={() => setWalletKind('sellerAgent')}
          />
          <WalletPickerTile
            kind="identity"
            active={walletKind === 'identity'}
            disabled={!identityAvail}
            address={info.identityWallet.address}
            balanceUsdc={info.identityWallet.arcBalanceUsdc}
            label="Identity wallet"
            sub="Your main address"
            onClick={() => setWalletKind('identity')}
          />
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat
          label="Source balance"
          value={
            activeWallet.arcBalanceUsdc
              ? formatUsdc(activeWallet.arcBalanceUsdc)
              : '—'
          }
        />
        <Stat label="From deal" value={formatUsdc(info.dealAmountUsdc)} />
      </div>

      <div className="mt-7">
        <FieldLabel>Destination chain</FieldLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESTINATIONS.map((d) => {
            const active = dest === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setDest(d.key);
                  setRecipient('');
                  setError(null);
                }}
                className="mono text-[11px] uppercase tracking-[0.14em] px-3 py-2 transition-colors"
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
          Recipient address{' '}
          <span className="text-[var(--lp-text-muted)] normal-case">
            ({dest === 'solanaDevnet' ? 'Solana' : 'EVM'})
          </span>
        </FieldLabel>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={dest === 'solanaDevnet' ? 'Base58 address' : '0x…'}
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
            That doesn&apos;t look like a valid {dest === 'solanaDevnet' ? 'Solana' : 'EVM'}{' '}
            address.
          </p>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Amount (USDC)</FieldLabel>
          <button
            type="button"
            onClick={() => setAmount(balance.toString())}
            className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            Max
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
            Over the source wallet balance of {balance} USDC.
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
          {submitting
            ? dest === 'arc'
              ? 'Sending on Arc…'
              : 'Bridging out…'
            : dest === 'arc'
              ? `Send to ${destLabel(dest)}`
              : `Bridge to ${destLabel(dest)}`}
        </CTAPill>
      </div>
    </PageCard>
  );
}

/// Maps backend bridge.status strings to a human progress copy. The pipeline
/// goes: burning -> burned -> attested -> minted. Anything else is errored
/// or terminal.
function bridgeStageCopy(status: string): { label: string; pct: number; done: boolean; failed: boolean } {
  switch (status) {
    case 'burning':
      return { label: 'Burning on Arc', pct: 25, done: false, failed: false };
    case 'burned':
      return { label: 'Waiting on Circle attestation', pct: 50, done: false, failed: false };
    case 'attested':
      return { label: 'Attested. Minting on destination', pct: 75, done: false, failed: false };
    case 'minted':
      return { label: 'Minted on destination', pct: 100, done: true, failed: false };
    case 'error':
      return { label: 'Bridge errored', pct: 100, done: false, failed: true };
    default:
      return { label: status, pct: 10, done: false, failed: false };
  }
}

interface BridgeProgressCardProps {
  bridgeId: string;
  amount: string;
  destLabel: string;
  onSendMore: () => void;
}

/// Live, inline bridge progress for the email-claim seller. Polls every 4s
/// until the bridge settles. Surfaces the burn + mint tx hashes when they
/// land. No /bridge redirect; the experience stays in /cashout.
function BridgeProgressCard({
  bridgeId,
  amount,
  destLabel,
  onSendMore,
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
        setPollError(err instanceof Error ? err.message : 'Could not check status.');
        timer = setTimeout(tick, 8000);
      }
    }
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [bridgeId]);

  const stage = bridgeStageCopy(status?.status ?? 'burning');

  return (
    <PageCard className="p-6 sm:p-8">
      <SectionTag>{stage.done ? 'BRIDGED' : stage.failed ? 'BRIDGE FAILED' : 'BRIDGING'}</SectionTag>
      <HeroHeadline size="md">
        {amount} USDC{' '}
        <Accent>{stage.done ? 'arrived' : stage.failed ? 'errored' : 'bridging'}</Accent>
        <Punc>.</Punc>
      </HeroHeadline>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        {stage.done
          ? `Mint confirmed on ${destLabel}. The USDC is in the recipient address.`
          : stage.failed
            ? 'Something went wrong on the way. The funds are still on the source side. Take a screenshot of this page and ping support.'
            : `Burn on Arc submitted. Mint will land on ${destLabel} once Circle's attestation clears, usually under a minute on testnet.`}
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
          label="Burn (Arc)"
          value={status?.sourceTxHash ? shortHash(status.sourceTxHash) : '—'}
          href={status?.sourceTxHash ? `https://testnet.arcscan.app/tx/${status.sourceTxHash}` : undefined}
        />
        <BridgeFact
          label={`Mint (${destLabel})`}
          value={status?.mintTxHash ? shortHash(status.mintTxHash) : stage.done ? '—' : 'pending'}
          href={status?.mintTxHash ? undefined : undefined}
        />
      </dl>

      {pollError && (
        <p className="mt-4 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          Retrying status check… {pollError}
        </p>
      )}

      {(stage.done || stage.failed) && (
        <div className="mt-7 flex flex-wrap gap-3">
          <CTAPill onClick={onSendMore}>{stage.done ? 'Send more' : 'Try again'}</CTAPill>
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
  onClick,
}: {
  kind: WalletKind;
  active: boolean;
  disabled: boolean;
  address: string | null;
  balanceUsdc: string | null;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-left p-4 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
            ACTIVE
          </span>
        )}
      </div>
      <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {sub}
      </p>
      <p className="mt-2 mono text-[11px] tabular-nums text-[var(--lp-text-sub)]">
        {address ? shortAddress(address) : 'Not provisioned'}
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

function ComingSoonTile({ label }: { label: string }) {
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
        Coming soon
      </p>
    </div>
  );
}
