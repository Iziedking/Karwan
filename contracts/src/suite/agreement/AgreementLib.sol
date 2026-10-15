// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, Outcome} from "../interfaces/IKarwanSuite.sol";
import {DealAccount, SettlementStore, SettlementLib} from "../settlement/SettlementLib.sol";
import {
    AgreementTerms,
    AgreementDeal,
    AgreementState,
    AgreementStore,
    AgreementBounds,
    SplitOffer,
    AgreementCodes as C
} from "./AgreementTypes.sol";
import {AgreementTermsLib} from "./AgreementTermsLib.sol";
import {AgreementDeliveryLib} from "./AgreementDeliveryLib.sol";
import {DisputeLib} from "../dispute/DisputeLib.sol";
import {AgreementCommon} from "./AgreementCommon.sol";
import {AgreementDisputeLib} from "./AgreementDisputeLib.sol";
import {SigCheck} from "../SigCheck.sol";

/// @title AgreementLib
/// @notice The Agreement family's deal rules, linked once at deploy and never
///         changeable. It runs in the escrow's own context; every payout goes
///         through `SettlementLib`, so money only reaches the deal's parties, a
///         signed assignee, or the fee within its rate.
library AgreementLib {
    uint8 internal constant MAX_EXTENSION_REQUESTS = 3;
    bytes32 internal constant RELEASE_TYPEHASH = keccak256("Release(bytes32 dealId,uint8 tranche,uint256 deadline)");

    event DealFunded(bytes32 indexed dealId, address indexed buyer, address indexed seller, uint256 funded, bytes32 termsHash);
    event DealAccepted(bytes32 indexed dealId);
    event DealCancelled(bytes32 indexed dealId, uint256 refunded);
    event Delivered(bytes32 indexed dealId, uint8 tranche, uint32 revision, bytes32 proofHash);
    event ReviewStarted(bytes32 indexed dealId, uint8 tranche, uint64 reviewEnd);
    event CheckReported(bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash);
    event ReviewExtended(bytes32 indexed dealId, uint8 used, uint64 reviewEnd);
    event TranchePaid(bytes32 indexed dealId, uint8 tranche, uint256 sellerAmount, uint256 fee, bool byClaim);
    event DealSettled(bytes32 indexed dealId);
    event DealReclaimed(bytes32 indexed dealId, uint256 refunded, bool deposit);
    event DeadlineMoved(bytes32 indexed dealId, uint64 deadline);
    event ExtensionRequested(bytes32 indexed dealId, uint64 deadline);
    event SplitProposed(bytes32 indexed dealId, address proposer, uint16 sellerBps);
    event SplitCancelled(bytes32 indexed dealId);
    event SplitSettled(bytes32 indexed dealId, uint16 sellerBps, uint256 toSeller, uint256 toBuyer);
    event PartPaid(bytes32 indexed dealId, uint8 part, uint256 amount);
    event PlanCancelled(bytes32 indexed dealId, uint256 toSeller, uint256 toBuyer);

    error BadState();
    error BadTerms();
    error BadCaller();
    error BadAmount();
    error HashMismatch();
    error Late();
    error BadSignature();
    error Early();

    function dealIdFor(address buyer, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), buyer, salt));
    }

    // ------------------------------ Funding -------------------------------

    function fund(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        AgreementBounds calldata b,
        bytes32 salt,
        AgreementTerms calldata t
    ) external returns (bytes32 dealId) {
        dealId = dealIdFor(msg.sender, salt);
        address[] memory payees = new address[](1);
        payees[0] = t.seller;
        IKarwanHub.OpeningConfig memory cfg = SettlementLib.open(s, hub, dealId, t.asset, msg.sender, payees, _horizonOf(t));
        uint8 count = AgreementTermsLib.validate(
            t, AgreementTermsLib.Limits(b.minReview, b.maxReview, b.maxHorizon, cfg.highValue)
        );
        if (t.verifier != address(0) && !hub.isVerifier(t.verifier)) revert BadTerms();
        uint256 fee = (uint256(t.amount) * cfg.feeBps) / C.BPS;
        uint256 buyerFee = fee / 2;
        AgreementDeal storage d = g.deals[dealId];
        d.state = AgreementState.Funded;
        d.count = count;
        d.deadline = t.deliveryDeadline;
        d.sellerNet = uint128(uint256(t.amount) - (fee - buyerFee));
        d.feeTotal = uint128(fee);
        d.termsHash = keccak256(abi.encode(t));
        d.fundedAt = uint64(block.timestamp);
        g.terms[dealId] = t;
        bool high = cfg.highValue != 0 && t.amount >= cfg.highValue;
        DisputeLib.setPanel(g.disputes, dealId, cfg.autoArbiter, high ? cfg.seniorSafe : cfg.reviewSafe);
        uint256 total = uint256(t.amount) + buyerFee;
        uint256 first = total;
        if (t.parts != 0) {
            first = total / t.parts;
            d.partsPaid = 1;
            SettlementLib.pledge(s, hub, dealId, total);
        }
        SettlementLib.fund(s, hub, dealId, first);
        emit DealFunded(dealId, msg.sender, t.seller, first, d.termsHash);
    }

    // ----------------------------- Instalments ----------------------------

    /// @notice The buyer pays the next part of an instalment plan, at any time
    ///         until someone ends a missed plan. The last part pays whatever is
    ///         left; paid late, it moves the delivery deadline by its lateness,
    ///         so the seller keeps the time the terms gave them.
    function payPart(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId) external {
        AgreementDeal storage d = g.deals[dealId];
        uint8 parts = g.terms[dealId].parts;
        if ((d.state != AgreementState.Funded && d.state != AgreementState.Accepted) || d.partsPaid >= parts) {
            revert BadState();
        }
        uint256 amount = d.partsPaid + 1 == parts
            ? s.accounts[dealId].promised
            : (uint256(d.sellerNet) + d.feeTotal) / parts;
        d.partsPaid += 1;
        if (d.partsPaid == parts) _moveForLatePlan(s, g, d, dealId);
        emit PartPaid(dealId, d.partsPaid, amount);
        SettlementLib.fund(s, hub, dealId, amount);
    }

    /// @notice Once a part is past its due time and the grace, anyone ends the
    ///         plan: the seller keeps the agreed cancellation fee, the buyer
    ///         gets the rest, and Karwan takes nothing. The fee applies only
    ///         after the seller accepted and while the buyer could still pay.
    function cancelMissed(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId)
        external
    {
        AgreementDeal storage d = g.deals[dealId];
        AgreementTerms storage t = g.terms[dealId];
        bool accepted = d.state == AgreementState.Accepted;
        if ((!accepted && d.state != AgreementState.Funded) || d.partsPaid >= t.parts) revert BadState();
        if (!_partOverdue(d, t)) revert Early();
        DealAccount storage a = s.accounts[dealId];
        uint256 balance = a.balance;
        uint256 toSeller;
        if (accepted && SettlementLib.takesPromised(hub, a.asset)) {
            toSeller = (uint256(t.amount) * t.cancelFeeBps) / C.BPS;
            if (toSeller > balance) toSeller = balance;
        }
        d.state = AgreementState.Refunded;
        SettlementLib.payTo(s, dealId, t.seller, toSeller);
        SettlementLib.payTo(s, dealId, a.payer, balance - toSeller);
        SettlementLib.close(s, dealId);
        emit PlanCancelled(dealId, toSeller, balance - toSeller);
        if (accepted) AgreementCommon.recordBoth(s, hub, dealId, Outcome.CANCELLED, 0);
        else SettlementLib.recordOutcome(s, hub, dealId, AgreementCommon.BUYER, Outcome.CANCELLED, 0);
    }

    function accept(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, bytes32 termsHash) external {
        AgreementDeal storage d = g.deals[dealId];
        if (d.state != AgreementState.Funded) revert BadState();
        AgreementTerms storage t = g.terms[dealId];
        if (msg.sender != t.seller) revert BadCaller();
        if (block.timestamp > t.acceptBy || _partOverdue(d, t)) revert Late();
        if (termsHash != d.termsHash) revert HashMismatch();
        d.state = AgreementState.Accepted;
        SettlementLib.markConsent(s, dealId, msg.sender);
        emit DealAccepted(dealId);
    }

    function cancelUnaccepted(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId)
        external
    {
        AgreementDeal storage d = g.deals[dealId];
        if (d.state != AgreementState.Funded) revert BadState();
        address buyer = _onlyBuyer(s, dealId);
        uint256 amount = s.accounts[dealId].balance;
        d.state = AgreementState.Refunded;
        SettlementLib.payTo(s, dealId, buyer, amount);
        SettlementLib.close(s, dealId);
        emit DealCancelled(dealId, amount);
        SettlementLib.recordOutcome(s, hub, dealId, AgreementCommon.BUYER, Outcome.CANCELLED, 0);
    }

    // ------------------------------ Delivery ------------------------------

    function markDelivered(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, bytes32 proofHash)
        external
    {
        AgreementTerms storage t = _onlySeller(g, dealId);
        AgreementDeal storage d = g.deals[dealId];
        bool started = AgreementDeliveryLib.mark(d, t, s.accounts[dealId].holdUsed);
        AgreementCommon.bumpHorizon(s, dealId, uint256(d.deliveredAt) + t.startLongstop + t.silentLongstop + SettlementLib.HOLD_BUDGET);
        emit Delivered(dealId, d.paid, d.revision, proofHash);
        if (started) emit ReviewStarted(dealId, d.paid, d.reviewEnd);
    }

    function startReview(SettlementStore storage s, AgreementStore storage g, bytes32 dealId) external {
        _onlyBuyer(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        AgreementDeliveryLib.buyerStart(d, g.terms[dealId]);
        emit ReviewStarted(dealId, d.paid, d.reviewEnd);
    }

    function attestCheck(
        SettlementStore storage s,
        AgreementStore storage g,
        bytes32 dealId,
        uint32 revision,
        bool pass,
        bytes32 evidenceHash
    ) external {
        AgreementTerms storage t = g.terms[dealId];
        if (msg.sender != t.verifier || t.verifier == address(0)) revert BadCaller();
        AgreementDeal storage d = g.deals[dealId];
        bool started = AgreementDeliveryLib.attest(d, t, revision, pass, AgreementCommon.holdSince(s, d, dealId));
        emit CheckReported(dealId, revision, pass, evidenceHash);
        if (started) emit ReviewStarted(dealId, d.paid, d.reviewEnd);
    }

    function requestMoreTime(SettlementStore storage s, AgreementStore storage g, bytes32 dealId) external {
        _onlyBuyer(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        AgreementDeliveryLib.moreTime(d, g.terms[dealId], AgreementCommon.holdSince(s, d, dealId));
        emit ReviewExtended(dealId, d.extUsed, d.reviewEnd);
    }

    // ------------------------------ Payment -------------------------------

    /// @notice The buyer pays the next tranche. Open while the deal runs,
    ///         including during a dispute, which it ends.
    function release(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId) external {
        _onlyBuyer(s, dealId);
        _settle(s, g, dealId);
        _payTranche(s, g, hub, dealId, false);
    }

    /// @notice The same release, carried by the buyer's signature over the
    ///         deal and tranche, so anyone can submit it and the buyer pays no
    ///         gas: the app sends it, or a courier scans it at handover.
    function releaseBySig(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 domainSeparator,
        bytes32 dealId,
        uint8 tranche,
        uint256 deadline,
        bytes calldata sig
    ) external {
        if (block.timestamp > deadline) revert Late();
        if (tranche != g.deals[dealId].paid) revert HashMismatch();
        bytes32 digest = releaseDigest(domainSeparator, dealId, tranche, deadline);
        if (!SigCheck.isValid(s.accounts[dealId].payer, digest, sig)) revert BadSignature();
        _settle(s, g, dealId);
        _payTranche(s, g, hub, dealId, false);
    }

    function releaseDigest(bytes32 domainSeparator, bytes32 dealId, uint8 tranche, uint256 deadline)
        public
        pure
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(RELEASE_TYPEHASH, dealId, tranche, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @notice Anyone can trigger a claim the terms allow; the seller is paid.
    function claim(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId) external {
        AgreementCommon.notHeld(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        AgreementDeliveryLib.checkClaim(d, g.terms[dealId], AgreementCommon.holdSince(s, d, dealId));
        _payTranche(s, g, hub, dealId, true);
    }

    // ------------------------------ Deadlines -----------------------------

    /// @notice Anyone can trigger a refund the terms allow; the buyer is paid.
    function reclaim(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId) external {
        address buyer = s.accounts[dealId].payer;
        AgreementDeal storage d = g.deals[dealId];
        AgreementTerms storage t = g.terms[dealId];
        AgreementDeliveryLib.checkReclaim(d, t);
        bool deposit = t.silenceOutcome == C.SILENCE_REFUNDS_BUYER;
        uint256 amount = s.accounts[dealId].balance;
        d.state = AgreementState.Reclaimed;
        SettlementLib.payTo(s, dealId, buyer, amount);
        SettlementLib.close(s, dealId);
        emit DealReclaimed(dealId, amount, deposit);
        AgreementCommon.recordBoth(s, hub, dealId, deposit ? Outcome.DEPOSIT_RETURNED : Outcome.FAILED, 0);
    }

    function extendDeadline(
        SettlementStore storage s,
        AgreementStore storage g,
        uint64 maxHorizon,
        bytes32 dealId,
        uint64 newDeadline
    ) external {
        _onlyBuyer(s, dealId);
        _moveDeadline(s, g, maxHorizon, dealId, newDeadline);
    }

    function requestExtension(AgreementStore storage g, bytes32 dealId, uint64 newDeadline) external {
        _onlySeller(g, dealId);
        AgreementDeal storage d = g.deals[dealId];
        if (d.state != AgreementState.Accepted || newDeadline <= d.deadline) revert BadState();
        if (d.extRequests >= MAX_EXTENSION_REQUESTS) revert Late();
        d.extRequests += 1;
        d.requestedDeadline = newDeadline;
        emit ExtensionRequested(dealId, newDeadline);
    }

    function approveExtension(
        SettlementStore storage s,
        AgreementStore storage g,
        uint64 maxHorizon,
        bytes32 dealId,
        uint64 newDeadline
    ) external {
        _onlyBuyer(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        if (d.requestedDeadline == 0 || d.requestedDeadline != newDeadline) revert HashMismatch();
        d.requestedDeadline = 0;
        _moveDeadline(s, g, maxHorizon, dealId, newDeadline);
    }

    // ------------------------------- Splits -------------------------------

    function proposeSplit(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, uint16 sellerBps)
        external
    {
        AgreementDeal storage d = g.deals[dealId];
        _running(g, d, dealId);
        if (sellerBps > C.BPS) revert BadAmount();
        if (msg.sender != s.accounts[dealId].payer && msg.sender != g.terms[dealId].seller) revert BadCaller();
        g.splits[dealId] = SplitOffer(msg.sender, sellerBps, true, d.paid);
        emit SplitProposed(dealId, msg.sender, sellerBps);
    }

    function cancelSplit(AgreementStore storage g, bytes32 dealId) external {
        SplitOffer storage o = g.splits[dealId];
        if (!o.active || msg.sender != o.proposer) revert BadCaller();
        delete g.splits[dealId];
        emit SplitCancelled(dealId);
    }

    function acceptSplit(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 dealId,
        uint16 sellerBps
    ) external {
        AgreementDeal storage d = g.deals[dealId];
        _running(g, d, dealId);
        SplitOffer memory o = g.splits[dealId];
        if (!o.active || o.sellerBps != sellerBps || o.paid != d.paid) revert HashMismatch();
        address buyer = s.accounts[dealId].payer;
        address seller = g.terms[dealId].seller;
        if (msg.sender == o.proposer || (msg.sender != buyer && msg.sender != seller)) revert BadCaller();
        delete g.splits[dealId];
        DisputeLib.drop(g.disputes, dealId);
        split(s, g, hub, dealId, sellerBps, AgreementState.Split, Outcome.SPLIT);
    }

    /// @notice Ends the deal by splitting what is left between the two parties.
    function split(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 dealId,
        uint16 sellerBps,
        AgreementState ending,
        uint8 outcome
    ) public {
        AgreementDeal storage d = g.deals[dealId];
        uint256 net = d.sellerNet - d.released;
        uint256 fee = d.feeTotal - d.feeReleased;
        uint256 toSeller = (net * sellerBps) / C.BPS;
        uint256 feeCut = (fee * sellerBps) / C.BPS;
        uint256 toBuyer = (net - toSeller) + (fee - feeCut);
        d.released = d.sellerNet;
        d.feeReleased = d.feeTotal;
        d.paid = d.count;
        d.state = ending;
        SettlementLib.payTo(s, dealId, g.terms[dealId].seller, toSeller);
        SettlementLib.payFee(s, dealId, feeCut);
        SettlementLib.payTo(s, dealId, s.accounts[dealId].payer, toBuyer);
        SettlementLib.close(s, dealId);
        emit SplitSettled(dealId, sellerBps, toSeller, toBuyer);
        AgreementCommon.recordBoth(s, hub, dealId, outcome, sellerBps);
    }

    // ------------------------------ Internals -----------------------------

    function _payTranche(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 dealId,
        bool byClaim
    ) private {
        AgreementDeal storage d = g.deals[dealId];
        (uint256 sellerCut, uint256 feeCut, bool last) = AgreementDeliveryLib.nextTranche(d, g.terms[dealId]);
        SettlementLib.payTo(s, dealId, g.terms[dealId].seller, sellerCut);
        SettlementLib.payFee(s, dealId, feeCut);
        emit TranchePaid(dealId, d.paid - 1, sellerCut, feeCut, byClaim);
        if (last) {
            d.state = AgreementState.Settled;
            SettlementLib.close(s, dealId);
            emit DealSettled(dealId);
            AgreementCommon.recordBoth(s, hub, dealId, Outcome.COMPLETED, 0);
        }
    }

    /// Before a payment both sides agree to: the plan is fully paid and any
    /// dispute ends.
    function _settle(SettlementStore storage s, AgreementStore storage g, bytes32 dealId) private {
        AgreementDeal storage d = g.deals[dealId];
        if (d.partsPaid < g.terms[dealId].parts) revert BadState();
        if (d.state == AgreementState.Disputed) {
            uint64 openedAt = g.disputes.disputes[dealId].openedAt;
            DisputeLib.drop(g.disputes, dealId);
            AgreementDisputeLib.endDispute(s, g, dealId, openedAt);
        }
    }

    /// A plan's next part is past its due time and the grace.
    function _partOverdue(AgreementDeal storage d, AgreementTerms storage t) private view returns (bool) {
        if (d.partsPaid >= t.parts) return false;
        uint256 due = uint256(d.fundedAt) + uint256(d.partsPaid) * t.partEvery;
        return block.timestamp > due + t.reclaimGrace;
    }

    function _moveForLatePlan(SettlementStore storage s, AgreementStore storage g, AgreementDeal storage d, bytes32 dealId)
        private
    {
        AgreementTerms storage t = g.terms[dealId];
        uint256 lastDue = uint256(d.fundedAt) + uint256(t.parts - 1) * t.partEvery;
        if (block.timestamp <= lastDue) return;
        d.deadline += uint64(block.timestamp - lastDue);
        AgreementCommon.bumpHorizon(s, dealId, uint256(d.deadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop);
        emit DeadlineMoved(dealId, d.deadline);
    }

    function _running(AgreementStore storage g, AgreementDeal storage d, bytes32 dealId) private view {
        if (
            (d.state != AgreementState.Accepted && d.state != AgreementState.Disputed)
                || d.partsPaid < g.terms[dealId].parts
        ) revert BadState();
    }

    function _moveDeadline(
        SettlementStore storage s,
        AgreementStore storage g,
        uint64 maxHorizon,
        bytes32 dealId,
        uint64 newDeadline
    ) private {
        AgreementDeal storage d = g.deals[dealId];
        if (d.state != AgreementState.Accepted) revert BadState();
        if (newDeadline <= d.deadline || newDeadline > block.timestamp + maxHorizon) revert BadTerms();
        d.deadline = newDeadline;
        AgreementTerms storage t = g.terms[dealId];
        AgreementCommon.bumpHorizon(s, dealId, uint256(newDeadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop);
        emit DeadlineMoved(dealId, newDeadline);
    }

    function _horizonOf(AgreementTerms calldata t) private pure returns (uint64) {
        uint256 h = uint256(t.deliveryDeadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop;
        return h > type(uint64).max ? type(uint64).max : uint64(h);
    }

    function _onlyBuyer(SettlementStore storage s, bytes32 dealId) private view returns (address buyer) {
        buyer = s.accounts[dealId].payer;
        if (msg.sender != buyer) revert BadCaller();
    }

    function _onlySeller(AgreementStore storage g, bytes32 dealId) private view returns (AgreementTerms storage t) {
        t = g.terms[dealId];
        if (msg.sender != t.seller || t.seller == address(0)) revert BadCaller();
    }
}
