import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  parseAbi,
  parseEventLogs,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';

/// KarwanTradeFinance on the escrow family (view 18): one call opens a line,
/// paying the advance, assigning the deal's payout to the financier and
/// holding part of the seller's deal guarantee.
export const tradeFinanceAbi = parseAbi([
  'struct Signed { uint256 nonce; uint256 deadline; bytes sig; }',
  'struct StakeSig { uint256 deadline; bytes sig; }',
  'struct Line { address escrow; uint8 state; bytes32 dealId; address seller; address financier; address asset; uint128 advance; uint128 repay; uint128 stake; }',
  'function open(address escrow, bytes32 dealId, uint128 advance, uint128 repay, uint128 stake, uint64 expiresAt, Signed assignment, StakeSig reservation) returns (bytes32)',
  'function settle(bytes32 lineId)',
  'function waive(bytes32 lineId)',
  'function keepStake(bytes32 lineId)',
  'function lineOf(bytes32 lineId) view returns (Line)',
  'function lineIdFor(address escrow, bytes32 dealId, address financier, uint128 advance, uint128 repay, uint128 stake) view returns (bytes32)',
  'event LineOpened(bytes32 indexed lineId, address indexed escrow, bytes32 indexed dealId, address seller, address financier, uint256 advance, uint256 repay, uint256 stake)',
  'event LineRepaid(bytes32 indexed lineId, uint256 repaid)',
  'event LineDefaulted(bytes32 indexed lineId, uint256 shortfall, uint256 fromStake)',
  'event LineWaived(bytes32 indexed lineId)',
]);

/// What a family escrow tells Trade finance about one deal.
export const financeableAbi = parseAbi([
  'struct Receivable { address asset; address seller; uint256 unpaid; uint64 horizon; bool open; bool financeable; }',
  'function receivableOf(bytes32 dealId) view returns (Receivable)',
  'function assignmentOf(bytes32 dealId, address payee) view returns (address assignee, uint128 amount, uint128 paid)',
  'function nonceUsed(address payee, uint256 nonce) view returns (bool)',
]);

export const vaultReservationAbi = parseAbi([
  'function expiryOf(address family, bytes32 ref) view returns (uint64)',
  'function freeOf(uint64 owner, address asset) view returns (uint256)',
]);

/// The contract's long-stop plus the window to settle, after the deal's latest end.
const HOLD_AFTER_HORIZON = (180n + 30n) * 86_400n;

export type LineTerms = { escrow: Hex; dealId: Hex; financier: Hex; advance: bigint; repay: bigint; stake: bigint };

/// The seller's two signatures, as stored on the offer (bigints as strings).
export type SellerSigned = {
  assign: { nonce: string; deadline: string; sig: Hex };
  reserve: { deadline: string; sig: Hex };
  expiresAt: string;
};

export function lineIdFor(chainId: number, tradeFinance: Hex, t: LineTerms): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }, { type: 'address' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint128' }],
      [BigInt(chainId), tradeFinance, t.escrow, t.dealId, t.financier, t.advance, t.repay, t.stake],
    ),
  );
}

export function holdUntil(horizon: bigint): bigint {
  return horizon + HOLD_AFTER_HORIZON;
}

/// The payout assignment the escrow checks, naming Trade finance as the only
/// contract that may submit it.
export function assignTypedData(i: { chainId: number; escrow: Hex; dealId: Hex; payee: Hex; assignee: Hex; amount: bigint; submitter: Hex; nonce: bigint; deadline: bigint }) {
  return {
    domain: { name: 'KarwanAgreement', version: '1', chainId: i.chainId, verifyingContract: i.escrow },
    types: {
      Assign: [
        { name: 'dealId', type: 'bytes32' },
        { name: 'payee', type: 'address' },
        { name: 'assignee', type: 'address' },
        { name: 'amount', type: 'uint128' },
        { name: 'submitter', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Assign' as const,
    message: { dealId: i.dealId, payee: i.payee, assignee: i.assignee, amount: i.amount, submitter: i.submitter, nonce: i.nonce, deadline: i.deadline },
  };
}

/// The hold on the seller's deal guarantee. The line id commits to every
/// term, so this is also the seller's consent to the advance and payback.
export function reserveTypedData(i: { chainId: number; vault: Hex; family: Hex; ref: Hex; asset: Hex; amount: bigint; beneficiary: Hex; expiresAt: bigint; deadline: bigint }) {
  return {
    domain: { name: 'KarwanStakeVault', version: '1', chainId: i.chainId, verifyingContract: i.vault },
    types: {
      Reserve: [
        { name: 'family', type: 'address' },
        { name: 'ref', type: 'bytes32' },
        { name: 'asset', type: 'address' },
        { name: 'amount', type: 'uint128' },
        { name: 'beneficiary', type: 'address' },
        { name: 'expiresAt', type: 'uint64' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Reserve' as const,
    message: { family: i.family, ref: i.ref, asset: i.asset, amount: i.amount, beneficiary: i.beneficiary, expiresAt: i.expiresAt, deadline: i.deadline },
  };
}

/// The financier's two calls: allow exactly the advance, then open.
export function openCalls(i: { usdc: Hex; tradeFinance: Hex; terms: LineTerms; signed: SellerSigned }): Array<{ to: Hex; data: Hex }> {
  const { terms: t, signed: s } = i;
  return [
    { to: i.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [i.tradeFinance, t.advance] }) },
    {
      to: i.tradeFinance,
      data: encodeFunctionData({
        abi: tradeFinanceAbi,
        functionName: 'open',
        args: [
          t.escrow, t.dealId, t.advance, t.repay, t.stake, BigInt(s.expiresAt),
          { nonce: BigInt(s.assign.nonce), deadline: BigInt(s.assign.deadline), sig: s.assign.sig },
          { deadline: BigInt(s.reserve.deadline), sig: s.reserve.sig },
        ],
      }),
    },
  ];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/// Throws unless the receipt opened exactly this line and paid exactly the
/// advance from the financier to the seller.
export function proveOpen(receipt: TransactionReceipt, i: { tradeFinance: Hex; usdc: Hex; seller: Hex; terms: LineTerms; lineId: Hex }): void {
  if (receipt.status !== 'success') throw new Error('the line did not open: the transaction reverted');
  const t = i.terms;
  const line = parseEventLogs({ abi: tradeFinanceAbi, eventName: 'LineOpened', logs: receipt.logs, strict: false }).some(
    (e) =>
      same(e.address, i.tradeFinance) && e.args.lineId === i.lineId && same(e.args.escrow ?? '', t.escrow) && e.args.dealId === t.dealId &&
      same(e.args.seller ?? '', i.seller) && same(e.args.financier ?? '', t.financier) &&
      e.args.advance === t.advance && e.args.repay === t.repay && e.args.stake === t.stake,
  );
  if (!line) throw new Error('the receipt has no matching LineOpened');
  const paid = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false }).some(
    (e) => same(e.address, i.usdc) && same(e.args.from ?? '', t.financier) && same(e.args.to ?? '', i.seller) && e.args.value === t.advance,
  );
  if (!paid) throw new Error('the receipt does not pay the advance to the seller');
}

/// How a settle transaction ended this line, or null when it did not touch it.
export function settleOutcome(logs: Log[], lineId: Hex): { state: 'repaid' | 'defaulted' | 'waived'; shortfallMicros?: bigint; fromGuaranteeMicros?: bigint } | null {
  for (const e of parseEventLogs({ abi: tradeFinanceAbi, logs, strict: false })) {
    if (!('lineId' in (e.args ?? {})) || (e.args as { lineId?: Hex }).lineId !== lineId) continue;
    if (e.eventName === 'LineRepaid') return { state: 'repaid' };
    if (e.eventName === 'LineWaived') return { state: 'waived' };
    if (e.eventName === 'LineDefaulted') return { state: 'defaulted', shortfallMicros: e.args.shortfall, fromGuaranteeMicros: e.args.fromStake };
  }
  return null;
}
