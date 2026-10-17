'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { api } from '@/core/api';
import { Button } from '@/shared/components/Button';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// /connect/telegram: the page the Telegram bot sends someone who signs in to
/// Karwan with a wallet or a passkey. They sign in here and open Telegram from
/// a link made for their own session, so nobody can hand them a page that
/// links someone else's chat to their account.
export default function ConnectTelegramPage() {
  const copy = useTranslations().connectTelegram;
  const auth = useAuth();
  const { openConnectModal } = useConnectModal();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (!auth.address) return;
    setOpening(true);
    setError(null);
    try {
      const { deepLink } = await api.telegramLinkStart(auth.address);
      if (!deepLink) throw new Error('no deep link');
      window.location.href = deepLink;
    } catch {
      setError(copy.failed);
      setOpening(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100svh-var(--lp-nav-h,72px))] w-full items-center justify-center bg-[var(--canvas)] px-4 py-10">
      <div className="flex w-full max-w-[440px] flex-col gap-4">
        <h1 className="text-[28px] font-semibold text-[var(--ink)]">{copy.title}</h1>
        <p className="text-[16px] text-[var(--ink-secondary)]">{copy.body}</p>
        {auth.isAuthenticated ? (
          <Button size="lg" loading={opening} onClick={open}>
            {opening ? copy.linking : copy.link}
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={() => openConnectModal?.()}>
              {copy.connect}
            </Button>
            <Link href="/start" className="text-[15px] text-[var(--ink-secondary)] underline">
              {copy.signInEmail}
            </Link>
          </>
        )}
        {error && (
          <p role="alert" className="text-[15px] text-[var(--ink)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
