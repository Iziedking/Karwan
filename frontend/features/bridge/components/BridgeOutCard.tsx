'use client';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind } from '@/shared/hooks/useAddressKind';
import { useBridges } from '../hooks/useBridge';
import { useHiddenActivityBridgeIds } from './BridgeCard';
import { BridgeActivityStrip } from './BridgeActivityStrip';
import { SOURCE_CHAINS, WITHDRAW_DEST_KEYS, type CctpChainKey } from '../config';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';
import { isTrustedRecipient } from './recipientSafety';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { Button } from '@/shared/components/Button';
import { FactsConfirmSheet } from '@/shared/components/FactsConfirmSheet';
import { fill } from '@/features/deals/workspace/presentation';
import { routeSpeed, stepForPhase } from '../routePlan';
import { TransferProgress } from './TransferProgress';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/// Cash-out destinations. A CCTP chain routes through the burn/mint bridge; Arc
/// is a same-chain send that settles instantly, so it gets its own path.
type DestKey = CctpChainKey | 'arc';
// Every non-Arc CCTP chain. Circle's Forwarding Service submits the destination
// mint, so no wallet is needed there and all eleven are reachable.
const DEST_KEYS: DestKey[] = ['arc', ...WITHDRAW_DEST_KEYS];

/// Bridge OUT (Arc -> chain). Sends the user's Arc USDC to another chain via
/// CCTP: backend burns from the identity DCW on Arc, relays the mint on the
/// destination (gas sponsored). Circle accounts only for now; web3 users sign
/// the Arc burn themselves, which is a follow-up.
export function BridgeOutCard({ prefillAmount, prefillRecipient }: { prefillAmount?: number; prefillRecipient?: string } = {}) {
  const msgs = useTranslations();
  const t = msgs.bridgeOut;
  const mp = msgs.moneyPage;
  const amountCopy = msgs.bridgeCard.amount;
  const verifyCopy = msgs.bridgeCard.recipient.verify;
  const auth = useAuth();
  const isCircle = auth.method === 'circle';
  const { connector } = useAccount();
  const { bridges, startCircleOut, startWeb3Out, startArcSend, startWeb3ArcSend, isActive, recheck } =
    useBridges();
  /// Activity is a temporary, per-device view: dismissing a row hides it from
  /// this panel only (a localStorage set), it never deletes the record from the
  /// shared store, so the permanent Transfer history keeps every transfer.
  const hidden = useHiddenActivityBridgeIds(auth.address ?? null);
  // All outbound records; the activity strip does the recency + hidden filter.
  const outBridges = bridges.filter((b) => b.direction === 'out');
  // True from the instant the user submits: startCircleOut/startWeb3Out push
  // the record before awaiting anything, so this flips synchronously with the
  // click. Without it the button stayed cold through the whole request and the
  // click read as "nothing happened".
  const sending = outBridges.some(
    (b) => b.phase === 'switching' || b.phase === 'approving' || b.phase === 'burning',
  );

  const [destKey, setDestKey] = useState<DestKey>(WITHDRAW_DEST_KEYS[0]);
  const [open, setOpen] = useState(false);
  // Withdraw's first screen hands over what was typed there (view 44, P8).
  const [amount, setAmount] = useState<number | ''>(prefillAmount ?? '');
  // A withdrawal must name its destination. Keep the owner wallet as an
  // explicit shortcut, never as the default, so Send cannot look like an
  // internal move back to the same account.
  const [recipient, setRecipient] = useState<string>(prefillRecipient?.trim() ?? '');
  // Every withdrawal asks once more before money moves, then follows its stops.
  const [reviewing, setReviewing] = useState(false);
  const [followFrom, setFollowFrom] = useState<number | null>(null);
  const followed = followFrom === null ? null : outBridges.find((b) => b.startedAt >= followFrom) ?? null;
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetNote, setFaucetNote] = useState<string | null>(null);
  /// The user's spendable Arc USDC (the identity wallet cash out draws from).
  /// Polled so a fresh top-up shows without a manual refresh.
  const [arcBalance, setArcBalance] = useState<string | null>(null);
  const [knownKarwanWallets, setKnownKarwanWallets] = useState<string[]>([]);
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
          if (!cancelled) {
            setArcBalance(r.identity.usdcBalance ?? '0');
            setKnownKarwanWallets([r.identity.address, r.agents?.buyer.address, r.agents?.seller.address].filter((a): a is string => !!a));
          }
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
  /// Check the recipient for typos and bytecode. The on-chain code check runs
  /// on Arc, so it only applies to the Arc destination (an address can be an
  /// EOA on Arc but a contract elsewhere); other chains fall back to a format
  /// check. The user's own address is trusted (no round-trip). A contract result
  /// stays visible as a warning because Circle SCAs are valid smart-wallet
  /// recipients. Only an address that is still being checked remains blocked.
  const recipientCheck = useAddressKind(recipient, {
    enabled: isArcDest && recipientValid,
    trustedAddresses: [auth.address, ...knownKarwanWallets],
  });
  const trustedRecipient = isTrustedRecipient(recipient, [auth.address, ...knownKarwanWallets]);
  const recipientBlocked =
    isArcDest && !trustedRecipient && recipientCheck.kind === 'checking';
  const displayRecipientKind = trustedRecipient ? 'eoa' : recipientCheck.kind;
  const canSubmit =
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    recipientValid &&
    !recipientBlocked;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) setReviewing(true);
  }

  function send() {
    if (!canSubmit || !auth.address) return;
    setReviewing(false);
    setFollowFrom(Date.now());
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
    // Circle accounts burn on the backend from their Arc DCW; web3 users sign the
    // Arc burn from their own wallet. Either way the burn goes through App Kit
    // with the Forwarding Service, so CIRCLE mints on the destination and no
    // wallet is needed there. That is what opens every chain as a destination.
    if (isCircle) startCircleOut(args);
    else
      startWeb3Out({
        ...args,
        getEvmProvider: () =>
          connector?.getProvider() ?? Promise.reject(new Error('Wallet provider unavailable')),
      });
    setAmount('');
  }

  const shown = typeof amount === 'number' ? formatUsdc(amount, { withSuffix: false }) : '';
  const label = 'text-[14px] font-medium text-[var(--ink-secondary)]';

  return (
    <div data-guide="bridge-out" className="flex flex-col">
      {followed ? (
        <TransferProgress
          direction="out"
          chainName={destName}
          signer={isCircle ? 'account' : 'wallet'}
          step={stepForPhase(followed.phase)}
          leftSource={!!followed.burnTxHash}
          startedAt={followed.startedAt}
          speed={routeSpeed(isArcDest ? 'arc' : 'cctpOut')}
          onCheckAgain={() => void recheck(followed.id)}
          onTryAgain={() => setFollowFrom(null)}
          onAnother={() => setFollowFrom(null)}
          onDone={() => setFollowFrom(null)}
        />
      ) : null}
      <form onSubmit={submit} hidden={!!followed} className="space-y-5">
        {/* AMOUNT */}
        <div className="rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className={label}>{t.form.amountEyebrow}</span>
            {arcBalance != null && Number(arcBalance) > 0 ? (
              <button
                type="button"
                onClick={() => setAmount(Number(arcBalance))}
                className="-my-2 inline-flex min-h-11 items-center text-[14px] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                title={amountCopy.maxTitle}
              >
                {amountCopy.balanceMaxTemplate.replace('{amount}', formatUsdc(arcBalance, { withSuffix: false }))}
              </button>
            ) : (
              <span className="text-[14px] text-[var(--ink-secondary)]">
                {amountCopy.balanceTemplate.replace('{amount}', arcBalance != null ? formatUsdc(arcBalance, { withSuffix: false }) : '0')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-label={t.form.amountEyebrow}
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="amount-input no-spinner min-w-0 flex-1 bg-transparent text-[28px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
              placeholder="0"
            />
            <span className="text-[15px] font-semibold text-[var(--ink-secondary)]">USDC</span>
          </div>
        </div>

        {/* A Circle account withdraws from its own Arc wallet; testnet can fill it here. */}
        {isCircle && ARC_NETWORK === 'testnet' && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={runFaucet}
              disabled={faucetBusy}
              className="inline-flex min-h-11 items-center text-[14px] text-[var(--ink-secondary)] underline-offset-2 hover:text-[var(--ink)] hover:underline disabled:opacity-50"
            >
              {faucetBusy ? t.form.faucetBusy : t.form.faucetCta}
            </button>
          </div>
        )}
        {isCircle && faucetNote && (
          <p role="status" className="border-s-2 border-[var(--line-strong)] ps-3 text-[14px] text-[var(--ink)]">{faucetNote}</p>
        )}

        {/* WHERE IT GOES */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="bridge-out-recipient" className={label}>{t.form.landsAtPrefix} {destShort}</label>
            {auth.address && (
              <button
                type="button"
                onClick={() => setRecipient(auth.address as string)}
                className="inline-flex min-h-11 items-center text-[14px] text-[var(--ink-secondary)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
              >
                {t.form.yourWallet}
              </button>
            )}
          </div>
          <input
            id="bridge-out-recipient"
            type="text"
            dir="ltr"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={t.form.recipientPlaceholder}
            spellCheck={false}
            className="form-input block w-full font-mono text-[15px]"
          />
          {recipient.trim() !== '' && !recipientValid && (
            <p role="alert" className="text-[14px] text-[var(--color-critical)]">{t.form.addressInvalid}</p>
          )}
          {isArcDest && recipientValid && displayRecipientKind !== 'idle' && (
            <RecipientVerifyPill kind={displayRecipientKind} copy={verifyCopy} />
          )}
        </div>

        {/* NETWORK */}
        <div className="relative space-y-2">
          <span className={label}>{mp.networkLabel}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <ChainLogo chain={destKey} size={22} />
              <span className="text-[15px] text-[var(--ink)]">{destName}</span>
            </span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className={`text-[var(--ink-secondary)] transition-transform ${open ? 'rotate-180' : ''}`}>
              <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {open && (
            <ul className="absolute z-20 start-0 end-0 mt-1 max-h-[300px] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-1.5">
              {DEST_KEYS.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    aria-pressed={k === destKey}
                    onClick={() => {
                      setDestKey(k);
                      setOpen(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-start hover:bg-[var(--raised)]"
                  >
                    <ChainLogo chain={k} size={20} />
                    <span className={`text-[15px] text-[var(--ink)] ${k === destKey ? 'font-semibold' : ''}`}>{k === 'arc' ? 'Arc' : SOURCE_CHAINS[k].name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="submit" size="lg" disabled={!canSubmit} loading={sending} loadingLabel={t.form.sending} className="w-full">
          {mp.review}
        </Button>
      </form>

      <FactsConfirmSheet
        open={reviewing}
        title={fill(mp.reviewTitle, { amount: shown })}
        note={mp.cannotUndo}
        rows={[
          [mp.toLabel, recipient.trim()],
          [mp.networkLabel, destName],
        ]}
        primaryLabel={fill(mp.withdrawCta, { amount: shown })}
        busyLabel={fill(mp.withdrawing, { amount: shown })}
        quietLabel={mp.notNow}
        busy={sending}
        onConfirm={send}
        onClose={() => setReviewing(false)}
      />

      {/* Temporary activity strip: in-flight + recently completed cash-outs,
          each with a tx link. Auto-clears finished rows; permanent record is
          in the page's Transfer history modal and the /activity feed. */}
      <BridgeActivityStrip records={outBridges} hidden={hidden} isActive={isActive} />
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
      ? { bg: 'var(--surface)', text: 'var(--ink)', border: 'var(--line-strong)' }
      : kind === 'contract' || kind === 'invalid'
        ? { bg: 'rgba(176, 61, 58, 0.10)', text: '#b03d3a', border: 'rgba(176, 61, 58, 0.30)' }
        : { bg: 'var(--surface)', text: 'var(--ink-secondary)', border: 'var(--line)' };
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
      className="inline-flex items-center gap-2 px-3 py-2 text-[14px]"
      style={{
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
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
