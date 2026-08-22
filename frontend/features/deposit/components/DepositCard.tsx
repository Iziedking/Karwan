'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';

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

  if (isLoading) return <DepositSkeleton />;

  // Nothing provisioned means nothing is watching, and inviting a deposit that
  // no one would notice is worse than saying not yet.
  if (!data?.supported || (!evm.length && !solana)) {
    return (
      <Shell>
        <Tag>{t.tag}</Tag>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[42ch]">
          {t.unavailable}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Tag>{t.tag}</Tag>

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
          <span className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {t.addressLabel}
          </span>
          {/* The whole address, wrapped, never truncated. A shortened address is
              fine as a reference and useless as a destination, and this one is a
              destination. */}
          <p
            className="mt-2 mono text-[13px] leading-[1.6] font-bold text-[var(--lp-dark)] break-all select-all"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {shown}
          </p>

          <button
            type="button"
            onClick={copy}
            className="group mt-4 inline-flex items-center gap-2 px-5 py-3 mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors"
            style={{
              background: copied ? 'var(--lp-band-dark)' : 'var(--lp-accent)',
              color: copied ? 'white' : 'var(--accent-ink)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            {copied ? t.copied : t.copy}
          </button>

          <div className="mt-6">
            <span className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {t.acceptsLabel}
            </span>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
              {group === 'solana' ? t.groups.solana : evm.map((chain) => chain.name).join(', ')}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 pt-5" style={{ borderTop: '1px solid var(--lp-border-light)' }}>
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
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
      }}
    >
      <canvas ref={ref} aria-label={label} role="img" width={168} height={168} />
    </div>
  );
}

/// Two halves with a sliding lozenge, matching the rail switch this card sits
/// beside so the page keeps one vocabulary of controls.
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
    <div
      className="relative inline-flex p-1 w-full max-w-[360px]"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: 'calc(50% - 4px)',
          left: 4,
          borderRadius: 999,
          background: 'var(--lp-band-dark)',
          transform: evm ? 'translateX(0)' : 'translateX(100%)',
        }}
      />
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
      className="relative z-10 flex-1 px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] rounded-full transition-colors"
      style={{ background: 'transparent', color: active ? 'white' : 'var(--lp-text-sub)' }}
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
        style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--lp-accent)' }}
      />
      <span className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-sub)]">
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
  // Lime for in flight and for arrived, because both are the system working. A
  // stalled hop is the only one that looks different, and it is muted rather than
  // alarming: the money is safe, it just has not finished moving.
  const tone = stage === 'stuck' ? 'var(--lp-text-muted)' : 'var(--lp-accent)';
  return (
    <li className="flex items-center justify-between gap-4 fade-up">
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden
          className={
            stage === 'moving' ? 'motion-safe:animate-pulse motion-reduce:animate-none' : ''
          }
          style={{ width: 6, height: 6, borderRadius: 999, background: tone, flex: '0 0 auto' }}
        />
        <span
          className="mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-dark)] truncate"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {copy.fromTemplate
            .replace('{amount}', deposit.amountUsdc)
            .replace('{chain}', deposit.chainName)}
        </span>
      </span>
      <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] shrink-0 text-[var(--lp-text-sub)]">
        {copy.stages[stage]}
      </span>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-6 sm:p-8"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
      }}
    >
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
      {children}
    </span>
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
