import type { RequestPageCopy } from '@/shared/i18n/messages/requestPage';

export interface RequestQuantity {
  count: number;
  unit: string | null;
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 10 ? 0 : 2 });

/// "3 pairs, 100 USDC for all, about 33 USDC each" (view 41). Nothing for a
/// request with no count, or a count of one: the budget line already says it.
export function quantityLine(
  copy: Pick<RequestPageCopy, 'quantityLine' | 'quantityItems'>,
  quantity: RequestQuantity | null | undefined,
  budgetUsdc: string | number,
): string | null {
  if (!quantity || quantity.count < 2) return null;
  const total = Number(budgetUsdc);
  if (!Number.isFinite(total) || total <= 0) return null;
  const what = quantity.unit ? `${quantity.count} ${quantity.unit}` : fill(copy.quantityItems, { count: String(quantity.count) });
  return fill(copy.quantityLine, { what, total: money(total), each: money(total / quantity.count) });
}
