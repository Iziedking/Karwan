'use client';

import { useState } from 'react';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { lockRecoveryKey } from '../crypto';
import { passwordStrength } from '../strength';

/// One field: the recovery password. The browser makes a fresh recovery key,
/// locks it with the password and uploads only the locked copy. The key is
/// not kept anywhere on this device afterwards.
export function RecoveryPasswordStep({ walletAddress, onDone, headingLevel = 'h1' }: {
  walletAddress: string;
  onDone: () => void;
  headingLevel?: 'h1' | 'h2';
}) {
  const t = useTranslations().recovery.step;
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = passwordStrength(password);
  const Heading = headingLevel;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!strength.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const privateKey = generatePrivateKey();
      const locked = await lockRecoveryKey({ password, privateKey, walletAddress });
      await api.recoverySetup({ recoveryAddress: privateKeyToAccount(privateKey).address, ...locked });
      setPassword('');
      onDone();
    } catch {
      setError(t.failed);
      setBusy(false);
    }
  }

  const hint = password.length === 0 ? t.tip : strength.ok ? null : t.weak[strength.reason!];

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Heading className="text-[22px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[26px]">{t.title}</Heading>
        <p className="mt-2 text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.body}</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.label}</span>
        <span className="flex min-h-12 sm:min-h-[52px] items-center rounded-[12px] border border-[var(--lp-outline-strong)] focus-within:ring-2 focus-within:ring-[var(--lp-accent)]">
          <input type={visible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" disabled={busy} autoFocus aria-describedby="recovery-password-hint"
            className="h-[46px] w-full bg-transparent px-4 text-[16px] sm:h-[50px] text-[var(--lp-dark)] outline-none" />
          <button type="button" onClick={() => setVisible((v) => !v)}
            className="me-2 min-h-11 shrink-0 px-2 text-[14px] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]">
            {visible ? t.hide : t.show}
          </button>
        </span>
        <span id="recovery-password-hint" aria-live="polite" className="block min-h-5 text-[14px] text-[var(--lp-text-sub)] font-medium">{hint}</span>
      </label>
      <button type="submit" disabled={!strength.ok || busy}
        className="inline-flex min-h-12 sm:min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? t.saving : t.save}
      </button>
      <button type="button" onClick={onDone} disabled={busy}
        className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)] disabled:opacity-50">
        {t.skip}
      </button>
      {error && <p role="alert" className="border-s-2 border-[var(--neg)] ps-3 text-[14px] text-[var(--lp-critical)]">{error}</p>}
    </form>
  );
}
