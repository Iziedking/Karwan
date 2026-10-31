'use client';

import { TelegramConnectButton, TelegramGlyph } from '@/features/telegram/components/TelegramConnectButton';
import { useTelegramLink } from '@/features/telegram/hooks/useTelegramLink';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Home on a wide screen invites the person to run their agent from Telegram
/// (view 44, D5) until it is linked. Phones reach it from Profile.
export function HomeTelegramCard() {
  const messages = useTranslations();
  const me = useAuth().address ?? undefined;
  const { status } = useTelegramLink(me);
  if (!status || !status.enabled || status.linked) return null;
  return (
    <section data-home-telegram aria-labelledby="home-telegram-heading" className="hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 lg:block">
      <div className="flex items-center gap-2.5">
        <TelegramGlyph size={24} />
        <h2 id="home-telegram-heading" className="text-[17px] font-semibold text-[var(--lp-dark)]">{messages.telegramConnect.button.brand}</h2>
      </div>
      <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{messages.firstTrade.steps.telegram.note}</p>
      <div className="mt-4">
        <TelegramConnectButton address={me} tone="light" />
      </div>
    </section>
  );
}
