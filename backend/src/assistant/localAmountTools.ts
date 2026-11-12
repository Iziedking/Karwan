import { z } from 'zod';
import { DISPLAY_CURRENCIES, type LocalCurrency, type UsdcRates } from '../rates/usdcRates.js';
import { usdcMicrosFor } from '../rates/quote.js';

const LOCAL = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC') as [LocalCurrency, ...LocalCurrency[]];

const CURRENCY_NOTE =
  'The currency the person said the amount in (NGN, KES, EUR...). Set it whenever they name an amount in their own money, such as "send ₦50,000" or "my budget is 100,000 naira"; every amount field ending in Usdc then holds that figure exactly as said, never your own conversion, and Karwan works out the USDC at today\'s rate. Omit for USDC.';

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

/// The figures the person typed in their own messages ("50,000", "2.5k", "1.2m").
export function figuresSaid(messages: unknown): number[] {
  if (!Array.isArray(messages)) return [];
  const out: number[] = [];
  for (const m of messages as Array<{ role?: string; content?: unknown }>) {
    if (m?.role !== 'user') continue;
    const parts = typeof m.content === 'string' ? [m.content] : Array.isArray(m.content) ? m.content.map((p: { type?: string; text?: string }) => (p?.type === 'text' ? p.text ?? '' : '')) : [];
    for (const text of parts) {
      for (const found of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/gi)) {
        const n = Number(found[1]!.replace(/,/g, '')) * (found[2] ? (found[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1);
        if (Number.isFinite(n) && n > 0) out.push(n);
      }
    }
  }
  return out;
}

const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.02;

/// The figure the person typed when the assistant passed its own USDC working
/// instead (11 Nov 2026: ₦50,000 passed as 37.14 with currency NGN and turned
/// into 0.03 USDC). Null when the figure given is what they typed, or nothing
/// they typed explains it.
function alreadyUsdc(given: number, rate: number | undefined, typed: readonly number[]): number | null {
  if (!rate || typed.some((n) => near(given, n))) return null;
  return typed.find((n) => near(given * rate, n)) ?? null;
}

function isNumber(field: z.ZodTypeAny): boolean {
  let inner: z.ZodTypeAny = field;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable || inner instanceof z.ZodDefault) {
    inner = inner instanceof z.ZodDefault ? inner._def.innerType : inner.unwrap();
  }
  return inner instanceof z.ZodNumber;
}

/// The USDC amount fields of a tool: numbers whose name ends in Usdc
/// (amountUsdc, budgetUsdc, askingPriceUsdc, rateUsdc...).
function usdcFields(shape: z.ZodRawShape): string[] {
  return Object.keys(shape).filter((key) => /Usdc$/.test(key) && isNumber(shape[key] as z.ZodTypeAny));
}

/// Every money tool takes an amount in the person's own currency (view 55).
/// A tool with USDC amount fields also takes `currency`; each figure is turned
/// into USDC before the tool runs, so the tool keeps working in USDC underneath
/// and every channel (website, Telegram) gets the same behaviour. The limits
/// of each field are checked on the USDC figure, so ₦100,000 is not refused
/// by a USDC ceiling it does not reach.
///
/// `moneyFields` names amount fields that do not end in Usdc, by tool: the
/// prices of a way of dealing (priceMin, rateUsual...), so a price said to the
/// assistant in naira is read as naira there too (view 77).
export function withLocalAmounts<T extends Record<string, AnyTool>>(tools: T, readRates: () => Promise<UsdcRates>, moneyFields: Record<string, readonly string[]> = {}): T {
  const out: Record<string, AnyTool> = {};
  for (const [name, t] of Object.entries(tools)) {
    const schema = t.inputSchema;
    const named = schema instanceof z.ZodObject ? (moneyFields[name] ?? []).filter((key) => key in schema.shape && isNumber(schema.shape[key] as z.ZodTypeAny)) : [];
    const fields = schema instanceof z.ZodObject ? [...usdcFields(schema.shape), ...named] : [];
    if (!(schema instanceof z.ZodObject) || fields.length === 0 || !t.execute) {
      out[name] = t;
      continue;
    }
    const run = t.execute;
    const loose: z.ZodRawShape = {};
    for (const key of fields) {
      const field = schema.shape[key] as z.ZodTypeAny;
      const said = z.number().nonnegative().describe(`${field.description ?? 'Amount.'} The figure as said; with currency set it is in that currency.`);
      loose[key] = field.isOptional() ? said.optional() : said;
    }
    out[name] = {
      ...t,
      inputSchema: schema.extend({ ...loose, currency: z.enum(LOCAL).optional().describe(CURRENCY_NOTE) }),
      execute: async (args: { currency?: LocalCurrency } & Record<string, unknown>, options: unknown) => {
        const { currency, ...rest } = args;
        const converted: Record<string, unknown> = { ...rest };
        // The figure as said goes beside the options, so a tool that keeps a
        // price can keep it in the person's own currency (view 55).
        const amounts: Record<string, number> = {};
        if (currency) {
          const rates = await readRates();
          const typed = figuresSaid((options as { messages?: unknown } | undefined)?.messages);
          for (const key of fields) {
            if (typeof rest[key] !== 'number') continue;
            const said = alreadyUsdc(rest[key] as number, rates.rates[currency], typed);
            if (said !== null) {
              amounts[key] = said;
              continue;
            }
            amounts[key] = rest[key] as number;
            const usdc = toUsdc(rest[key] as number, currency, rates);
            if (usdc === null) {
              return { error: `There is no fresh ${currency} rate right now. Ask for the amount in USDC, or try again in a few minutes.` };
            }
            converted[key] = usdc;
          }
        }
        const checked = schema.safeParse(converted);
        if (!checked.success) {
          const issue = checked.error.issues[0];
          return { error: `That amount does not fit: ${issue?.path.join('.') ?? 'amount'} ${issue?.message ?? 'is out of range'}. Ask for a different figure.` };
        }
        return run(checked.data, currency ? { ...(options as object), said: { currency, amounts } } : options);
      },
    };
  }
  return out as T;
}
