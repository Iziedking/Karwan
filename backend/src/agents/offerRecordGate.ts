import { IdentityNeeded } from '../identity/suiteIdentity.js';

/// A selling agent offers on a request only once its owner has a Karwan record,
/// while new deals open on the escrow family: the escrow notes each side's
/// record when the money goes in, so a matched deal without one would not count
/// on the seller's record. The owner is told once a day until they set it up.

const TELL_EVERY_MS = 86_400_000;

export interface OfferRecordGateDeps {
  enabled(): boolean;
  requireIdentity(userAddress: string, role: 'seller'): Promise<void>;
  lastTold(userAddress: string): Promise<number | null>;
  markTold(userAddress: string, at: number): Promise<void>;
  emit(e: { type: 'record.setup_needed'; payload: Record<string, unknown> }): void;
  now(): number;
}

export function createOfferRecordGate(deps: OfferRecordGateDeps) {
  return {
    async canOffer(sellerUser: string): Promise<boolean> {
      if (!deps.enabled()) return true;
      try {
        await deps.requireIdentity(sellerUser, 'seller');
        return true;
      } catch (err) {
        if (!(err instanceof IdentityNeeded)) throw err;
      }
      const owner = sellerUser.toLowerCase();
      const last = await deps.lastTold(owner);
      if (last === null || deps.now() - last > TELL_EVERY_MS) {
        await deps.markTold(owner, deps.now());
        deps.emit({ type: 'record.setup_needed', payload: { sellerUser: owner, reason: 'offers' } });
      }
      return false;
    },
  };
}
