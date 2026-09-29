'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type DepositRequestPublic } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';

const PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
const SECONDARY =
  'inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--tint)] px-4 text-[14px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
const INPUT =
  'min-h-[52px] w-full rounded-[14px] bg-[var(--tint)] px-4 text-[16px] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';

/// Adding money, with the bridge left underneath.
///
/// What this replaces asked the user to pick a rail (Gateway or CCTP), pick a
/// direction, pick a source chain, type an amount, and then watch a four-phase
/// approve/burn/attest/mint progress bar. Every one of those is a question about
/// our plumbing. A person topping up an account has one question: where do I
/// send it.
///
/// So the card is an address. Copy it, send USDC from anywhere in the list, and
/// the card tells you when it lands. There is no amount field because we are not
/// initiating the transfer, no chain picker because the address is the same on
/// every EVM chain, and no connect step because a Circle account already has a
/// wallet it signs with.
///
/// Web3 accounts do not get this. They hold their own funds and bridge from
/// their own wallet, so their flow stays the one that asks them to connect.

/// Two addresses is a fact, not a choice we are passing on: Circle derives EVM
/// deposit wallets from the user's identity anchor, and Solana is a different
/// curve that can never share it. So the switch is between address groups, and
/// the common one is already selected.
type Group = 'evm' | 'solana';

/// A deposit's own progress. `moving` means it reached the deposit address and the
/// hop to Arc is running; `arrived` means it is spendable.
type Stage = 'moving' | 'arrived' | 'stuck';

interface Deposit {
  /// The hop's bridge id, which is how a bridge event finds its own deposit. The
  /// backend puts it on the credit event for exactly this.
  bridgeId: string;
  amountUsdc: string;
  /// A chain name a person recognises, resolved server-side. Never Circle's code.
  chainName: string;
  stage: Stage;
}

export function DepositCard() {
  const t = useTranslations().deposit;
  const { address } = useAuth();
  const refreshMoney = useMoneyRefresh();
  const [group, setGroup] = useState<Group>('evm');
  const [copied, setCopied] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [request, setRequest] = useState<DepositRequestPublic | null>(null);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestPurpose, setRequestPurpose] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [requestCopied, setRequestCopied] = useState(false);
  /// Every deposit seen this session, newest first, each with its own progress.
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['deposit', 'address', address],
    queryFn: () => api.depositAddress(address!),
    enabled: !!address,
    // The addresses are derived and permanent. Refetching them on focus would be
    // a request that can only ever return the same two strings.
    staleTime: Infinity,
  });

  const evm = data?.chains ?? [];
  const solana = data?.solana ?? null;
  const active = group === 'solana' ? solana : (evm[0] ?? null);
  const shown = active?.address ?? null;

  // The credit arrives on the same stream the rest of the app listens to. This
  // is what makes the card feel finished without a refresh: the user sends from
  // their phone, puts it down, and the number has already moved.
  useEffect(() => {
    if (!address) return;
    const setStage = (bridgeId: string | undefined, stage: Stage) => {
      if (!bridgeId) return;
      setDeposits((prev) => prev.map((d) => (d.bridgeId === bridgeId ? { ...d, stage } : d)));
    };

    return subscribeLiveEvents((event) => {
      const p = (event.payload ?? {}) as {
        source?: string;
        amountUsdc?: string;
        owner?: string;
        mintRecipient?: string;
        chainName?: string;
        bridgeId?: string;
      };

      if (event.type === 'wallet.credited') {
        if (p.source !== 'deposit') return;
        if (p.owner && p.owner.toLowerCase() !== address.toLowerCase()) return;
        const bridgeId = p.bridgeId;
        if (!bridgeId) return;
        setDeposits((prev) => {
          // Circle can deliver the same credit more than once as the transaction
          // advances. Keyed on the bridge id so a redelivery updates the row
          // instead of adding a second one for a single deposit.
          if (prev.some((d) => d.bridgeId === bridgeId)) return prev;
          const next: Deposit = {
            bridgeId,
            amountUsdc: p.amountUsdc ?? '',
            chainName: p.chainName ?? '',
            // The hop starts server-side the instant the credit lands, so the row
            // can say so without waiting for the first bridge event.
            stage: 'moving',
          };
          return [next, ...prev];
        });
        refreshMoney();
        return;
      }

      // Bridge events carry the bridge id, so each updates its own row. The
      // recipient check keeps another user's hop out of this list.
      if (p.mintRecipient && p.mintRecipient.toLowerCase() !== address.toLowerCase()) return;
      if (
        event.type === 'bridge.approving' ||
        event.type === 'bridge.burning' ||
        event.type === 'bridge.burned' ||
        event.type === 'bridge.attested'
      ) {
        setStage(p.bridgeId, 'moving');
        return;
      }
      if (event.type === 'bridge.minted') {
        setStage(p.bridgeId, 'arrived');
        refreshMoney();
        return;
      }
      if (event.type === 'bridge.error') setStage(p.bridgeId, 'stuck');
    });
  }, [address, refreshMoney]);

  const copy = useCallback(async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard can be refused (permissions, insecure context). The address is
      // on screen in full, so there is nothing to explain and nothing to fix.
    }
  }, [shown]);

  const createRequest = useCallback(async () => {
    setRequestBusy(true);
    setRequestError(false);
    try {
      const result = await api.createDepositRequest({
        ...(requestAmount.trim() ? { amountUsdc: requestAmount.trim() } : {}),
        ...(requestPurpose.trim() ? { purpose: requestPurpose.trim() } : {}),
      });
      setRequest(result.request);
    } catch {
      setRequestError(true);
    } finally {
      setRequestBusy(false);
    }
  }, [requestAmount, requestPurpose]);

  const requestLink = request
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/deposit/request/${request.requestId}`
    : '';

  const copyRequestLink = useCallback(async () => {
    if (!requestLink) return;
    try {
      await navigator.clipboard.writeText(requestLink);
      setRequestCopied(true);
      window.setTimeout(() => setRequestCopied(false), 2200);
    } catch {
      // The link stays visible below, so clipboard permission is optional.
    }
  }, [requestLink]);

  if (isLoading) return <DepositSkeleton />;

  // Nothing provisioned means nothing is watching, and inviting a deposit that
  // no one would notice is worse than saying not yet.
  if (!data?.supported || (!evm.length && !solana)) {
    return (
      <Shell>
        <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)] max-w-[42ch]">
          {t.unavailable}
        </p>
      </Shell>
    );
  }

  return (
    <Shell dataGuide="bridge-address">
      {solana ? (
        <div className="mt-5">
          <GroupSwitch
            group={group}
            onChange={(g) => {
              setGroup(g);
              setCopied(false);
            }}
            evmLabel={t.groups.evm}
            solanaLabel={t.groups.solana}
          />
        </div>
      ) : null}

      <div className="mt-6 flex flex-col sm:flex-row sm:items-start gap-6">
        {shown ? <Qr value={shown} label={t.qrAlt} /> : null}

        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
            {t.addressLabel}
          </span>
          {/* The whole address, wrapped, never truncated. A shortened address is
              fine as a reference and useless as a destination, and this one is a
              destination. */}
          <p
            className="mt-2 text-[14px] leading-[1.6] font-medium text-[var(--ink)] break-all select-all"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {shown}
          </p>

          <button
            type="button"
            onClick={copy}
            className={`mt-4 ${requestOpen ? SECONDARY : PRIMARY}`}
          >
            {copied ? t.copied : t.copy}
          </button>

          <button
            type="button"
            onClick={() => {
              setRequestOpen((open) => !open);
              setRequestError(false);
            }}
            className={`mt-3 ${SECONDARY}`}
          >
            {t.request.title}
          </button>

          <div className="mt-6">
            <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
              {t.acceptsLabel}
            </span>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
              {group === 'solana' ? t.groups.solana : evm.map((chain) => chain.name).join(', ')}
            </p>
          </div>
        </div>
      </div>

      {requestOpen ? (
        <DepositRequestComposer
          copy={t.request}
          amount={requestAmount}
          purpose={requestPurpose}
          setAmount={setRequestAmount}
          setPurpose={setRequestPurpose}
          busy={requestBusy}
          error={requestError}
          request={request}
          link={requestLink}
          copied={requestCopied}
          onCreate={createRequest}
          onCopyLink={copyRequestLink}
        />
      ) : null}

      <div className="mt-7 border-t border-[var(--line)] pt-5">
        {deposits.length > 0 ? (
          <ul className="space-y-3" role="status" aria-live="polite">
            {deposits.map((d) => (
              <DepositRow key={d.bridgeId} deposit={d} copy={t} />
            ))}
          </ul>
        ) : (
          <Watching label={t.watching} />
        )}
      </div>
    </Shell>
  );
}

/// The QR, drawn client-side. `qrcode` is imported lazily so no other page pays
/// for it, and the canvas is redrawn whenever the address group changes.
function Qr({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QR = await import('qrcode');
        if (cancelled || !ref.current) return;
        await QR.toCanvas(ref.current, value, {
          // A quiet zone is part of the spec, not padding we can style away.
          margin: 1,
          width: 168,
          errorCorrectionLevel: 'M',
          // Fixed, not theme-aware. Dark modules on white is what every scanner
          // is calibrated for, and inverting it in dark mode made the code
          // near-black on a near-black card: rendered, invisible, unscannable.
          color: { dark: '#0A0A0BFF', light: '#FFFFFFFF' },
        });
      } catch {
        // The address is on screen and copyable, so a missing QR costs
        // convenience and nothing else.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (failed) return null;
  return (
    <div
      className="shrink-0 p-3"
      style={{
        // White in both themes, for the same reason as the module colour. The
        // plate is the code's quiet zone.
        background: '#FFFFFF',
        borderRadius: 20,
      }}
    >
      <canvas ref={ref} aria-label={label} role="img" width={168} height={168} />
    </div>
  );
}

/// Address groups use quiet pills so the copy or request action stays primary.
function GroupSwitch({
  group,
  onChange,
  evmLabel,
  solanaLabel,
}: {
  group: Group;
  onChange: (g: Group) => void;
  evmLabel: string;
  solanaLabel: string;
}) {
  const evm = group === 'evm';
  return (
    <div className="inline-flex w-full max-w-[360px] gap-2">
      <GroupHalf active={evm} onClick={() => onChange('evm')}>
        {evmLabel}
      </GroupHalf>
      <GroupHalf active={!evm} onClick={() => onChange('solana')}>
        {solanaLabel}
      </GroupHalf>
    </div>
  );
}

function GroupHalf({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 flex-1 rounded-full px-5 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] ${active ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'bg-[var(--tint)] text-[var(--ink-secondary)] hover:bg-[var(--line)]'}`}
    >
      {children}
    </button>
  );
}

/// The standing state. A breathing dot rather than a spinner, because nothing is
/// pending on our side: we are listening, which is a different thing from working.
function Watching({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-block motion-safe:animate-pulse motion-reduce:animate-none"
        style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ink-secondary)' }}
      />
      <span className="text-[13px] text-[var(--ink-secondary)]">
        {label}
      </span>
    </div>
  );
}

/// One deposit. Amount and origin on the left, its own state on the right, so
/// several at once read as a queue rather than one number that keeps changing.
function DepositRow({
  deposit,
  copy,
}: {
  deposit: Deposit;
  copy: {
    fromTemplate: string;
    stages: { moving: string; arrived: string; stuck: string };
  };
}) {
  const { stage } = deposit;
  const tone = stage === 'stuck' ? 'var(--color-warning)' : stage === 'arrived' ? 'var(--color-positive)' : 'var(--ink-secondary)';
  return (
    <li className="flex items-center justify-between gap-4 fade-up motion-reduce:animate-none" style={{ animationDuration: 'var(--dur-panel)', animationTimingFunction: 'var(--ease-ui)' }}>
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden
          className={
            stage === 'moving' ? 'motion-safe:animate-pulse motion-reduce:animate-none' : ''
          }
          style={{ width: 6, height: 6, borderRadius: 999, background: tone, flex: '0 0 auto' }}
        />
        <span
          className="text-[14px] font-medium text-[var(--ink)] break-words"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {copy.fromTemplate
            .replace('{amount}', deposit.amountUsdc)
            .replace('{chain}', deposit.chainName)}
        </span>
      </span>
      <span className="text-[13px] shrink-0 text-[var(--ink-secondary)]">
        {copy.stages[stage]}
      </span>
    </li>
  );
}

function Shell({
  children,
  dataGuide,
}: {
  children: React.ReactNode;
  dataGuide?: string;
}) {
  return (
    <div
      data-guide={dataGuide}
      className="rounded-[20px] bg-[var(--surface)] p-6 sm:p-8"
    >
      {children}
    </div>
  );
}

function DepositSkeleton() {
  return (
    <Shell>
      <div
        aria-hidden
        className="motion-safe:animate-pulse motion-reduce:animate-none"
        style={{ minHeight: 300 }}
      />
    </Shell>
  );
}

function DepositRequestComposer({
  copy,
  amount,
  purpose,
  setAmount,
  setPurpose,
  busy,
  error,
  request,
  link,
  copied,
  onCreate,
  onCopyLink,
}: {
  copy: ReturnType<typeof useTranslations>['deposit']['request'];
  amount: string;
  purpose: string;
  setAmount: (value: string) => void;
  setPurpose: (value: string) => void;
  busy: boolean;
  error: boolean;
  request: DepositRequestPublic | null;
  link: string;
  copied: boolean;
  onCreate: () => void;
  onCopyLink: () => void;
}) {
  return (
    <div
      className="mt-7 border-t border-[var(--line)] pt-6"
      data-guide="deposit-request"
    >
      {!request ? (
        <>
          <p className="mt-3 text-[22px] font-medium tracking-normal text-[var(--ink)]">
            {copy.title}
          </p>
          <p className="mt-2 max-w-[48ch] text-[13px] leading-relaxed text-[var(--ink-secondary)]">
            {copy.body}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
                {copy.amountLabel} <span className="font-normal">({copy.amountOptional})</span>
              </span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className={INPUT}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
                {copy.purposeLabel}
              </span>
              <input
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder={copy.purposePlaceholder}
                className={INPUT}
              />
            </label>
          </div>
          {error ? (
            <p className="mt-3 text-[13px] text-[var(--color-critical)]" role="alert">
              {copy.error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onCreate}
            className={`mt-5 ${PRIMARY}`}
          >
            {busy ? copy.creating : copy.create}
          </button>
        </>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
          <Qr value={link} label={copy.qrAlt} />
          <div className="min-w-0">
            <p className="text-[22px] font-medium tracking-normal text-[var(--ink)]">
              {copy.shareTitle}
            </p>
            <p className="mt-2 max-w-[48ch] text-[13px] leading-relaxed text-[var(--ink-secondary)]">
              {copy.shareBody}
            </p>
            <p className="mt-4 text-[14px] font-medium text-[var(--ink)]">
              {request.amountUsdc ? `${request.amountUsdc} USDC · ` : ''}{request.purpose}
            </p>
            <p className="mt-1 break-all text-[13px] leading-relaxed text-[var(--ink-secondary)]">
              {link}
            </p>
            <button
              type="button"
              onClick={onCopyLink}
              className={`mt-4 ${PRIMARY}`}
            >
              {copied ? copy.copied : copy.copyLink}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
