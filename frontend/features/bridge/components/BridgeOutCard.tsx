'use client';
import { useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useBridges, bridgeChainMeta, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';
import { SOURCE_CHAINS, SOURCE_CHAIN_KEYS, ARC_TESTNET, type CctpChainKey } from '../config';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';

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

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function outPhaseLabel(phase: BridgePhase, dest: string): string {
  switch (phase) {
    case 'approving':
    case 'burning':
      return 'Burning on Arc';
    case 'relaying':
    case 'attesting':
      return 'Waiting for attestation';
    case 'minting':
      return `Minting on ${dest}`;
    case 'done':
      return 'Sent';
    case 'error':
      return 'Failed';
    default:
      return 'Submitting';
  }
}

function phaseTone(phase: BridgePhase): 'live' | 'positive' | 'critical' {
  if (phase === 'done') return 'positive';
  if (phase === 'error') return 'critical';
  return 'live';
}

/// Bridge OUT (Arc -> chain). Sends the user's Arc USDC to another chain via
/// CCTP: backend burns from the identity DCW on Arc, relays the mint on the
/// destination (gas sponsored). Circle accounts only for now; web3 users sign
/// the Arc burn themselves, which is a follow-up.
export function BridgeOutCard() {
  const auth = useAuth();
  const isCircle = auth.method === 'circle';
  const { bridges, startCircleOut, dismiss, isActive } = useBridges();
  const outBridges = bridges.filter((b) => b.direction === 'out');

  const [destKey, setDestKey] = useState<CctpChainKey>('baseSepolia');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [recipient, setRecipient] = useState<string>(auth.address ?? '');
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetNote, setFaucetNote] = useState<string | null>(null);

  // Bridge-out spends the identity wallet's Arc USDC, so let the user top it up
  // here in one tap instead of hopping to the Wallets panel.
  async function runFaucet() {
    if (!auth.address) return;
    setFaucetBusy(true);
    setFaucetNote(null);
    try {
      await api.faucet(auth.address, 'identity');
      setFaucetNote('Faucet requested. About 20 USDC lands on your Arc wallet in a minute.');
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setFaucetNote(detail ?? (err as Error).message);
    } finally {
      setFaucetBusy(false);
    }
  }

  const dest = SOURCE_CHAINS[destKey];
  const recipientValid = ADDRESS_RE.test(recipient.trim());
  const canSubmit =
    isCircle &&
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    recipientValid;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !auth.address) return;
    startCircleOut({
      destChainKey: destKey,
      amountUsdc: amount as number,
      recipient: recipient.trim() as `0x${string}`,
      userAddress: auth.address,
    });
    setAmount('');
  }

  return (
    <div style={CARD_STYLE} className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:SEND OUT:]
        </span>
        <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          Bridge from Arc
        </h2>
        <p className="mt-2 inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          <span>CCTP V2 · gas sponsored</span>
        </p>
      </div>

      <div className="px-6 pb-6">
        {!isCircle ? (
          <div
            className="px-4 py-3 text-[13px] leading-snug text-[var(--lp-text-sub)]"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            Bridging out from a web3 wallet signs the Arc burn yourself, which is coming soon. Use a
            Karwan email account to send out now.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {/* DESTINATION DROPDOWN */}
            <div className="relative">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:DESTINATION:]
              </span>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="mt-2.5 w-full flex items-center justify-between gap-3 px-4 py-3 text-start transition-colors"
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
                  <ChainLogo chain={destKey} size={26} />
                  <span className="font-sans text-[14px] font-semibold tracking-tight text-[var(--lp-dark)]">
                    {dest.name}
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
                  <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
                <ul
                  className="absolute z-20 start-0 end-0 mt-2 p-1.5 fade-up"
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
                  {SOURCE_CHAIN_KEYS.map((k) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => {
                          setDestKey(k);
                          setOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[var(--lp-light)] transition-colors text-start"
                      >
                        <ChainLogo chain={k} size={22} />
                        <span className="font-sans text-[13px] font-semibold text-[var(--lp-dark)]">
                          {SOURCE_CHAINS[k].name}
                        </span>
                        {k === destKey && (
                          <span
                            aria-hidden
                            className="ms-auto inline-block w-[6px] h-[6px]"
                            style={{ background: 'var(--lp-accent)', borderRadius: 1 }}
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* AMOUNT */}
            <div
              style={{
                background: 'var(--lp-card)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <div className="px-4 pt-3 pb-0.5 flex items-baseline justify-between">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  [:AMOUNT:]
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  FROM ARC
                </span>
              </div>
              <div className="px-4 pb-3 flex items-baseline gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="no-spinner flex-1 bg-transparent font-sans text-[32px] font-extrabold tracking-[-0.025em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] min-w-0 text-[var(--lp-dark)]"
                  placeholder="0"
                />
                <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] font-semibold">
                  USDC
                </span>
              </div>
            </div>

            {/* TOP UP ARC USDC — bridge-out spends the identity wallet balance. */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={runFaucet}
                disabled={faucetBusy}
                className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline-offset-2 hover:underline disabled:opacity-50"
              >
                {faucetBusy ? 'Requesting' : 'Need Arc USDC? Faucet →'}
              </button>
            </div>
            {faucetNote && (
              <p
                className="px-3 py-2 text-[11.5px] leading-snug"
                style={{
                  background: 'rgba(175, 201, 91,0.10)',
                  color: 'var(--lp-dark)',
                  border: '1px solid rgba(175, 201, 91,0.30)',
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 3,
                }}
              >
                {faucetNote}
              </p>
            )}

            {/* RECIPIENT */}
            <div
              className="px-4 py-3"
              style={{
                background: 'var(--lp-light)',
                border: '1px dashed rgba(0,0,0,0.18)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:LANDS AT · {dest.shortName.toUpperCase()}:]
              </span>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x your address on the destination chain"
                spellCheck={false}
                className="mt-1.5 w-full bg-transparent text-[13px] mono tabular-nums focus:outline-none text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)]"
              />
              {recipient.trim() !== '' && !recipientValid && (
                <p className="mt-1 mono text-[10px] uppercase tracking-[0.1em] text-[#b03d3a]">
                  • [:ERR:] not a valid address
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="group relative w-full px-4 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] inline-flex items-center justify-center gap-2 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-dark)',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
                boxShadow: canSubmit ? '0 4px 0 rgba(0,0,0,0.22)' : 'none',
              }}
            >
              <span>Send to {dest.shortName}</span>
              <span aria-hidden className="inline-flex transition-transform group-hover:translate-x-0.5">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </form>
        )}

        {outBridges.length > 0 && (
          <div className="mt-7 pt-5 border-t border-[var(--lp-border-light)]">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:ACTIVITY:]
            </span>
            <ul className="mt-3.5 space-y-2">
              {outBridges.map((b) => (
                <OutRow key={b.id} bridge={b} onDismiss={() => dismiss(b.id)} active={isActive(b.phase)} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function OutRow({
  bridge,
  onDismiss,
  active,
}: {
  bridge: BridgeRecord;
  onDismiss: () => void;
  active: boolean;
}) {
  // OUT records always land on a CCTP EVM destination today (Solana is
  // bridge-IN-only on the App Kit path), so this index is safe. The meta
  // lookup tolerates a future widening without forcing a rewrite here.
  const dest = bridgeChainMeta(bridge.sourceChainKey);
  const tone = phaseTone(bridge.phase);
  const rail =
    tone === 'positive' ? '#0a7553' : tone === 'critical' ? '#b03d3a' : 'var(--lp-accent)';
  return (
    <li
      className="relative overflow-hidden p-3 ps-4"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <span aria-hidden className="absolute start-0 top-0 bottom-0 w-[3px]" style={{ background: rail }} />
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <ChainLogo chain="arc" size={20} />
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden className="text-[var(--lp-text-muted)]">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <ChainLogo chain={bridge.sourceChainKey} size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-sans text-[16px] font-extrabold tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(bridge.amountUsdc, { withSuffix: false })}
            </span>
            <span className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none">
              USDC
            </span>
          </div>
          <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.14em] leading-none" style={{ color: rail }}>
            {outPhaseLabel(bridge.phase, dest.shortName)}
            {bridge.mintTxHash && (
              <a
                href={dest.explorerTx(bridge.mintTxHash)}
                target="_blank"
                rel="noreferrer"
                className="ms-2 underline-offset-2 hover:underline text-[var(--lp-text-muted)]"
              >
                {shortHash(bridge.mintTxHash)}
              </a>
            )}
          </p>
          {bridge.error && (
            <p className="mt-1 text-[11px] leading-snug text-[#b03d3a]">{bridge.error}</p>
          )}
        </div>
        {!active && (
          <button
            type="button"
            onClick={onDismiss}
            className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>
      <span className="sr-only">to {shortAddress(bridge.mintRecipient)}</span>
    </li>
  );
}
