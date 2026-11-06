import { z } from 'zod';
import { DISPLAY_CURRENCIES, type LocalCurrency, type UsdcRates } from '../rates/usdcRates.js';
import { usdcMicrosFor } from '../rates/quote.js';

const LOCAL = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC') as [LocalCurrency, ...LocalCurrency[]];

const CURRENCY_NOTE =
  'The currency the person said the amount in (NGN, KES, EUR...). Set it whenever they name an amount in their own money, such as "send ₦50,000"; amountUsdc then holds that figure as said and Karwan works out the USDC at today\'s rate. Omit for USDC.';

type AnyTool = { inputSchema?: unknown; execute?: (args: any, options: any) => unknown };

/// The amount a tool was given, in USDC (view 55). With a currency, the figure
/// is converted at today's rate, rounded down to the micro so nobody moves more
/// than they said. Null when there is no fresh rate for that currency.
export function toUsdc(amount: number, currency: LocalCurrency | undefined, rates: UsdcRates): number | null {
  if (!currency) return amount;
  const rate = rates.rates[currency];
  if (!rate || rates.updatedAt === null) return null;
  const micros = usdcMicrosFor(String(amount), rate);
  return micros > 0n ? Number(micros) / 1_000_000 : null;
}

/// Every money tool takes an amount in the person's own currency (view 55).
/// A tool whose input has `amountUsdc` also takes `currency`; the figure is
/// turned into USDC before the tool runs, so each tool keeps working in USDC
/// underneath and every channel (website, Telegram) gets the same behaviour.
export function withLocalAmounts<T extends Record<string, AnyTool>>(tools: T, readRates: () => Promise<UsdcRates>): T {
  const out: Record<string, AnyTool> = {};
  for (const [name, t] of Object.entries(tools)) {
    const schema = t.inputSchema;
    if (!(schema instanceof z.ZodObject) || !('amountUsdc' in schema.shape) || !t.execute) {
      out[name] = t;
      continue;
    }
    const run = t.execute;
    out[name] = {
      ...t,
      inputSchema: schema.extend({ currency: z.enum(LOCAL).optional().describe(CURRENCY_NOTE) }),
      execute: async (args: { amountUsdc?: number; currency?: LocalCurrency } & Record<string, unknown>, options: unknown) => {
        const { currency, ...rest } = args;
        if (!currency || typeof rest.amountUsdc !== 'number') return run(rest, options);
        const usdc = toUsdc(rest.amountUsdc, currency, await readRates());
        if (usdc === null) {
          return { error: `There is no fresh ${currency} rate right now. Ask for the amount in USDC, or try again in a few minutes.` };
        }
        return run({ ...rest, amountUsdc: usdc }, options);
      },
    };
  }
  return out as T;
}
