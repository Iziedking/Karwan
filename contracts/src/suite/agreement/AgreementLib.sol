// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, Outcome} from "../interfaces/IKarwanSuite.sol";
import {SettlementStore, SettlementLib} from "../settlement/SettlementLib.sol";
import {AgreementTerms, AgreementDeal, AgreementState, AgreementCodes as C} from "./AgreementTypes.sol";
import {AgreementTermsLib} from "./AgreementTermsLib.sol";
import {AgreementDeliveryLib} from "./AgreementDeliveryLib.sol";

/// An offer holds only while no further tranche is paid.
struct SplitOffer {
    address proposer;
    uint16 sellerBps;
    bool active;
    uint8 paid;
}

/// @notice An Agreement family's own books.
struct AgreementStore {
    mapping(bytes32 => AgreementDeal) deals;
    mapping(bytes32 => AgreementTerms) terms;
    mapping(bytes32 => SplitOffer) splits;
}

struct AgreementBounds {
    uint64 minReview;
    uint64 maxReview;
    uint64 maxHorizon;
}

/// @title AgreementLib
/// @notice The Agreement family's deal rules, linked once at deploy and never
///         changeable. It runs in the escrow's own context; every payout goes
///         through `SettlementLib`, so money only reaches the deal's parties, a
///         signed assignee, or the fee within its rate.
library AgreementLib {
    uint8 internal constant MAX_EXTENSION_REQUESTS = 3;
    uint8 internal constant BUYER = 0;
    uint8 internal constant SELLER = 1;

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

    error BadState();
    error BadTerms();
    error BadCaller();
    error BadAmount();
    error HashMismatch();
    error Late();
    error OnHold();

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
        g.terms[dealId] = t;
        SettlementLib.fund(s, hub, dealId, uint256(t.amount) + buyerFee);
        emit DealFunded(dealId, msg.sender, t.seller, uint256(t.amount) + buyerFee, d.termsHash);
    }

    function accept(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, bytes32 termsHash) external {
        AgreementDeal storage d = g.deals[dealId];
        if (d.state != AgreementState.Funded) revert BadState();
        AgreementTerms storage t = g.terms[dealId];
        if (msg.sender != t.seller) revert BadCaller();
        if (block.timestamp > t.acceptBy) revert Late();
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
        SettlementLib.recordOutcome(s, hub, dealId, BUYER, Outcome.CANCELLED, 0);
    }

    // ------------------------------ Delivery ------------------------------

    function markDelivered(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, bytes32 proofHash)
        external
    {
        AgreementTerms storage t = _onlySeller(g, dealId);
        AgreementDeal storage d = g.deals[dealId];
        bool started = AgreementDeliveryLib.mark(d, t, s.accounts[dealId].holdUsed);
        _bumpHorizon(s, dealId, uint256(d.deliveredAt) + t.startLongstop + t.silentLongstop + SettlementLib.HOLD_BUDGET);
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
        bool started = AgreementDeliveryLib.attest(d, t, revision, pass, _holdSince(s, d, dealId));
        emit CheckReported(dealId, revision, pass, evidenceHash);
        if (started) emit ReviewStarted(dealId, d.paid, d.reviewEnd);
    }

    function requestMoreTime(SettlementStore storage s, AgreementStore storage g, bytes32 dealId) external {
        _onlyBuyer(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        AgreementDeliveryLib.moreTime(d, g.terms[dealId], _holdSince(s, d, dealId));
        emit ReviewExtended(dealId, d.extUsed, d.reviewEnd);
    }

    // ------------------------------ Payment -------------------------------

    function release(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId) external {
        _onlyBuyer(s, dealId);
        _payTranche(s, g, hub, dealId, false);
    }

    /// @notice Anyone can trigger a claim the terms allow; the seller is paid.
    function claim(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId) external {
        _notHeld(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        AgreementDeliveryLib.checkClaim(d, g.terms[dealId], _holdSince(s, d, dealId));
        _payTranche(s, g, hub, dealId, true);
    }

    function submitCode(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 dealId,
        bytes32 code
    ) external {
        AgreementTerms storage t = g.terms[dealId];
        _notHeld(s, dealId);
        AgreementDeal storage d = g.deals[dealId];
        if (t.codeHash == bytes32(0) || d.codeUsed) revert BadState();
        if (keccak256(abi.encode(dealId, code)) != t.codeHash) revert HashMismatch();
        d.codeUsed = true;
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
        _recordBoth(s, hub, dealId, deposit ? Outcome.DEPOSIT_RETURNED : Outcome.FAILED, 0);
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
        if (d.state != AgreementState.Accepted) revert BadState();
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
        if (d.state != AgreementState.Accepted) revert BadState();
        SplitOffer memory o = g.splits[dealId];
        if (!o.active || o.sellerBps != sellerBps || o.paid != d.paid) revert HashMismatch();
        address buyer = s.accounts[dealId].payer;
        address seller = g.terms[dealId].seller;
        if (msg.sender == o.proposer || (msg.sender != buyer && msg.sender != seller)) revert BadCaller();
        delete g.splits[dealId];
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
        _recordBoth(s, hub, dealId, outcome, sellerBps);
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
            _recordBoth(s, hub, dealId, Outcome.COMPLETED, 0);
        }
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
        _bumpHorizon(s, dealId, uint256(newDeadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop);
        emit DeadlineMoved(dealId, newDeadline);
    }

    function _bumpHorizon(SettlementStore storage s, bytes32 dealId, uint256 horizon) private {
        uint256 cap = block.timestamp + SettlementLib.MAX_HORIZON;
        SettlementLib.extendHorizon(s, dealId, uint64(horizon > cap ? cap : horizon));
    }

    function _horizonOf(AgreementTerms calldata t) private pure returns (uint64) {
        uint256 h = uint256(t.deliveryDeadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop;
        return h > type(uint64).max ? type(uint64).max : uint64(h);
    }

    function _recordBoth(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, uint8 outcome, uint16 detail)
        private
    {
        SettlementLib.recordOutcome(s, hub, dealId, BUYER, outcome, detail);
        SettlementLib.recordOutcome(s, hub, dealId, SELLER, outcome, detail);
    }

    /// Hold time used since the current delivery was marked.
    function _holdSince(SettlementStore storage s, AgreementDeal storage d, bytes32 dealId)
        private
        view
        returns (uint64)
    {
        return s.accounts[dealId].holdUsed - d.holdBase;
    }

    function _notHeld(SettlementStore storage s, bytes32 dealId) private view {
        if (s.accounts[dealId].holdUntil > block.timestamp) revert OnHold();
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
