import { encodeAbiParameters, keccak256 } from 'viem';

type Hex = `0x${string}`;

const BUYER = 0;
const SELLER = 1;

/// KarwanRecord.outcomeKey: one key per family, deal, record and side.
export function outcomeKey(family: Hex, dealId: Hex, subject: bigint, role: number): Hex {
  return keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }, { type: 'uint64' }, { type: 'uint8' }], [family, dealId, subject, role]),
  );
}

/// SettlementLib's key for an outcome the record refused and the escrow holds back.
export function pendingRecordKey(dealId: Hex, role: number): Hex {
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint8' }], [dealId, role]));
}

export interface RecordStatusPorts {
  family: Hex;
  /// The record ids of the deal's two sides now, 0 for a side with none.
  subjects(dealId: Hex): Promise<{ buyer: bigint; seller: bigint }>;
  outcomeRecorded(key: Hex): Promise<boolean>;
  /// True when the escrow holds that side's outcome back as pending.
  pendingRecord(key: Hex): Promise<boolean>;
}

/// Where a settled deal's outcome stands on the two records: on both, waiting
/// for the record to take one, or not recorded for a side. The escrow takes
/// each side's record id when the deal is paid in, so a side that set up its
/// record later is not on this deal's record and nothing is waiting for it.
export type RecordOutcome = 'both' | 'pending' | 'none';

export async function readOnBothRecords(ports: RecordStatusPorts, dealId: Hex): Promise<RecordOutcome> {
  const { buyer, seller } = await ports.subjects(dealId);
  const sides = [
    { subject: buyer, role: BUYER },
    { subject: seller, role: SELLER },
  ];
  const states = await Promise.all(
    sides.map(async ({ subject, role }) => {
      if (subject !== 0n && (await ports.outcomeRecorded(outcomeKey(ports.family, dealId, subject, role)))) return 'recorded' as const;
      return (await ports.pendingRecord(pendingRecordKey(dealId, role))) ? ('pending' as const) : ('missing' as const);
    }),
  );
  if (states.every((s) => s === 'recorded')) return 'both';
  return states.includes('missing') ? 'none' : 'pending';
}
