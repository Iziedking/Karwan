'use client';

import { useEffect, useId, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits, type Hex } from 'viem';
import { api } from '@/core/api';
import { PASSKEY_CONNECTOR_ID } from '@/features/modularWallet/connector';
import { useAuth } from '@/shared/hooks/useAuth';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { RECOVERY_ON } from '../flag';
import { useRecoveryStatus } from '../useRecoveryStatus';
import { unlockRecoveryKey, WrongPasswordError } from '../crypto';
import { RecoveryPasswordStep } from './RecoveryPasswordStep';

type Sheet = null | 'setup' | 'turnOn';

/// The recovery section on the wallet page. One state at a time: set a
/// password, turn recovery on, on, or a recovery in progress with a cancel.
export function RecoveryRow() {
  const { connector } = useAccount();
  const auth = useAuth();
  const enabled = RECOVERY_ON && connector?.id === PASSKEY_CONNECTOR_ID && !!auth.address;
  const { status, refresh } = useRecoveryStatus(enabled);
  const t = useTranslations().recovery.row;
  const { locale } = useLocale();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  if (!enabled || !status || !auth.address) return null;

  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  async function cancel() {
    setCancelBusy(true);
    try {
      await api.recoveryCancel();
      setCancelled(true);
      await refresh();
    } finally {
      setCancelBusy(false);
    }
  }

  let title: string;
  let body: string | null = null;
  let action: React.ReactNode = null;
  if (status.request) {
    title = t.waiting;
    body = t.waitingBody.replace('{date}', when(status.request.releasableAt));
    action = <SecondaryButton onClick={() => void cancel()} disabled={cancelBusy}>{cancelBusy ? t.cancelling : t.cancel}</SecondaryButton>;
  } else if (!status.backup) {
    title = t.setUp;
    body = t.setUpBody;
    action = <SecondaryButton onClick={() => setSheet('setup')}>{t.setUp}</SecondaryButton>;
  } else if (!status.onchain) {
    title = t.off;
    body = t.offBody;
    action = <SecondaryButton onClick={() => setSheet('turnOn')}>{t.turnOn}</SecondaryButton>;
  } else {
    title = t.on;
    body = t.onBody;
  }

  return (
    <section id="recovery" aria-labelledby="recovery-heading" className="mt-6 border-t border-[var(--lp-border-light)] pt-5">
      <h3 id="recovery-heading" className="text-[13px] font-semibold text-[var(--lp-text-muted)]">{t.title}</h3>
      <p className="mt-1.5 text-[15px] font-bold text-[var(--lp-dark)]">{cancelled && !status.request ? t.cancelled : title}</p>
      {body && !(cancelled && !status.request) && <p className="mt-1 text-[13px] leading-5 text-[var(--lp-text-sub)]">{body}</p>}
      {action && <div className="mt-3">{action}</div>}

      <SetupSheet open={sheet === 'setup'} walletAddress={auth.address}
        onClose={() => setSheet(null)} onDone={() => { setSheet(null); void refresh(); }} />
      <TurnOnSheet open={sheet === 'turnOn'} walletAddress={auth.address as Hex}
        onClose={() => setSheet(null)} onDone={() => void refresh()} />
    </section>
  );
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props}
      className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[var(--lp-outline-strong)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:opacity-50" />
  );
}

function SetupSheet({ open, walletAddress, onClose, onDone }: { open: boolean; walletAddress: string; onClose: () => void; onDone: () => void }) {
  const id = useId();
  return (
    <ConfirmSheetShell open={open} labelledBy={id} busy={false} onClose={onClose}>
      <div id={id}>
        <RecoveryPasswordStep walletAddress={walletAddress} onDone={onDone} headingLevel="h2" />
      </div>
    </ConfirmSheetShell>
  );
}

type TurnOnState = 'loading' | 'ready' | 'low' | 'working' | 'done';

function TurnOnSheet({ open, walletAddress, onClose, onDone }: { open: boolean; walletAddress: Hex; onClose: () => void; onDone: () => void }) {
  const t = useTranslations().recovery.sheet;
  const row = useTranslations().recovery.row;
  const headingId = useId();
  const [state, setState] = useState<TurnOnState>('loading');
  const [fee, setFee] = useState<bigint | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Each time the sheet opens: price the switch-on step and check the balance
  // covers the most it can take.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setState('loading');
    setFee(null);
    setPassword('');
    setError(null);
    void (async () => {
      try {
        const [{ estimateRegisterFee, walletBalanceWei }, { storedPasskey }, own] = await Promise.all([
          import('@/features/modularWallet/recovery'),
          import('@/features/modularWallet/passkey'),
          api.recoveryOwnBackup(),
        ]);
        const passkey = storedPasskey();
        if (!passkey) throw new Error('no passkey on this device');
        const [maxFee, balance] = await Promise.all([
          estimateRegisterFee(passkey, own.recoveryAddress as Hex),
          walletBalanceWei(walletAddress),
        ]);
        if (!live) return;
        setFee(maxFee);
        setState(balance < maxFee ? 'low' : 'ready');
      } catch {
        if (!live) return;
        setError(t.failed);
        setState('ready');
      }
    })();
    return () => {
      live = false;
    };
  }, [open, walletAddress, t.failed]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (state !== 'ready' || !password) return;
    setState('working');
    setError(null);
    try {
      const [{ registerRecoveryOnchain, proveRecoveryOwner }, { storedPasskey }] = await Promise.all([
        import('@/features/modularWallet/recovery'),
        import('@/features/modularWallet/passkey'),
      ]);
      const own = await api.recoveryOwnBackup();
      const key = await unlockRecoveryKey({ password, walletAddress, kdf: own.kdf, iv: own.iv, blob: own.blob });
      const passkey = storedPasskey();
      if (!passkey) throw new Error('no passkey on this device');
      await registerRecoveryOnchain(passkey, own.recoveryAddress as Hex);
      const proof = await proveRecoveryOwner(key);
      await api.recoveryRegistered(proof.message, proof.signature);
      setPassword('');
      setState('done');
      onDone();
    } catch (err) {
      setError(err instanceof WrongPasswordError ? t.wrong : t.failed);
      setState('ready');
    }
  }

  const feeText = fee === null ? null : t.feeValue.replace('{amount}', Number(formatUnits(fee, 18)).toFixed(3));

  return (
    <ConfirmSheetShell open={open} labelledBy={headingId} busy={state === 'working'} onClose={onClose}>
      <h2 id={headingId} className="text-[22px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">{state === 'done' ? t.done : t.title}</h2>
      {state === 'done' ? (
        <button type="button" onClick={onClose}
          className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-[12px] border border-[var(--lp-outline-strong)] text-[15px] font-semibold text-[var(--lp-dark)]">
          {t.close}
        </button>
      ) : (
        <form onSubmit={confirm} className="mt-3 space-y-5">
          <p className="text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{t.what}</p>
          <dl className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)] text-[14px]">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-[var(--lp-text-sub)]">{t.fee}</dt>
              <dd className="mono font-semibold text-[var(--lp-dark)]">{feeText ?? ' '}</dd>
            </div>
          </dl>
          <p className="text-[13px] text-[var(--lp-text-sub)]">{t.undo}</p>
          {state === 'low' ? (
            <p role="status" className="text-[14px] font-semibold text-[var(--lp-dark)]">{row.lowBalance}</p>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.password}</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                disabled={state !== 'ready'} className="form-input min-h-[52px]" />
            </label>
          )}
          <button type="submit" disabled={state !== 'ready' || !password}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50">
            {state === 'working' ? t.working : t.confirm}
          </button>
          {error && <p role="alert" className="border-s-2 border-[var(--neg)] ps-3 text-[14px] text-[var(--lp-critical)]">{error}</p>}
        </form>
      )}
    </ConfirmSheetShell>
  );
}
