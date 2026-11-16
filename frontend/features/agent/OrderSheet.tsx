'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { api, type StandingOrder } from '@/core/api';
import { MoneyInput } from '@/features/money/components/MoneyInput';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Hint } from '@/shared/components/Hint';
import type { AgentOrdersCopy } from '@/shared/i18n/messages/agentOrders';
import { EMPTY_DRAFT, NEED_MAX, PER_DAY_CHOICES, UNTIL_CHOICES, canStart, changeBody, startBody, untilAt, type OrderDraft } from './orders';

type Typed = { currency: string; amount: string } | null;

const label = 'block text-[14px] font-semibold text-[var(--ink)]';
const field = 'form-input mt-1.5 w-full';
const primary = 'min-h-12 rounded-full bg-[var(--karwan-green)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40';
const quiet = 'min-h-12 rounded-full border border-[var(--line)] px-5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--raised)] disabled:opacity-40';
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));

/// One choice on its own row: the name on the left, the picker at the end.
function Pick({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex min-h-[52px] items-center justify-between gap-3 px-4">
      <span className="min-w-0 font-medium text-[var(--ink)]">{name}</span>
      {children}
    </label>
  );
}
const picker = 'min-h-11 max-w-[60%] rounded-lg bg-transparent text-end text-[14px] font-medium text-[var(--ink-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const group = 'divide-y divide-[var(--line)] overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] text-[15px]';

/// A new standing order (view 87, step 4). Starting it is the consent for the
/// agent to post the need privately and ask people for it; it moves no money.
export function NewOrderSheet({ copy, date, onClose, onStarted }: {
  copy: AgentOrdersCopy;
  date: (at: number) => string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const titleId = useId();
  const needId = useId();
  const mostId = useId();
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT);
  const typed = useRef<Typed>(null);
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const buying = draft.side === 'buy';
  const set = (patch: Partial<OrderDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function start() {
    if (!canStart(draft) || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api.startStandingOrder(startBody(draft, typed.current));
      onStarted();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmSheetShell open labelledBy={titleId} busy={busy} onClose={onClose}>
      <div data-order-sheet="new">
        <h2 id={titleId} className="flex items-center gap-2 text-[20px] font-semibold text-[var(--ink)]">
          {copy.newOrder}
          <Hint>{copy.note}</Hint>
        </h2>
        <div className="mt-5 space-y-4">
          <label htmlFor={needId} className={label}>
            {buying ? copy.find : copy.sell}
            <input id={needId} type="text" value={draft.need} maxLength={NEED_MAX} disabled={busy} onChange={(e) => set({ need: e.target.value })} className={field} />
          </label>
          {buying ? (
            <label htmlFor={mostId} className={label}>
              {copy.most}
              <MoneyInput id={mostId} value={draft.budgetUsdc} onTyped={(said) => { typed.current = said; }} onChange={(usdc) => set({ budgetUsdc: usdc })} disabled={busy} className="form-input form-input-num mt-1.5 w-full" />
            </label>
          ) : null}
        </div>
        <div className={`mt-5 ${group}`}>
          <Pick name={copy.side}>
            <select value={draft.side} disabled={busy} onChange={(e) => set({ side: e.target.value as OrderDraft['side'] })} className={picker}>
              <option value="buy">{copy.sides.buy}</option>
              <option value="sell">{copy.sides.sell}</option>
            </select>
          </Pick>
          <Pick name={copy.reaches}>
            <select value={draft.kind} disabled={busy} onChange={(e) => set({ kind: e.target.value as OrderDraft['kind'] })} className={picker}>
              <option value="goods">{copy.kinds.goods}</option>
              <option value="in_person">{copy.kinds.in_person}</option>
              <option value="remote">{copy.kinds.remote}</option>
            </select>
          </Pick>
          <Pick name={copy.until}>
            <select value={draft.untilDays} disabled={busy} onChange={(e) => set({ untilDays: Number(e.target.value) })} className={picker}>
              {UNTIL_CHOICES.map((days) => (
                <option key={days} value={days}>{days === 0 ? copy.untilStop : date(untilAt(days, now)!)}</option>
              ))}
            </select>
          </Pick>
          <Pick name={copy.perDay}>
            <select value={draft.perDay} disabled={busy} onChange={(e) => set({ perDay: Number(e.target.value) })} className={`${picker} tabular-nums`}>
              {PER_DAY_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Pick>
        </div>
        {failed ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{copy.failed}</p> : null}
        <div className="mt-5 grid gap-2">
          <button type="button" disabled={!canStart(draft) || busy} onClick={() => void start()} className={primary}>{copy.start}</button>
          <button type="button" disabled={busy} onClick={onClose} className={quiet}>{copy.notNow}</button>
        </div>
      </div>
    </ConfirmSheetShell>
  );
}

/// One order, opened: what it did, its limits, and pausing or stopping it.
export function OrderSheet({ order, copy, date, onClose, onChanged }: {
  order: StandingOrder;
  copy: AgentOrdersCopy;
  date: (at: number) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const mostId = useId();
  const live = order.state === 'on' || order.state === 'paused';
  const [budget, setBudget] = useState<number | null>(order.budgetUsdc === null ? null : Number(order.budgetUsdc));
  const [perDay, setPerDay] = useState(order.perDay);
  /// 'keep' leaves the date the order has.
  const [until, setUntil] = useState<'keep' | number>('keep');
  const typed = useRef<Typed>(null);
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const change = live ? changeBody(order, { budgetUsdc: budget, perDay, untilDays: until === 'keep' ? undefined : until }, typed.current) : null;

  async function send(body: Parameters<typeof api.changeStandingOrder>[1]) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api.changeStandingOrder(order.id, body);
      onChanged();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmSheetShell open labelledBy={titleId} busy={busy} onClose={onClose}>
      <div data-order-sheet="one">
        <h2 id={titleId} className="break-words text-[20px] font-semibold text-[var(--ink)]">{order.need}</h2>
        <dl className={`mt-5 ${group}`}>
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
            <dt className="font-medium text-[var(--ink)]">{copy.askedTodayLabel}</dt>
            <dd className="text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{order.askedToday}</dd>
          </div>
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
            <dt className="font-medium text-[var(--ink)]">{copy.thisWeek}</dt>
            <dd className="text-end text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{fill(copy.weekLine, { asked: order.week.asked, offers: order.week.offers })}</dd>
          </div>
        </dl>
        {live ? (
          <>
            {order.side === 'buy' ? (
              <label htmlFor={mostId} className={`mt-5 ${label}`}>
                {copy.most}
                <MoneyInput
                  id={mostId}
                  value={budget}
                  agreed={order.said ? { currency: order.said.currency, amount: String(order.said.amount) } : null}
                  onTyped={(said) => { typed.current = said; }}
                  onChange={setBudget}
                  disabled={busy}
                  className="form-input form-input-num mt-1.5 w-full"
                />
              </label>
            ) : null}
            <div className={`mt-5 ${group}`}>
              <Pick name={copy.until}>
                <select value={until} disabled={busy} onChange={(e) => setUntil(e.target.value === 'keep' ? 'keep' : Number(e.target.value))} className={picker}>
                  <option value="keep">{order.until === null ? copy.untilStop : date(order.until)}</option>
                  {UNTIL_CHOICES.filter((days) => days !== 0 || order.until !== null).map((days) => (
                    <option key={days} value={days}>{days === 0 ? copy.untilStop : date(untilAt(days, now)!)}</option>
                  ))}
                </select>
              </Pick>
              <Pick name={copy.perDay}>
                <select value={perDay} disabled={busy} onChange={(e) => setPerDay(Number(e.target.value))} className={`${picker} tabular-nums`}>
                  {PER_DAY_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Pick>
            </div>
          </>
        ) : null}
        {failed ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{copy.failed}</p> : null}
        <div className="mt-5 grid gap-2">
          {change ? <button type="button" disabled={busy} onClick={() => void send(change)} className={primary}>{copy.save}</button> : null}
          {live ? (
            <button type="button" disabled={busy} onClick={() => void send({ action: order.state === 'paused' ? 'resume' : 'pause' })} className={change ? quiet : primary}>
              {order.state === 'paused' ? copy.resume : copy.pause}
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void send({ action: 'stop' })} className={quiet}>{copy.stop}</button>
        </div>
      </div>
    </ConfirmSheetShell>
  );
}
