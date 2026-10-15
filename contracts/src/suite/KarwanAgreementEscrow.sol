// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KarwanSettlementBase} from "./KarwanSettlementBase.sol";
import {
    AgreementTerms,
    AgreementDeal,
    AgreementState,
    AgreementStore,
    AgreementBounds,
    SplitOffer
} from "./agreement/AgreementTypes.sol";
import {AgreementLib} from "./agreement/AgreementLib.sol";
import {AgreementDisputeLib} from "./agreement/AgreementDisputeLib.sol";
import {AgreementDeliveryLib} from "./agreement/AgreementDeliveryLib.sol";
import {ICheckTarget} from "./KarwanCheckVerifier.sol";
import {Receivable} from "./interfaces/IKarwanSuite.sol";
import {AgreementCommon} from "./agreement/AgreementCommon.sol";
import {DealAccount} from "./settlement/SettlementLib.sol";
import {Dispute, DisputePanel, DisputeLib} from "./dispute/DisputeLib.sol";

/// @title KarwanAgreementEscrow
/// @notice Fixed-price and milestone deals, goods, net terms, instalment
///         plans, refundable deposits and release at handover. The buyer funds
///         a deal with its full terms, the seller accepts the exact terms hash,
///         and every clock, dispute and payout follows those terms. The rules
///         live in `AgreementLib`, `AgreementDisputeLib` and the shared `DisputeLib`, linked once at deploy; every
///         payout goes through the settlement base.
contract KarwanAgreementEscrow is KarwanSettlementBase, ICheckTarget {
    uint64 public immutable minReview;
    uint64 public immutable maxReview;
    uint64 public immutable maxHorizon;

    AgreementStore internal _g;

    error BadBounds();

    constructor(address hub_, AgreementBounds memory b) KarwanSettlementBase(hub_, "KarwanAgreement", "1") {
        if (b.minReview == 0 || b.minReview >= b.maxReview || b.maxHorizon == 0 || b.maxHorizon > MAX_HORIZON) {
            revert BadBounds();
        }
        minReview = b.minReview;
        maxReview = b.maxReview;
        maxHorizon = b.maxHorizon;
    }

    // ------------------------------- Views --------------------------------

    function dealIdFor(address buyer, bytes32 salt) external view returns (bytes32) {
        return AgreementLib.dealIdFor(buyer, salt);
    }

    function termsHashOf(AgreementTerms calldata t) external pure returns (bytes32) {
        return keccak256(abi.encode(t));
    }

    function getDeal(bytes32 dealId) external view returns (AgreementDeal memory) {
        return _g.deals[dealId];
    }

    function getTerms(bytes32 dealId) external view returns (AgreementTerms memory) {
        return _g.terms[dealId];
    }

    function splitOf(bytes32 dealId) external view returns (SplitOffer memory) {
        return _g.splits[dealId];
    }

    function disputeOf(bytes32 dealId) external view returns (Dispute memory) {
        return _g.disputes.disputes[dealId];
    }

    function panelOf(bytes32 dealId) external view returns (DisputePanel memory) {
        return _g.disputes.panels[dealId];
    }

    /// @notice What the buyer signs to release a tranche (EIP-712).
    function releaseDigest(bytes32 dealId, uint8 tranche, uint256 deadline) external view returns (bytes32) {
        return AgreementLib.releaseDigest(_domainSeparatorV4(), dealId, tranche, deadline);
    }

    /// @notice What the deal still owes its seller, for Trade finance. Only an
    ///         accepted deal with all its money in can be financed.
    function receivableOf(bytes32 dealId) external view returns (Receivable memory r) {
        AgreementDeal storage d = _g.deals[dealId];
        AgreementTerms storage t = _g.terms[dealId];
        DealAccount storage a = _s.accounts[dealId];
        r.asset = a.asset;
        r.seller = t.seller;
        r.unpaid = d.sellerNet - d.released;
        r.horizon = a.horizon;
        r.open = d.state == AgreementState.Funded || d.state == AgreementState.Accepted
            || d.state == AgreementState.Disputed;
        r.financeable = d.state == AgreementState.Accepted && d.partsPaid >= t.parts;
    }

    function reviewEndOf(bytes32 dealId) external view returns (uint64) {
        AgreementDeal storage d = _g.deals[dealId];
        return AgreementDeliveryLib.reviewEnd(d, _g.terms[dealId], _s.accounts[dealId].holdUsed - d.holdBase);
    }

    // ------------------------------ Actions -------------------------------

    /// @notice Fund a deal with its full terms. The deal id comes from the
    ///         chain, this escrow, the buyer and a salt, so nobody can take it first.
    function fund(bytes32 salt, AgreementTerms calldata t) external nonReentrant returns (bytes32) {
        return AgreementLib.fund(_s, _g, hub, AgreementBounds(minReview, maxReview, maxHorizon), salt, t);
    }

    /// @notice The seller accepts the exact terms the buyer funded, in time.
    function accept(bytes32 dealId, bytes32 termsHash) external {
        AgreementLib.accept(_s, _g, dealId, termsHash);
    }

    /// @notice The seller accepts and reserves the stake the terms ask for.
    function acceptWithStake(bytes32 dealId, bytes32 termsHash, uint256 deadline, bytes calldata sig) external {
        AgreementLib.acceptWithStake(_s, _g, hub, dealId, termsHash, deadline, sig);
    }

    /// @notice The seller's stake follows the deal's horizon on its own; anyone
    ///         retries here if the vault refused.
    function keepStake(bytes32 dealId) external {
        AgreementLib.keepStake(_s, _g, dealId);
    }

    /// @notice The buyer pays the next part of an instalment plan.
    function payPart(bytes32 dealId) external nonReentrant {
        AgreementLib.payPart(_s, _g, hub, dealId);
    }

    /// @notice Anyone ends an instalment plan whose part is past due and grace.
    function cancelMissed(bytes32 dealId) external nonReentrant {
        AgreementLib.cancelMissed(_s, _g, hub, dealId);
    }

    /// @notice The buyer takes back a deal the seller has not accepted.
    function cancelUnaccepted(bytes32 dealId) external nonReentrant {
        AgreementLib.cancelUnaccepted(_s, _g, hub, dealId);
    }

    function markDelivered(bytes32 dealId, bytes32 proofHash) external {
        AgreementLib.markDelivered(_s, _g, dealId, proofHash);
    }

    /// @notice The buyer starts their own review: for goods, by confirming
    ///         arrival; for a checked deal, by reviewing it themselves.
    function startReview(bytes32 dealId) external {
        AgreementLib.startReview(_s, _g, dealId);
    }

    /// @notice The deal's verifier reports a check on one delivery revision.
    function attestCheck(bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash) external {
        AgreementLib.attestCheck(_s, _g, dealId, revision, pass, evidenceHash);
    }

    function requestMoreTime(bytes32 dealId) external {
        AgreementLib.requestMoreTime(_s, _g, dealId);
    }

    /// @notice The buyer pays the next tranche. Always open while the deal
    ///         runs, including during a dispute, which it ends.
    function release(bytes32 dealId) external nonReentrant {
        AgreementLib.release(_s, _g, hub, dealId);
    }

    /// @notice Anyone submits the buyer's signed release; the seller is paid.
    function releaseBySig(bytes32 dealId, uint8 tranche, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        AgreementLib.releaseBySig(_s, _g, hub, _domainSeparatorV4(), dealId, tranche, deadline, sig);
    }

    /// @notice Anyone triggers the seller's claim on the next delivered tranche
    ///         when the terms allow; the seller is paid.
    function claim(bytes32 dealId) external nonReentrant {
        AgreementLib.claim(_s, _g, hub, dealId);
    }

    /// @notice After the deadline and grace, anyone triggers the buyer's refund
    ///         of what is left.
    function reclaim(bytes32 dealId) external nonReentrant {
        AgreementLib.reclaim(_s, _g, hub, dealId);
    }

    function extendDeadline(bytes32 dealId, uint64 newDeadline) external {
        AgreementLib.extendDeadline(_s, _g, maxHorizon, dealId, newDeadline);
    }

    function requestExtension(bytes32 dealId, uint64 newDeadline) external {
        AgreementLib.requestExtension(_g, dealId, newDeadline);
    }

    function approveExtension(bytes32 dealId, uint64 newDeadline) external {
        AgreementLib.approveExtension(_s, _g, maxHorizon, dealId, newDeadline);
    }

    function proposeSplit(bytes32 dealId, uint16 sellerBps) external {
        AgreementLib.proposeSplit(_s, _g, dealId, sellerBps);
    }

    /// @notice The proposer withdraws a split offer nobody has accepted.
    function cancelSplit(bytes32 dealId) external {
        AgreementLib.cancelSplit(_g, dealId);
    }

    function acceptSplit(bytes32 dealId, uint16 sellerBps) external nonReentrant {
        AgreementLib.acceptSplit(_s, _g, hub, dealId, sellerBps);
    }

    /// @notice A party disputes the delivered tranche, citing a clause.
    function dispute(bytes32 dealId, bytes32 clauseHash) external {
        AgreementDisputeLib.dispute(_s, _g, dealId, clauseHash);
    }

    /// @notice The automatic arbiter fixed at opening proposes an outcome the
    ///         terms allow; it applies after the appeal window.
    function proposeRuling(bytes32 dealId, uint16 sellerBps, bytes32 rulingHash) external {
        AgreementDisputeLib.proposeRuling(_g, dealId, sellerBps, rulingHash);
    }

    function escalate(bytes32 dealId) external {
        AgreementDisputeLib.escalate(_s, _g, dealId);
    }

    function executeRuling(bytes32 dealId) external nonReentrant {
        AgreementDisputeLib.executeRuling(_s, _g, hub, dealId);
    }

    /// @notice The reviewer fixed at opening rules an escalated dispute.
    function rule(bytes32 dealId, uint16 sellerBps, bytes32 rulingHash) external nonReentrant {
        AgreementDisputeLib.rule(_s, _g, hub, dealId, sellerBps, rulingHash);
    }

    /// @notice After the reviewer's deadline, anyone applies the terms' fallback.
    function applyFallback(bytes32 dealId) external nonReentrant {
        AgreementDisputeLib.applyFallback(_s, _g, hub, dealId);
    }

    function _onLongstop(bytes32 dealId) internal override {
        _g.deals[dealId].state = AgreementState.Longstopped;
        DisputeLib.drop(_g.disputes, dealId);
        AgreementCommon.releaseStake(hub, _g.terms[dealId], dealId);
    }
}
