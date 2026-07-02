'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind } from '@/shared/hooks/useAddressKind';
import { useBridges } from '../hooks/useBridge';
import { useHiddenActivityBridgeIds } from './BridgeCard';
import { BridgeActivityStrip } from './BridgeActivityStrip';
import { SOURCE_CHAINS, SOURCE_CHAIN_KEYS, type CctpChainKey } from '../config';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { formatUsdc } from '@/shared/utils/format';
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

/// Bridge OUT (Arc -> chain). Sends the user's Arc USDC to another chain via
/// CCTP: backend burns from the identity DCW on Arc, relays the mint on the
/// destination (gas sponsored). Circle accounts only for now; web3 users sign
/// the Arc burn themselves, which is a follow-up.
export function BridgeOutCard() {
  const msgs = useTranslations();
  const t = msgs.bridgeOut;
  const amountCopy = msgs.bridgeCard.amount;
  const verifyCopy = msgs.bridgeCard.recipient.verify;
  const auth = useAuth();
  const isCircle = auth.method === 'circle';
  const { bridges, startCircleOut, startWeb3Out, startArcSend, startWeb3ArcSend, isActive } =
    useBridges();
  /// Activity is a temporary, per-device view: dismissing a row hides it from
  /// this panel only (a localStorage set), it never deletes the record from the
  /// shared store, so the permanent Transfer history keeps every transfer.
  const hidden = useHiddenActivityBridgeIds(auth.address ?? null);
  // All outbound records; the activity strip does the recency + hidden filter.
  const outBridges = bridges.filter((b) => b.direction === 'out');

  const [destKey, setDestKey] = useState<DestKey>('arc');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [recipient, setRecipient] = useState<string>(auth.address ?? '');
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetNote, setFaucetNote] = useState<string | null>(null);
  /// The user's spendable Arc USDC (the identity wallet cash out draws from).
  /// Polled so a fresh top-up shows without a manual refresh.
  const [arcBalance, setArcBalance] = useState<string | null>(null);
  useEffect(() => {
    if (!auth.address) {
      setArcBalance(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      api
        .walletOverview(auth.address as string)
        .then((r) => {
          if (!cancelled) setArcBalance(r.identity.usdcBalance ?? '0');
        })
        .catch(() => {
          /* keep the prior value; the field shows 0 until the first read */
        });
    };
    load();
    // Poll every 5s so a fresh faucet claim reflects without a page refresh.
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [auth.address]);

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
  /// Guard the recipient against contract addresses and typos. The on-chain
  /// code check runs on Arc, so it only applies to the Arc destination (an
  /// address can be an EOA on Arc but a contract elsewhere); other chains fall
  /// back to a format check. The user's own address is trusted (no round-trip).
  const recipientCheck = useAddressKind(recipient, {
    enabled: isArcDest && recipientValid,
    trustedAddresses: [auth.address],
  });
  const recipientBlocked =
    isArcDest && (recipientCheck.kind === 'contract' || recipientCheck.kind === 'checking');
  const canSubmit =
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    recipientValid &&
    !recipientBlocked;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !auth.address) return;
    const trimmed = recipient.trim() as `0x${string}`;
    // Arc destination is a same-chain send, not a bridge. Circle accounts move
    // it custodially from their DCW; web3 users sign the transfer from their own
    // Arc wallet (the custodial path rejects them, since they have no DCW).
    if (destKey === 'arc') {
      const arcArgs = { amountUsdc: amount as number, recipient: trimmed, userAddress: auth.address };
      if (isCircle) startArcSend(arcArgs);
      else startWeb3ArcSend(arcArgs);
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
                  className="absolute z-20 start-0 end-0 mt-2 p-1.5 fade-up max-h-[300px] overflow-y-auto"
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
                {arcBalance != null && Number(arcBalance) > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAmount(Number(arcBalance))}
                    className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                    title={amountCopy.maxTitle}
                  >
                    {amountCopy.balanceMaxTemplate.replace('{amount}', formatUsdc(arcBalance, { withSuffix: false }))}
                  </button>
                ) : (
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    {amountCopy.balanceTemplate.replace(
                      '{amount}',
                      arcBalance != null ? formatUsdc(arcBalance, { withSuffix: false }) : '0',
                    )}
                  </span>
                )}
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
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  [:{t.form.landsAtPrefix} {destShort.toUpperCase()}:]
                </span>
                {auth.address && (
                  <button
                    type="button"
                    onClick={() => setRecipient(auth.address as string)}
                    className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline-offset-2 hover:underline transition-colors"
                  >
                    {t.form.yourWallet}
                  </button>
                )}
              </div>
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
              {isArcDest && recipientValid && recipientCheck.kind !== 'idle' && (
                <div className="mt-2">
                  <RecipientVerifyPill kind={recipientCheck.kind} copy={verifyCopy} />
                </div>
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

        {/* Temporary activity strip: in-flight + recently completed cash-outs,
            each with a tx link. Auto-clears finished rows; permanent record is
            in the page's Transfer history modal and the /activity feed. */}
        <BridgeActivityStrip records={outBridges} hidden={hidden} isActive={isActive} />
      </div>
    </div>
  );
}

/// Inline EOA/contract check for the pasted recipient, mirroring the Add money
/// recipient guard. Reuses the shared bridgeCard verify strings.
function RecipientVerifyPill({
  kind,
  copy,
}: {
  kind: 'idle' | 'invalid' | 'checking' | 'eoa' | 'contract';
  copy: Messages['bridgeCard']['recipient']['verify'];
}) {
  if (kind === 'idle') return null;
  const tone =
    kind === 'eoa'
      ? { bg: 'rgba(10, 117, 83, 0.10)', text: '#0a7553', border: 'rgba(10, 117, 83, 0.30)' }
      : kind === 'contract' || kind === 'invalid'
        ? { bg: 'rgba(176, 61, 58, 0.10)', text: '#b03d3a', border: 'rgba(176, 61, 58, 0.30)' }
        : { bg: 'var(--lp-card)', text: 'var(--lp-text-sub)', border: 'var(--lp-border-light)' };
  const label =
    kind === 'checking'
      ? copy.checking
      : kind === 'eoa'
        ? copy.verifiedEoa
        : kind === 'contract'
          ? copy.contractDanger
          : copy.invalid;
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 text-[11.5px] mono"
      style={{
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
      }}
    >
      <span
        aria-hidden
        className={
          kind === 'checking'
            ? 'inline-block w-[6px] h-[6px] rounded-full animate-pulse motion-reduce:animate-none'
            : 'inline-block w-[6px] h-[6px]'
        }
        style={{ background: tone.text, borderRadius: kind === 'checking' ? 999 : 1 }}
      />
      {label}
    </div>
  );
}
