import { tool } from 'ai';
import { z } from 'zod';
import { liveCount, MAX_ORDERS, ORDER_DAYS_MAX, ORDER_NEED_MAX, PER_DAY_MAX, validateOrder, type OrderInput, type StandingOrder } from '../find/orders.js';
import { prohibitedReason } from '../policy/prohibited.js';
import { DISPLAY_CURRENCIES, type LocalCurrency } from '../rates/usdcRates.js';
import { confirmNonce, hasEquivalentConfirm, type AssistantAction, type ConfirmActionBase } from './actions.js';

/// Standing orders from any channel (view 87, step 4): the person tells their
/// agent once what to find, and it works that every day. Each change is a card
/// the person confirms; the payload is the body the page sends. Nothing here
/// moves money.

export interface StartStandingOrderConfirm extends ConfirmActionBase {
  intent: 'start_standing_order';
  payload: { side: 'buy' | 'sell'; need: string; budgetUsdc: number | null; said?: { currency: LocalCurrency; amount: number }; kind: 'goods' | 'in_person' | 'remote'; perDay: number; untilDays?: number };
}
export interface ChangeStandingOrderConfirm extends ConfirmActionBase {
  intent: 'change_standing_order';
  payload: { id: string; action: 'pause' | 'resume' | 'stop' };
}
export type OrderStepConfirm = StartStandingOrderConfirm | ChangeStandingOrderConfirm;

export interface OrderToolDeps {
  orders: (address: string, now: number) => Promise<StandingOrder[]>;
  /// Whether the person's agent finds people right now.
  working: (address: string) => Promise<boolean>;
  /// A USDC figure as this person reads it ("₦45,000"), or "45 USDC".
  money: (address: string, usdc: number) => Promise<string>;
  now: () => number;
}

const DAY_MS = 86_400_000;
const LOCAL = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC') as [LocalCurrency, ...LocalCurrency[]];
const short = (text: string) => (text.length > 140 ? `${text.slice(0, 137)}…` : text);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/// "Fri 20 Nov".
function dayWords(at: number): string {
  const d = new Date(at);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const STATE_WORDS: Record<StandingOrder['state'], string> = { on: 'running', paused: 'paused', done: 'done, a deal is locked', ended: 'ended on its date' };

export function buildStartStandingOrderConfirm(i: {
  input: OrderInput;
  untilDays?: number;
  budget: string | null;
  working: boolean;
  now: number;
}): StartStandingOrderConfirm | { error: string } {
  const buying = i.input.side === 'buy';
  const perDay = i.input.perDay ?? PER_DAY_MAX;
  return {
    kind: 'confirm',
    id: `start_standing_order:${confirmNonce()}`,
    intent: 'start_standing_order',
    title: 'Start a standing order',
    summary: [
      buying
        ? 'Your agent posts this privately and asks the best people each day until one is agreed. It moves no money: locking still follows your own settings.'
        : 'Your agent offers your work each day to buyers who need it regularly, at your usual price. It moves no money.',
      i.working ? null : 'Your agent is not finding people right now, so the order waits until it is.',
    ].filter(Boolean).join(' '),
    fields: [
      { label: buying ? 'What it should find' : 'What it should sell', value: short(i.input.need.trim()) },
      ...(buying && i.budget ? [{ label: 'The most for one', value: i.budget }] : []),
      { label: 'Until', value: i.untilDays ? dayWords(i.now + i.untilDays * DAY_MS) : 'You stop it' },
      { label: 'People a day', value: `Up to ${perDay}` },
    ],
    payload: {
      side: i.input.side, need: i.input.need.trim(), budgetUsdc: buying ? i.input.budgetUsdc ?? null : null,
      ...(buying && i.input.said ? { said: i.input.said } : {}), kind: i.input.kind, perDay, ...(i.untilDays ? { untilDays: i.untilDays } : {}),
    },
    confirmLabel: 'Start the order',
    cancelLabel: 'Not now',
  };
}

export function buildChangeStandingOrderConfirm(i: { id: string; need: string; action: 'pause' | 'resume' | 'stop' }): ChangeStandingOrderConfirm {
  const words = {
    pause: { title: 'Pause this order', summary: 'Your agent keeps the order and stops working it until you resume.', confirm: 'Pause', cancel: 'Keep it running' },
    resume: { title: 'Resume this order', summary: 'Your agent works it again, starting now.', confirm: 'Resume', cancel: 'Not now' },
    stop: { title: 'Stop this order', summary: 'The order is removed. Offers and requests already out stay as they are.', confirm: 'Stop the order', cancel: 'Keep it' },
  }[i.action];
  return {
    kind: 'confirm',
    id: `change_standing_order:${i.id}:${i.action}:${confirmNonce()}`,
    intent: 'change_standing_order',
    title: words.title,
    summary: words.summary,
    fields: [{ label: 'Order', value: short(i.need) }],
    payload: { id: i.id, action: i.action },
    confirmLabel: words.confirm,
    cancelLabel: words.cancel,
  };
}

function offer(actions: AssistantAction[], built: OrderStepConfirm | { error: string }) {
  if ('error' in built) return built;
  if (!hasEquivalentConfirm(actions, built)) actions.push(built);
  return { ok: true, shown: built.title };
}

export function orderTools(address: string, actions: AssistantAction[], deps: OrderToolDeps) {
  const me = address.toLowerCase();
  return {
    my_standing_orders: tool({
      description:
        "List this person's standing orders (view 87): things they told their agent to find or sell every day, each with its id, what it is, the most for one, until when, how many people were asked today and this week, how many offers came, and whether it is running, paused or finished. Not the same as standing needs (my_standing_needs), which are what a buyer regularly needs so sellers can reach them.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = deps.now();
        const [orders, working] = await Promise.all([deps.orders(me, now), deps.working(me)]);
        return {
          working,
          max: MAX_ORDERS,
          orders: await Promise.all(orders.map(async (o) => ({
            id: o.id,
            side: o.side === 'buy' ? 'buying' : 'selling',
            what: o.need,
            mostForOne: o.budgetUsdc ? await deps.money(me, Number(o.budgetUsdc)) : null,
            until: o.until ? dayWords(o.until) : 'until they stop it',
            peopleADay: o.perDay,
            state: STATE_WORDS[o.state],
            askedThisWeek: o.week.asked,
            offersThisWeek: o.week.offers,
            waitsFor: o.told === 'location' ? 'their location (set_location)' : o.told === 'money' ? 'money in their balance' : null,
          }))),
          next: working ? undefined : 'Their agent is not finding people right now (it is off, stopped itself, or Find people is switched off), so no order is being worked. Say so in one line.',
        };
      },
    }),

    propose_standing_order: tool({
      description:
        'Prepare a card that starts a standing order (view 87): the person says once what their agent should find (side buy) or sell (side sell), and the agent works it every day until a date, until a deal is locked, or until they stop it. Use when they want it kept up without asking again: "find me a bag of rice every day until Friday, up to 60,000 naira", "keep looking for a tailor until I find one", "keep finding buyers for my catering". A buying order needs the most they pay for one, in USDC; when they said it in their own currency also pass saidCurrency and saidAmount as said. A selling order takes no budget: it uses their usual price. peopleADay is 1 to 5 (default 5). untilDays is how many days from today; leave it out for "until I stop it". For a single search now use find_people instead; for what a buyer regularly needs so sellers can come to them use propose_standing_need. Starting it moves no money; the agent posts the need privately and asks people inside its limits.',
      inputSchema: z.object({
        side: z.enum(['buy', 'sell']),
        need: z.string().min(3).max(ORDER_NEED_MAX).describe('What it should find or sell, in their words.'),
        budgetUsdc: z.number().positive().max(5_000_000).optional().describe('Buying only: the most for one, in USDC.'),
        saidCurrency: z.enum(LOCAL).optional(),
        saidAmount: z.number().positive().optional(),
        kind: z.enum(['goods', 'in_person', 'remote']),
        peopleADay: z.number().int().min(1).max(PER_DAY_MAX).optional(),
        untilDays: z.number().int().min(1).max(ORDER_DAYS_MAX).optional(),
      }),
      execute: async ({ side, need, budgetUsdc, saidCurrency, saidAmount, kind, peopleADay, untilDays }) => {
        const prohibited = prohibitedReason(need);
        if (prohibited) return { error: prohibited.message };
        const now = deps.now();
        const [orders, working] = await Promise.all([deps.orders(me, now), deps.working(me)]);
        const said = saidCurrency && saidAmount ? { currency: saidCurrency, amount: saidAmount } : undefined;
        const input: OrderInput = { side, need, budgetUsdc: budgetUsdc ?? null, kind, ...(peopleADay ? { perDay: peopleADay } : {}), ...(said ? { said } : {}), until: untilDays ? now + untilDays * DAY_MS : null };
        const valid = validateOrder(input, liveCount(orders), now);
        if (!valid.ok) {
          if (valid.code === 'too-many') return { error: `They already keep ${MAX_ORDERS} orders. Offer to stop one first (my_standing_orders).` };
          if (valid.code === 'budget') return { error: 'Ask the most they would pay for one, then call again with budgetUsdc.' };
          return { error: 'That order cannot be started as said. Check what it should find, the people a day (1 to 5) and the date.' };
        }
        const budget = side === 'buy' ? (said ? `${said.amount.toLocaleString('en-US')} ${said.currency}` : await deps.money(me, Number(valid.order.budgetUsdc))) : null;
        return offer(actions, buildStartStandingOrderConfirm({ input: { ...input, budgetUsdc: valid.order.budgetUsdc === null ? null : Number(valid.order.budgetUsdc) }, untilDays, budget, working, now }));
      },
    }),

    propose_stop_standing_order: tool({
      description:
        'Prepare a card to pause, resume or stop one standing order (id from my_standing_orders). pause keeps the order and stops its daily work; resume starts it again now; stop removes it. Offers and requests already out stay as they are.',
      inputSchema: z.object({ id: z.string().min(1).max(80), action: z.enum(['pause', 'resume', 'stop']) }),
      execute: async ({ id, action }) => {
        const order = (await deps.orders(me, deps.now())).find((o) => o.id === id);
        if (!order) return { error: 'That order is not on their list. Read my_standing_orders for the ids.' };
        if (action !== 'stop' && order.state !== 'on' && order.state !== 'paused') return { error: 'That order has finished. It can only be removed (stop).' };
        if (action === 'pause' && order.state === 'paused') return { error: 'That order is already paused.' };
        if (action === 'resume' && order.state === 'on') return { error: 'That order is already running.' };
        return offer(actions, buildChangeStandingOrderConfirm({ id, need: order.need, action }));
      },
    }),
  };
}
