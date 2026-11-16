'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type StandingOrder } from '@/core/api';
import type { DisplayCurrency } from '@/features/money/displayCurrency';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { currencySign } from '@/features/money/localAmount';
import { Row, RowGroup } from '@/features/profile/ui/ProfileUi';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { agentOrdersCopy } from '@/shared/i18n/messages/agentOrders';
import { NewOrderSheet, OrderSheet } from './OrderSheet';
import { ORDERS_KEY, canAdd, dayText, orderRows } from './orders';

/// Standing orders on Your agent (view 87, step 4): what the agent was told to
/// work every day, each with what it did today. A row opens the order; the
/// last row adds one.
export function StandingOrders({ city, idle }: { city: string | null; idle: boolean }) {
  const { locale } = useLocale();
  const copy = agentOrdersCopy[locale] ?? agentOrdersCopy.en;
  const mt = useMoneyText();
  const client = useQueryClient();
  const read = useQuery({ queryKey: ORDERS_KEY, queryFn: api.standingOrders, retry: false, staleTime: 30_000 });
  const [open, setOpen] = useState<string | 'new' | null>(null);
  if (!read.data) return null;

  const { orders, max, working } = read.data;
  const date = (at: number) => dayText(at, locale);
  const amount = (o: Pick<StandingOrder, 'budgetUsdc' | 'said'>) =>
    o.said ? `${currencySign(o.said.currency as DisplayCurrency, locale)}${o.said.amount.toLocaleString(locale)}` : mt.text(Number(o.budgetUsdc ?? 0));
  const rows = orderRows(orders, copy, { amount, date, city, comma: locale === 'ar' ? '، ' : ', ' });
  const opened = open && open !== 'new' ? orders.find((o) => o.id === open) ?? null : null;
  const reread = () => void client.invalidateQueries({ queryKey: ORDERS_KEY });

  return (
    <div data-standing-orders>
      <div className={idle ? 'opacity-50' : undefined}>
        <RowGroup title={copy.title} hint={copy.note}>
          {rows.map((row) => (
            <Row
              key={row.id}
              label={<span className="block"><span className="block break-words">{row.title}</span><span className="block text-[14px] font-medium text-[var(--ink-secondary)]">{row.line}</span></span>}
              value={row.value}
              onClick={() => setOpen(row.id)}
            />
          ))}
          {canAdd(orders, max) ? <Row label={copy.add} onClick={() => setOpen('new')} /> : null}
        </RowGroup>
      </div>
      {!working && orders.length > 0 ? <p data-orders-resting className="mt-2 px-4 text-[14px] font-medium text-[var(--ink-secondary)]">{copy.resting}</p> : null}
      {open === 'new' ? <NewOrderSheet copy={copy} date={date} onClose={() => setOpen(null)} onStarted={reread} /> : null}
      {opened ? <OrderSheet key={opened.id} order={opened} copy={copy} date={date} onClose={() => setOpen(null)} onChanged={reread} /> : null}
    </div>
  );
}
