// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.
import { parseAbi, parseAbiParameter, type AbiParameterToPrimitiveType } from 'viem';

/// AgreementTerms in field order (contracts/src/suite/agreement/AgreementTypes.sol).
/// Pinned by a Foundry vector: the hash of this tuple equals termsHashOf.
export const agreementTermsAbi = parseAbiParameter(
  '(address asset, address seller, uint128 amount, uint16[12] trancheBps, uint64 acceptBy, uint64 deliveryDeadline, uint32 reclaimGrace, uint32 reviewWindow, uint32 startLongstop, uint32 extensionSecs, uint32 silentLongstop, uint8 reviewStarts, uint8 maxExtensions, uint8 finalRelease, uint8 silenceOutcome, uint16 partialBps, uint16 fallbackBps, uint8 parts, uint32 partEvery, uint16 cancelFeeBps, uint128 sellerStake, address verifier, bytes32 checkPolicy, bytes32 agreementHash)',
);

export type AgreementTermsValue = AbiParameterToPrimitiveType<typeof agreementTermsAbi>;

export const agreementAbi = parseAbi([
  'struct AgreementTerms { address asset; address seller; uint128 amount; uint16[12] trancheBps; uint64 acceptBy; uint64 deliveryDeadline; uint32 reclaimGrace; uint32 reviewWindow; uint32 startLongstop; uint32 extensionSecs; uint32 silentLongstop; uint8 reviewStarts; uint8 maxExtensions; uint8 finalRelease; uint8 silenceOutcome; uint16 partialBps; uint16 fallbackBps; uint8 parts; uint32 partEvery; uint16 cancelFeeBps; uint128 sellerStake; address verifier; bytes32 checkPolicy; bytes32 agreementHash; }',
  'struct AgreementDeal { uint8 state; uint8 count; uint8 paid; uint8 extUsed; uint8 extRequests; bool checkPassed; bool checkFailed; bool lateMark; uint8 partsPaid; uint32 revision; uint64 fundedAt; uint64 deadline; uint64 deliveredAt; uint64 reviewStartAt; uint64 reviewEnd; uint64 requestedDeadline; uint64 holdBase; uint128 sellerNet; uint128 feeTotal; uint128 released; uint128 feeReleased; bytes32 termsHash; }',
  'function getTerms(bytes32 dealId) view returns (AgreementTerms)',
  'function getDeal(bytes32 dealId) view returns (AgreementDeal)',
  'struct Dispute { address opener; uint64 openedAt; bool proposed; bool escalated; uint16 proposedBps; uint64 proposedAt; uint64 escalatedAt; }',
  'function disputeOf(bytes32 dealId) view returns (Dispute)',
  'event Delivered(bytes32 indexed dealId, uint8 tranche, uint32 revision, bytes32 proofHash)',
  'event CheckReported(bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash)',
  'event RecordPending(bytes32 indexed dealId, uint8 party, uint8 outcome, uint16 detail)',
  'event PayoutCredited(address indexed asset, address indexed to, uint256 amount)',
  'event DisputeOpened(bytes32 indexed dealId, address indexed opener, bytes32 clauseHash)',
]);

/// AgreementState values the workflows act on.
export const AGREEMENT_ACCEPTED = 2;

export const adapterAbi = parseAbi([
  'event CheckApproved(address indexed verifier, address indexed family, bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash, bytes32 reportId)',
  'function verdictOf(bytes32 key) view returns (bool set, bool pass, bytes32 evidenceHash)',
  'function verdictKey(address verifier, address family, bytes32 dealId, uint32 revision) pure returns (bytes32)',
]);
