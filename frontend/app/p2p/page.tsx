'use client';

import { AuthGuard } from '@/shared/components/AuthGuard';
import { AccountGate } from '@/shared/components/AccountGate';
import { TradeDesk } from '@/features/home/components/TradeDesk';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';

export default function P2PHubPage() {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale];
  return (
    <AuthGuard gateTag={copy.title} gateBody={copy.body}>
      <AccountGate kind="person">
        <section className="product-surface w-full px-5 py-6 sm:px-8 sm:py-10 lg:px-12" aria-labelledby="trade-desk-heading">
          <TradeDesk />
        </section>
      </AccountGate>
    </AuthGuard>
  );
}
