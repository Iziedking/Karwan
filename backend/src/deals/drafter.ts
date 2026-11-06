import { readQuantity, type Quantity } from '../llm/quantity.js';

/// Say it, and the deal is drafted (view 56). A person's words become a deal
/// card the contract understands: a title, the parts it is paid in and what
/// each part delivers, goods or service, and a count. Rules first; the model
/// only when long words may hide stages; the contract rules decide; and it
/// never blocks: with no model, or a slow one, the draft is one payment.
/// It never sets a price, picks a person or posts anything.

export interface DraftPart {
  pct: number;
  what: string;
}

export interface Draft {
  title: string;
  parts: DraftPart[];
  tradeType: 'service' | 'goods';
  quantity: Quantity | null;
  source: 'rules' | 'model';
}

export type SplitWithModel = (brief: string) => Promise<DraftPart[] | null>;

const MAX_PARTS = 5;
const MAX_WHAT = 200;
const MAX_TITLE = 80;
/// Shares for 2 to 5 stages: early stages smaller, the finished work biggest.
const SPLITS: Record<number, number[]> = { 2: [30, 70], 3: [20, 30, 50], 4: [10, 20, 30, 40], 5: [10, 15, 20, 25, 30] };
const STAGE_WORD = /\b(first|then|after that|finally)\b/i;
const STAGE_SPLIT = /,?\s*\b(?:and then|then|after that|finally|next)\b\s*/i;
const GOODS = /\b(ship|shipped|shipping|bags?|cartons?|crates?|yards?|kg|kilos?|pieces?|pcs|bottles?|tons?|litres?|liters?|pairs?)\b|\bdelivered to\b/i;

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const sentences = (brief: string) => brief.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/// The title: the first sentence that is not about stages, short.
export function draftTitle(brief: string): string {
  const all = sentences(brief);
  const plain = all.find((s) => !STAGE_WORD.test(s) && !/%|\bhalf\b/i.test(s)) ?? all[0] ?? brief;
  return clip(tidy(plain), MAX_TITLE);
}

/// What the words say about parts, by rule alone.
export function ruleParts(brief: string): DraftPart[] {
  const text = tidy(brief);
  const title = draftTitle(text);
  const upfront = /\b(\d{1,2})\s*%\s*(?:deposit|up ?front|first|advance)\b/i.exec(text) ?? (/\bhalf\b[^.]*\b(?:up ?front|first|deposit|advance)\b/i.test(text) ? ['', '50'] : null);
  if (upfront) {
    const pct = Number(upfront[1]);
    if (pct >= 1 && pct <= 99) {
      return [
        { pct, what: clip(`Work started: ${title}`, MAX_WHAT) },
        { pct: 100 - pct, what: clip(`Delivered: ${title}`, MAX_WHAT) },
      ];
    }
  }
  const staged = sentences(text).filter((s) => STAGE_WORD.test(s)).join(' ');
  if (staged) {
    const stages = staged
      .split(STAGE_SPLIT)
      .map((s) => capital(tidy(s.replace(/^\s*first\b,?/i, '').replace(/\bfirst\s*[,.]?\s*$/i, ''))))
      .filter(Boolean);
    const shares = SPLITS[stages.length];
    if (shares) return stages.map((what, i) => ({ pct: shares[i]!, what: clip(what, MAX_WHAT) }));
  }
  return [{ pct: 100, what: clip(text, MAX_WHAT) }];
}

/// The contract's rules (milestonePctsSchema): 1 to 5 whole parts adding to
/// 100, each saying what it delivers. Anything else is repaired, never shown broken.
export function repairParts(parts: readonly DraftPart[], brief: string): DraftPart[] {
  const kept = parts
    .map((p) => ({ pct: Number.isFinite(p.pct) ? Math.max(0, p.pct) : 0, what: clip(tidy(String(p.what ?? '')), MAX_WHAT) }))
    .filter((p) => p.what)
    .slice(0, MAX_PARTS);
  if (kept.length === 0) return [{ pct: 100, what: clip(tidy(brief), MAX_WHAT) }];
  const total = kept.reduce((s, p) => s + p.pct, 0);
  const shares = kept.map((p) => (total > 0 ? Math.max(1, Math.round((p.pct / total) * 100)) : Math.floor(100 / kept.length)));
  let diff = 100 - shares.reduce((s, n) => s + n, 0);
  for (let i = shares.length - 1; diff !== 0 && i >= 0; i -= 1) {
    const step = diff > 0 ? diff : Math.max(diff, 1 - shares[i]!);
    shares[i] = shares[i]! + step;
    diff -= step;
  }
  return kept.map((p, i) => ({ pct: shares[i]!, what: p.what }));
}

export async function draftDeal(
  input: { brief: string },
  deps: { split?: SplitWithModel; timeoutMs?: number },
): Promise<Draft> {
  const brief = tidy(input.brief);
  const quantity = readQuantity(brief);
  const base = {
    title: draftTitle(brief),
    tradeType: (GOODS.test(brief) ? 'goods' : 'service') as Draft['tradeType'],
    quantity,
  };
  const ruled = ruleParts(brief);
  if (ruled.length > 1 || brief.length <= 80 || !deps.split) return { ...base, parts: ruled, source: 'rules' };
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), deps.timeoutMs ?? 4000));
    const proposed = await Promise.race([deps.split(brief), timeout]);
    if (proposed && proposed.length > 1) return { ...base, parts: repairParts(proposed, brief), source: 'model' };
  } catch {
    // The model is down: the one-part draft below is today's default.
  }
  return { ...base, parts: ruled, source: 'rules' };
}
