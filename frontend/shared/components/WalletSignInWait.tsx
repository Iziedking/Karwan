'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { Button } from '@/shared/components/Button';
import { waitingOnWallet } from '@/shared/auth/authPresentation';
import { useSiweStatus } from '@/shared/auth/siweState';
import { useSiwe } from '@/shared/hooks/useSiwe';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { walletWaitCopy } from '@/shared/i18n/messages/walletWait';

/// While a signed-in page waits on the person's wallet, it says what it is
/// waiting for and offers a way on, instead of a skeleton that never ends
/// (17 Nov). Anything else shows the `fallback` the page already had.
export function WalletSignInWait({ fallback }: { fallback: ReactNode }) {
  const { address } = useAccount();
  const siwe = useSiweStatus();
  if (!waitingOnWallet(siwe, address)) return <>{fallback}</>;
  return <WalletNote network={siwe.phase === 'switching-network'} />;
}

function WalletNote({ network }: { network: boolean }) {
  const { locale } = useLocale();
  const copy = walletWaitCopy[locale] ?? walletWaitCopy.en;
  const { promptSign } = useSiwe();
  const { disconnectAsync } = useDisconnect();
  const [busy, setBusy] = useState<'again' | 'other' | null>(null);
  const run = (which: 'again' | 'other', step: () => Promise<unknown>) => {
    setBusy(which);
    void step().catch(() => undefined).finally(() => setBusy(null));
  };
  return (
    <section data-wallet-wait role="status" className="product-surface mx-auto w-full max-w-[560px] py-8 sm:py-12">
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{copy.title}</h1>
      <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">{network ? copy.network : copy.body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" loading={busy === 'again'} onClick={() => run('again', promptSign)} className="rounded-full">{copy.again}</Button>
        <Button type="button" variant="ghost" loading={busy === 'other'} onClick={() => run('other', () => disconnectAsync())} className="rounded-full">{copy.other}</Button>
      </div>
    </section>
  );
}
