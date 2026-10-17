// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDisputeLib} from "../../../src/suite/agreement/AgreementDisputeLib.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";

/// @notice Every step of an Agreement deal is announced with every field.
///         Callers are relayed, so msg.sender is not tx.origin.
contract AgreementEventsTest is AgreementFixture {
    address internal relayer = makeAddr("relayer");
    uint256 internal constant NET = PRICE - 0.5e6;
    uint256 internal constant FEE = 1e6;
    uint256 internal constant FUNDED = PRICE + 0.5e6;
    bytes32 internal constant SALT = bytes32("e");

    function setUp() public {
        _deployAgreement();
    }

    function _plan() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.parts = 4;
        t.partEvery = 7 days;
        t.cancelFeeBps = 1_000;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
    }

    function _disputed() internal returns (bytes32 id) {
        id = _fundAccepted(_terms(), SALT);
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause 2"));
    }

    // ------------------------------- Opening ------------------------------

    function test_funding_acceptance_and_cancellation_are_announced() public {
        AgreementTerms memory t = _terms();
        bytes32 id = escrow.dealIdFor(buyer, SALT);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DealFunded(id, buyer, seller, FUNDED, escrow.termsHashOf(t));
        vm.prank(buyer, relayer);
        escrow.fund(SALT, t);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DealCancelled(id, FUNDED);
        vm.prank(buyer, relayer);
        escrow.cancelUnaccepted(id);

        bytes32 other = _fund(t, bytes32("f"));
        bytes32 h = escrow.termsHashOf(t);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DealAccepted(other);
        vm.prank(seller, relayer);
        escrow.accept(other, h);
    }

    // ---------------------------- Instalments -----------------------------

    /// The last part, paid late, moves the deadline by the lateness first.
    function test_parts_a_late_last_part_and_a_cancelled_plan_are_announced() public {
        uint256 t0 = vm.getBlockTimestamp();
        AgreementTerms memory t = _plan();
        uint256 part = FUNDED / 4;
        bytes32 id = _fund(t, SALT);
        vm.expectEmit(address(escrow));
        emit AgreementLib.PartPaid(id, 2, part);
        vm.prank(buyer, relayer);
        escrow.payPart(id);
        vm.prank(buyer);
        escrow.payPart(id);
        vm.warp(t0 + 21 days + 5 days);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DeadlineMoved(id, t.deliveryDeadline + 5 days);
        vm.expectEmit(address(escrow));
        emit AgreementLib.PartPaid(id, 4, FUNDED - 3 * part);
        vm.prank(buyer);
        escrow.payPart(id);

        bytes32 missed = _fund(_plan(), bytes32("m"));
        vm.warp(vm.getBlockTimestamp() + 7 days + t.reclaimGrace + 1);
        vm.expectEmit(address(escrow));
        emit AgreementLib.PlanCancelled(missed, 0, part);
        vm.prank(stranger);
        escrow.cancelMissed(missed);
    }

    // ------------------------------- Delivery ------------------------------

    function test_delivery_review_and_payment_are_announced() public {
        bytes32 id = _fundAccepted(_terms(), SALT);
        uint64 reviewEnd = uint64(vm.getBlockTimestamp() + 3 days);
        vm.expectEmit(address(escrow));
        emit AgreementLib.Delivered(id, 0, 1, keccak256("proof"));
        vm.expectEmit(address(escrow));
        emit AgreementLib.ReviewStarted(id, 0, reviewEnd);
        vm.prank(seller, relayer);
        escrow.markDelivered(id, keccak256("proof"));
        vm.expectEmit(address(escrow));
        emit AgreementLib.ReviewExtended(id, 1, reviewEnd + 1 days);
        vm.prank(buyer, relayer);
        escrow.requestMoreTime(id);
        vm.expectEmit(address(escrow));
        emit AgreementLib.TranchePaid(id, 0, NET, FEE, false);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DealSettled(id);
        vm.prank(buyer, relayer);
        escrow.release(id);
    }

    function test_a_review_the_buyer_starts_on_arrival_is_announced() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 4 days;
        bytes32 id = _fundAccepted(t, SALT);
        _deliver(id);
        vm.expectEmit(address(escrow));
        emit AgreementLib.ReviewStarted(id, 0, uint64(vm.getBlockTimestamp() + 3 days));
        vm.prank(buyer, relayer);
        escrow.startReview(id);
    }

    function test_a_claim_on_the_timer_is_announced_as_a_claim() public {
        bytes32 id = _fundAccepted(_terms(), SALT);
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.expectEmit(address(escrow));
        emit AgreementLib.TranchePaid(id, 0, NET, FEE, true);
        vm.prank(stranger);
        escrow.claim(id);
    }

    // ------------------------------ Deadlines ------------------------------

    function test_extensions_and_a_reclaim_are_announced() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, SALT);
        uint64 later = t.deliveryDeadline + 2 days;
        vm.expectEmit(address(escrow));
        emit AgreementLib.ExtensionRequested(id, later);
        vm.prank(seller, relayer);
        escrow.requestExtension(id, later);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DeadlineMoved(id, later);
        vm.prank(buyer, relayer);
        escrow.approveExtension(id, later);
        uint64 latest = later + 1 days;
        vm.expectEmit(address(escrow));
        emit AgreementLib.DeadlineMoved(id, latest);
        vm.prank(buyer);
        escrow.extendDeadline(id, latest);
        vm.warp(uint256(latest) + t.reclaimGrace + 1);
        vm.expectEmit(address(escrow));
        emit AgreementLib.DealReclaimed(id, FUNDED, false);
        vm.prank(buyer, relayer);
        escrow.reclaim(id);
    }

    // -------------------------------- Splits -------------------------------

    function test_a_split_proposed_withdrawn_and_settled_is_announced() public {
        bytes32 id = _fundAccepted(_terms(), SALT);
        vm.expectEmit(address(escrow));
        emit AgreementLib.SplitProposed(id, buyer, 4_000);
        vm.prank(buyer, relayer);
        escrow.proposeSplit(id, 4_000);
        vm.expectEmit(address(escrow));
        emit AgreementLib.SplitCancelled(id);
        vm.prank(buyer, relayer);
        escrow.cancelSplit(id);
        vm.prank(seller);
        escrow.proposeSplit(id, 2_500);
        uint256 toSeller = (NET * 2_500) / 10_000;
        uint256 toBuyer = (NET - toSeller) + (FEE - (FEE * 2_500) / 10_000);
        vm.expectEmit(address(escrow));
        emit AgreementLib.SplitSettled(id, 2_500, toSeller, toBuyer);
        vm.prank(buyer, relayer);
        escrow.acceptSplit(id, 2_500);
    }

    // ------------------------------- Disputes ------------------------------

    function test_a_dispute_its_proposal_and_its_ending_are_announced() public {
        bytes32 id = _fundAccepted(_terms(), SALT);
        _deliver(id);
        vm.expectEmit(address(escrow));
        emit DisputeLib.DisputeOpened(id, buyer, keccak256("clause 2"));
        vm.prank(buyer, relayer);
        escrow.dispute(id, keccak256("clause 2"));
        vm.expectEmit(address(escrow));
        emit DisputeLib.RulingProposed(id, 0, keccak256("no delivery"), uint64(vm.getBlockTimestamp() + 72 hours));
        vm.prank(arbiter, relayer);
        escrow.proposeRuling(id, 0, keccak256("no delivery"));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.expectEmit(address(escrow));
        emit DisputeLib.DisputeResolved(id, 0, bytes32(0), 1);
        vm.expectEmit(address(escrow));
        emit AgreementDisputeLib.TrancheRuled(id, 0, 0, 0, NET + FEE);
        vm.prank(stranger);
        escrow.executeRuling(id);
    }

    function test_an_escalation_and_the_reviewers_ruling_are_announced() public {
        bytes32 id = _disputed();
        vm.expectEmit(address(escrow));
        emit DisputeLib.DisputeEscalated(id, arbiter, uint64(vm.getBlockTimestamp() + 5 days));
        vm.prank(arbiter, relayer);
        escrow.escalate(id);
        uint256 toSeller = (NET * 7_000) / 10_000;
        uint256 toBuyer = (NET - toSeller) + (FEE - (FEE * 7_000) / 10_000);
        vm.expectEmit(address(escrow));
        emit DisputeLib.DisputeResolved(id, 7_000, keccak256("ruling"), 2);
        vm.expectEmit(address(escrow));
        emit AgreementDisputeLib.TrancheRuled(id, 0, 7_000, toSeller, toBuyer);
        vm.prank(reviewSafe, relayer);
        escrow.rule(id, 7_000, keccak256("ruling"));
    }

    function test_the_fallback_is_announced() public {
        AgreementTerms memory t = _terms();
        t.fallbackBps = 5_000;
        bytes32 id = _fundAccepted(t, SALT);
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause 2"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        uint256 toSeller = (NET * 5_000) / 10_000;
        uint256 toBuyer = (NET - toSeller) + (FEE - (FEE * 5_000) / 10_000);
        vm.expectEmit(address(escrow));
        emit DisputeLib.DisputeResolved(id, 5_000, bytes32(0), 3);
        vm.expectEmit(address(escrow));
        emit AgreementDisputeLib.TrancheRuled(id, 0, 5_000, toSeller, toBuyer);
        vm.prank(stranger);
        escrow.applyFallback(id);
    }

    /// An accepted plan that misses a part leaves the seller the cancel fee.
    function test_a_cancelled_accepted_plan_announces_the_cancel_fee() public {
        AgreementTerms memory t = _plan();
        uint256 part = FUNDED / 4;
        bytes32 id = _fundAccepted(t, SALT);
        vm.warp(vm.getBlockTimestamp() + 7 days + t.reclaimGrace + 1);
        uint256 fee = (uint256(PRICE) * 1_000) / 10_000;
        vm.expectEmit(address(escrow));
        emit AgreementLib.PlanCancelled(id, fee, part - fee);
        vm.prank(stranger);
        escrow.cancelMissed(id);
    }

    /// The second of two tranches is announced as tranche 1, its delivery as
    /// the deal's second revision.
    function test_the_second_tranche_is_announced_by_its_index() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        bytes32 id = _fundAccepted(t, SALT);
        _deliver(id);
        vm.expectEmit(address(escrow));
        emit AgreementLib.TranchePaid(id, 0, NET / 2, FEE / 2, false);
        vm.prank(buyer);
        escrow.release(id);
        vm.expectEmit(address(escrow));
        emit AgreementLib.Delivered(id, 1, 2, keccak256("second"));
        vm.expectEmit(address(escrow));
        emit AgreementLib.ReviewStarted(id, 1, uint64(vm.getBlockTimestamp() + 3 days));
        vm.prank(seller);
        escrow.markDelivered(id, keccak256("second"));
        vm.expectEmit(address(escrow));
        emit AgreementLib.TranchePaid(id, 1, NET - NET / 2, FEE - FEE / 2, false);
        vm.prank(buyer);
        escrow.release(id);
    }

    function test_a_ruling_on_the_second_tranche_names_it() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        bytes32 id = _fundAccepted(t, SALT);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        vm.prank(seller);
        escrow.markDelivered(id, keccak256("second"));
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause 2"));
        vm.prank(arbiter);
        escrow.escalate(id);
        uint256 net = NET - NET / 2;
        uint256 fee = FEE - FEE / 2;
        uint256 toSeller = (net * 7_000) / 10_000;
        uint256 toBuyer = (net - toSeller) + (fee - (fee * 7_000) / 10_000);
        vm.expectEmit(address(escrow));
        emit AgreementDisputeLib.TrancheRuled(id, 1, 7_000, toSeller, toBuyer);
        vm.prank(reviewSafe);
        escrow.rule(id, 7_000, keccak256("ruling"));
    }

    /// Deal ids and terms hashes come from published encodings.
    function test_the_deal_id_and_the_terms_hash_follow_their_published_encodings() public view {
        AgreementTerms memory t = _terms();
        assertEq(escrow.dealIdFor(buyer, SALT), keccak256(abi.encode(block.chainid, address(escrow), buyer, SALT)));
        assertEq(escrow.termsHashOf(t), keccak256(abi.encode(t)));
    }
}
