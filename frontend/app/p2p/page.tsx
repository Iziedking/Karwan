'use client';

import { AuthGuard } from '@/shared/components/AuthGuard';
import { AccountGate } from '@/shared/components/AccountGate';
import { TradeStart } from '@/features/home/components/TradeStart';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';

export default function P2PHubPage() {
  const { locale } = useLocale();
  const copy = TRADE_ENTRY_COPY[locale];
  return (
    <AuthGuard gateTag={copy.title} gateBody={copy.body}>
      <AccountGate kind="person">
        <section className="product-surface mx-auto w-full max-w-[760px] py-6 sm:py-10" aria-labelledby="trade-start-heading">
          <TradeStart headingId="trade-start-heading" />
        </section>
      </AccountGate>
    </AuthGuard>
  );
}
