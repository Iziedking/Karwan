export const TRADE_INTENT_INTERVAL_MS = 5600;

export function nextTradeIntentIndex(current: number, total: number): number {
  if (!Number.isInteger(total) || total <= 0) return 0;
  return (Math.max(0, current) + 1) % total;
}
