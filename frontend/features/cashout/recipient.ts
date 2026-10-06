import type { TransferStep } from '@/features/bridge/routePlan';

export type Recipient =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'address'; address: string }
  | { kind: 'tag'; tag: string };

const EVM = /^0x[a-fA-F0-9]{40}$/;
const TAG = /^@?([a-z][a-z0-9_]{2,19})$/i;

/// What the person typed in "Address or Karwan tag". A tag names a Karwan
/// account, which lives on Arc, so it only counts when the network is Arc.
export function parseRecipient(input: string, network: string): Recipient {
  const value = input.trim();
  if (!value) return { kind: 'empty' };
  if (EVM.test(value)) return { kind: 'address', address: value };
  const tag = TAG.exec(value);
  if (tag && network === 'arc') return { kind: 'tag', tag: tag[1]!.toLowerCase() };
  return { kind: 'invalid' };
}

/// A withdrawal's server status as the steps on screen.
export function stepForBridgeStatus(s: { status: string; movementState?: string | null }): TransferStep | 'failed' {
  if (s.movementState === 'completed' || s.status === 'minted') return 'arrived';
  if (s.movementState === 'needs_attention' || s.status === 'error') return 'failed';
  if (s.status === 'relaying') return 'arriving';
  return 'leaving';
}
