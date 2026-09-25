import type { MoneyDirection, SoundKeys } from '@/shared/sound/moneySounds';

export interface MoneyViewer {
  address: string;
  role: 'buyer' | 'seller' | 'financier' | null;
}

type Payload = Record<string, unknown> | undefined;

const ARC_CHAIN_KEYS = new Set(['arc', 'arctestnet', 'arc-testnet']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/// Which way a finished cross-chain transfer went. Older events do not say,
/// so a destination that is not Arc means out and anything else means in,
/// which is what the bridge store assumes for a record without a direction.
export function bridgeDirection(payload: Payload): MoneyDirection {
  const stated = text(payload?.direction);
  if (stated === 'in' || stated === 'out') return stated;
  const destination = text(payload?.destChainKey);
  return destination && !ARC_CHAIN_KEYS.has(destination) ? 'out' : 'in';
}

/// Whether a notification is money arriving at or leaving this account, seen
/// from the account's own balance, the way the ledger signs its rows
/// (ledgerPresentation.ledgerDirection): a top-up leaves the balance for an
/// agent; a withdrawal back to the sign-in wallet arrives. `null` is anything
/// else: a state change, a move the balance does not see, or not money.
export function classifyMoneyEvent(type: string, payload: Payload, viewer: MoneyViewer): MoneyDirection | null {
  const role = viewer.role;
  switch (type) {
    case 'wallet.credited':
    case 'yield.credited':
    case 'yield.claimed':
    case 'vault.claimed':
      return 'in';
    case 'wallet.debited':
    case 'vault.deposit':
    case 'gateway.agent.funded':
    case 'gateway.cashed.out':
      return 'out';
    case 'agent.funded':
      // Karwan's own starter USDC is new money. Everything else under this type
      // left the balance: a top-up, or the research activation fee.
      return payload?.seed === true ? 'in' : 'out';
    case 'agent.withdrawal':
      return text(payload?.toAddress) === viewer.address.trim().toLowerCase() ? 'in' : 'out';
    case 'bridge.minted':
      // Arrival on Arc is money in. An outbound transfer already sounded when
      // it left the wallet (wallet.debited); arriving elsewhere is a delivery.
      return bridgeDirection(payload) === 'in' ? 'in' : null;
    case 'cashout.arc.completed':
      return role === 'seller' ? 'out' : null;
    case 'escrow.milestone.released':
    case 'escrow.settled':
    case 'deal.auto_released':
      return role === 'seller' ? 'in' : null;
    case 'escrow.resolved': {
      const bps = typeof payload?.sellerBps === 'number' ? payload.sellerBps : null;
      if (bps === null) return null;
      if (role === 'seller') return bps > 0 ? 'in' : null;
      if (role === 'buyer') return bps < 10_000 ? 'in' : null;
      return null;
    }
    case 'deal.cancelled':
      // Cancelled before funding, nothing moved. After funding, the buyer is refunded.
      return role === 'buyer' && text(payload?.kind) !== 'pre-accept' ? 'in' : null;
    case 'factoring.accepted':
      return role === 'financier' ? 'out' : null;
    case 'factoring.settled':
    case 'po.repaid':
      return role === 'financier' ? 'in' : null;
    case 'po.released':
      if (role === 'seller') return 'in';
      if (role === 'financier') return 'out';
      return null;
    default:
      return null;
  }
}

/// The ids that make two events the same movement, for sound dedupe.
export function soundKeysFor(event: { jobId?: string; payload?: Record<string, unknown> }): SoundKeys {
  const payload = event.payload ?? {};
  const id = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
  return {
    ids: [id(payload.reference), id(payload.txHash), id(payload.mintTxHash), id(payload.bridgeId)],
    deal: event.jobId ?? null,
  };
}
