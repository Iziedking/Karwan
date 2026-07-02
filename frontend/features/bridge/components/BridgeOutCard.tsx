'use client';
import { useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useBridges, bridgeChainMeta, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';
import { SOURCE_CHAINS, SOURCE_CHAIN_KEYS, ARC_TESTNET, type CctpChainKey } from '../config';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';

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

/// Cash-out destinations. A CCTP chain routes through the burn/mint bridge; Arc
/// is a same-chain send that settles instantly, so it gets its own path.
type DestKey = CctpChainKey | 'arc';
const DEST_KEYS: DestKey[] = ['arc', ...SOURCE_CHAIN_KEYS];

/// An instant Arc-to-Arc send. These never enter the CCTP bridge engine (no
/// burn, no attestation), so they live as local component state rather than a
/// BridgeRecord, mirroring the backend's one-shot /api/cashout/arc-send.
interface ArcSend {
  id: string;
  amountUsdc: string;
  recipient: string;
  status: 'sending' | 'done' | 'error';
  txHash?: string;
  error?: string;
}

function outPhaseLabel(
  phase: BridgePhase,
  dest: string,
  phases: Messages['bridgeOut']['phases'],
): string {
  switch (phase) {
    case 'approving':
    case 'burning':
      return phases.burning;
    case 'relaying':
    case 'attesting':
      return phases.waitingAttestation;
    case 'minting':
      return phases.mintingTemplate.replace('{dest}', dest);
    case 'done':
      return phases.done;
    case 'error':
      return phases.error;
    default:
      return phases.submitting;
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
  const t = useTranslations().bridgeOut;
  const auth = useAuth();
  const isCircle = auth.method === 'circle';
  const { bridges, startCircleOut, startWeb3Out, dismiss, isActive } = useBridges();
  const outBridges = bridges.filter((b) => b.direction === 'out');

  const [destKey, setDestKey] = useState<DestKey>('baseSepolia');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [recipient, setRecipient] = useState<string>(auth.address ?? '');
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetNote, setFaucetNote] = useState<string | null>(null);
  /// Instant Arc sends, newest first. Kept out of the CCTP engine on purpose.
  const [arcSends, setArcSends] = useState<ArcSend[]>([]);

  // Bridge-out spends the identity wallet's Arc USDC, so let the user top it up
  // here in one tap instead of hopping to the Wallets panel.
  async function runFaucet() {
    if (!auth.address) return;
    setFaucetBusy(true);
    setFaucetNote(null);
    try {
      await api.faucet(auth.address, 'identity');
      setFaucetNote(t.form.faucetSuccess);
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setFaucetNote(detail ?? (err as Error).message);
    } finally {
      setFaucetBusy(false);
    }
  }

  const isArcDest = destKey === 'arc';
  const destName = isArcDest ? 'Arc' : SOURCE_CHAINS[destKey].name;
  const destShort = isArcDest ? 'Arc' : SOURCE_CHAINS[destKey].shortName;
  const recipientValid = ADDRESS_RE.test(recipient.trim());
  const canSubmit =
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    recipientValid;

  /// Instant Arc-to-Arc send. One backend call, settles synchronously, so the
  /// UI shows a single "Cashed out" row with no bridge phases.
  async function runArcSend(amountUsdc: number, recipient: string) {
    const id = `arc-send-${Date.now()}`;
    setArcSends((l) => [
      { id, amountUsdc: String(amountUsdc), recipient, status: 'sending' },
      ...l,
    ]);
    try {
      const r = await api.cashoutArcSend({ recipient, amountUsdc });
      setArcSends((l) =>
        l.map((s) => (s.id === id ? { ...s, status: 'done', txHash: r.txHash } : s)),
      );
    } catch (err) {
      const detail =
        err instanceof ApiError && typeof err.detail === 'string'
          ? err.detail
          : (err as Error).message;
      setArcSends((l) =>
        l.map((s) => (s.id === id ? { ...s, status: 'error', error: detail } : s)),
      );
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !auth.address) return;
    const trimmed = recipient.trim() as `0x${string}`;
    // Arc destination is a same-chain send, not a bridge.
    if (destKey === 'arc') {
      runArcSend(amount as number, trimmed);
      setAmount('');
      return;
    }
    const args = {
      destChainKey: destKey,
      amountUsdc: amount as number,
      recipient: trimmed,
      userAddress: auth.address,
    };
    // Circle accounts burn on the backend from their DCW; web3 users sign the
    // Arc burn from their own wallet, then the backend relays the mint.
    if (isCircle) startCircleOut(args);
    else startWeb3Out(args);
    setAmount('');
  }

  return (
    <div style={CARD_STYLE} className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:{t.header.eyebrow}:]
        </span>
        <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          {t.header.title}
        </h2>
        <p className="mt-2 inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          <span>{t.header.subtitle}</span>
        </p>
      </div>

      <div className="px-6 pb-6">
        <form onSubmit={submit} className="space-y-5">
            {/* DESTINATION DROPDOWN */}
            <div className="relative">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:{t.form.destinationEyebrow}:]
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
                    {destName}
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
                  {DEST_KEYS.map((k) => (
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
                          {k === 'arc' ? 'Arc' : SOURCE_CHAINS[k].name}
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
                  [:{t.form.amountEyebrow}:]
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  {t.form.fromArcCaption}
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

            {/* TOP UP ARC USDC: Circle accounts burn from their identity DCW, so
                offer a one-tap top-up of that wallet. A web3 user burns from their
                own wallet, which they fund themselves, so this does not apply. */}
            {isCircle && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={runFaucet}
                  disabled={faucetBusy}
                  className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {faucetBusy ? t.form.faucetBusy : t.form.faucetCta}
                </button>
              </div>
            )}
            {isCircle && faucetNote && (
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
                [:{t.form.landsAtPrefix} {destShort.toUpperCase()}:]
              </span>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={t.form.recipientPlaceholder}
                spellCheck={false}
                className="mt-1.5 w-full bg-transparent text-[13px] mono tabular-nums focus:outline-none text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)]"
              />
              {recipient.trim() !== '' && !recipientValid && (
                <p className="mt-1 mono text-[10px] uppercase tracking-[0.1em] text-[#b03d3a]">
                  {t.form.addressInvalid}
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
              <span>{t.form.submitTemplate.replace('{dest}', destShort)}</span>
              <span aria-hidden className="inline-flex transition-transform group-hover:translate-x-0.5">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>

            <p className="text-[11px] leading-snug text-[var(--lp-text-muted)]">
              {t.reassurance}
            </p>
          </form>

        {(outBridges.length > 0 || arcSends.length > 0) && (
          <div className="mt-7 pt-5 border-t border-[var(--lp-border-light)]">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{t.activityEyebrow}:]
            </span>
            <ul className="mt-3.5 space-y-2">
              {arcSends.map((s) => (
                <ArcSendRow
                  key={s.id}
                  send={s}
                  onDismiss={() => setArcSends((l) => l.filter((x) => x.id !== s.id))}
                />
              ))}
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

/// Row for an instant Arc-to-Arc send. No phases to walk through: it is either
/// sending, cashed out, or failed. Mirrors OutRow's visual language but with an
/// Arc-to-Arc glyph and no CCTP phase steps.
function ArcSendRow({ send, onDismiss }: { send: ArcSend; onDismiss: () => void }) {
  const t = useTranslations().bridgeOut;
  const tone: 'live' | 'positive' | 'critical' =
    send.status === 'done' ? 'positive' : send.status === 'error' ? 'critical' : 'live';
  const rail = tone === 'positive' ? '#0a7553' : tone === 'critical' ? '#b03d3a' : 'var(--lp-accent)';
  const label =
    send.status === 'done' ? t.phases.done : send.status === 'error' ? t.phases.error : t.phases.burning;
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
          <ChainLogo chain="arc" size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-sans text-[16px] font-extrabold tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(send.amountUsdc, { withSuffix: false })}
            </span>
            <span className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none">
              USDC
            </span>
          </div>
          <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.14em] leading-none" style={{ color: rail }}>
            {label}
            {send.txHash && (
              <a
                href={ARC_TESTNET.explorerTx(send.txHash)}
                target="_blank"
                rel="noreferrer"
                className="ms-2 underline-offset-2 hover:underline text-[var(--lp-text-muted)]"
              >
                {shortHash(send.txHash)}
              </a>
            )}
          </p>
          {send.error && <p className="mt-1 text-[11px] leading-snug text-[#b03d3a]">{send.error}</p>}
        </div>
        {send.status !== 'sending' && (
          <button
            type="button"
            onClick={onDismiss}
            className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors shrink-0"
          >
            {t.dismissButton}
          </button>
        )}
      </div>
      <span className="sr-only">{t.srToRecipient.replace('{address}', shortAddress(send.recipient))}</span>
    </li>
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
  const t = useTranslations().bridgeOut;
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
            {outPhaseLabel(bridge.phase, dest.shortName, t.phases)}
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
            {t.dismissButton}
          </button>
        )}
      </div>
      <span className="sr-only">{t.srToRecipient.replace('{address}', shortAddress(bridge.mintRecipient))}</span>
    </li>
  );
}
