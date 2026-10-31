import type { api } from '@/core/api';

type GuaranteeRead = Awaited<ReturnType<typeof api.guarantee>>;

export type GuaranteeView =
  | { kind: 'off' }
  | { kind: 'on'; guaranteed: string; held: string; free: string; comingBack: { amount: string; at: number | null } | null };

/// The deal guarantee as a money page (view 44, P13): the amount guaranteed
/// first, then what is held in deals, what is free and what is coming back.
/// Null while it loads.
export function guaranteeView(data: GuaranteeRead | undefined): GuaranteeView | null {
  if (!data) return null;
  if (!data.available) return { kind: 'off' };
  return {
    kind: 'on',
    guaranteed: data.inPlaceUsdc,
    held: data.heldUsdc,
    free: data.freeUsdc,
    comingBack: Number(data.comingBackUsdc) > 0 ? { amount: data.comingBackUsdc, at: data.readyAt } : null,
  };
}
