import { confirmNonce, type SetUpRecordConfirm } from './actions.js';

export interface RecordStatus {
  identityId: bigint;
  buyerBound: boolean;
  sellerBound: boolean;
  buyerExpiresAt: bigint;
}

const LIMITS = 'up to 1,005 USDC at a time and 10,000 USDC in total for one year';

/// The card that sets up a person's Karwan record before their first money
/// step, or renews their buying agent once its year is up. Null when there is
/// nothing to do.
export function recordSetupCard(address: string, s: RecordStatus, nowSecs: number): SetUpRecordConfirm | null {
  const expired = s.identityId !== 0n && s.buyerBound && s.buyerExpiresAt <= BigInt(nowSecs);
  const complete = s.identityId !== 0n && s.buyerBound && s.sellerBound && !expired;
  if (complete) return null;
  return {
    kind: 'confirm',
    id: `set_up_record:${address.toLowerCase()}:${confirmNonce()}`,
    intent: 'set_up_record',
    title: expired ? 'Renew your buying agent' : 'Set up your Karwan record',
    summary: expired
      ? `Your buying agent can pay for your deals again, ${LIMITS}.`
      : `Your deals and checks are written to it. Your agents run your deals for you; your buying agent can pay ${LIMITS}.`,
    fields: [
      { label: 'Your buying agent pays', value: 'Up to 1,005 USDC at a time' },
      { label: 'In total', value: '10,000 USDC for one year' },
    ],
    payload: { address: address.toLowerCase() },
    confirmLabel: expired ? 'Renew' : 'Set up my record',
    cancelLabel: 'Not now',
  };
}
