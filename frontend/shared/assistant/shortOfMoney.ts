import { ApiError } from '@/core/api';

/// A card refused because the balance is short, so the card can offer Add
/// money right where it was refused (owner, 16 Nov 2026: "one tap from where
/// the funding was asked").
export function shortOfMoney(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const body = err instanceof ApiError ? (err.body as { needMicros?: unknown; code?: unknown } | undefined) : undefined;
  if (body && (body.needMicros !== undefined || body.code === 'short' || body.code === 'insufficient_balance')) return true;
  return /insufficient (buyer )?balance|balance is short|to your balance first|not enough (money|usdc)/i.test(err.message);
}
