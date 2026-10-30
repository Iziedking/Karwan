/// The rows under a deal's title block (view 43). Each one opens in place.
/// A row shows only once it means something, in one order for everyone, and
/// anything that needs the person moves to the top, marked.

export type LayerKey = 'progress' | 'delivery' | 'handover' | 'getPaid' | 'agreement' | 'receipts' | 'problem';

export interface Layer {
  key: LayerKey;
  attention: boolean;
}

/// Messages are not a row: the message button beside the name opens them.
export interface LayerFacts {
  delivered: boolean;
  /// The buyer holds the code the seller asks for at an in-person handover.
  needsHandover: boolean;
  /// The seller of a business order on the escrow family.
  canGetPaid: boolean;
  funded: boolean;
  problems: number;
  /// The delivery check paused the payment.
  heldDelivery: boolean;
}

const ORDER: LayerKey[] = ['progress', 'delivery', 'handover', 'getPaid', 'agreement', 'receipts', 'problem'];

export function dealLayers(f: LayerFacts): Layer[] {
  const shown: Record<LayerKey, boolean> = {
    progress: true,
    delivery: f.delivered || f.heldDelivery,
    handover: f.needsHandover,
    getPaid: f.canGetPaid,
    agreement: true,
    receipts: f.funded,
    problem: f.problems > 0,
  };
  const attention: Partial<Record<LayerKey, boolean>> = {
    delivery: f.heldDelivery,
    handover: f.needsHandover,
  };
  const rows = ORDER.filter((key) => shown[key]).map((key) => ({ key, attention: !!attention[key] }));
  return [...rows.filter((r) => r.attention), ...rows.filter((r) => !r.attention)];
}
