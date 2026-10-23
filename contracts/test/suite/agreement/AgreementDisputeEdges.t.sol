// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementDisputeLib} from "../../../src/suite/agreement/AgreementDisputeLib.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementCommon} from "../../../src/suite/agreement/AgreementCommon.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";
import {IKarwanStakeVault} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice What every step that can move a deal's horizon does to it and to the
///         seller's stake reservation, the cap on how far it moves, and the
///         dispute steps' own guards.
contract AgreementDisputeEdgesTest is AgreementFixture {
    uint64 internal constant LONGEST = 5 days + 72 hours + 5 days;
    uint64 internal constant RULING_PERIOD = 5 days;

    function setUp() public {
        _deployAgreement();
        usdc.mint(seller, 1_000e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), 50e6);
        vm.stopPrank();
    }

    function _staked(AgreementTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        id = _fund(t, salt);
        uint256 deadline = block.timestamp + 1 hours;
        uint64 expiresAt = escrow.accountOf(id).horizon + 180 days + 30 days;
        bytes32 digest =
            vault.reserveDigest(address(escrow), id, address(usdc), t.sellerStake, buyer, expiresAt, deadline);
        bytes32 h = escrow.termsHashOf(t);
        bytes memory sig = _sig(sellerKey, digest);
        vm.prank(seller);
        escrow.acceptWithStake(id, h, deadline, sig);
    }

    function _horizon(bytes32 id) internal view returns (uint64) {
        return escrow.accountOf(id).horizon;
    }

    function _stakeKept(bytes32 id) internal view {
        assertEq(vault.expiryOf(address(escrow), id), _horizon(id) + 180 days + 30 days);
    }

    function _noStakeHookFailure() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != AgreementCommon.StakeHookFailed.selector);
        }
    }

    /// Delivery already pushes the horizon 30 days past the silence longstop,
    /// so a dispute shows only late: the buyer releases the last part, three
    /// holds have used 21 days, and the buyer disputes 34 days after delivery.
    function test_a_late_dispute_and_its_escalation_move_the_horizon_and_the_stake_with_it() public {
        AgreementTerms memory t = _terms();
        t.finalRelease = 1;
        t.sellerStake = 10e6;
        bytes32 id = _staked(t, bytes32("d"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        assertEq(_horizon(id), t0 + t.silentLongstop + 30 days);
        for (uint256 i; i < 3; ++i) {
            vm.warp(t0 + i * 7 days);
            vm.prank(guardian);
            escrow.hold(id, bytes32("scan"));
        }
        vm.warp(t0 + 34 days);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        assertEq(_horizon(id), t0 + 34 days + LONGEST);
        _stakeKept(id);
        vm.warp(t0 + 43 days);
        vm.prank(arbiter);
        escrow.escalate(id);
        assertEq(_horizon(id), t0 + 43 days + RULING_PERIOD);
        _stakeKept(id);
    }

    /// A ruling ends the dispute: the deadline moves by the time the dispute
    /// held it and the horizon follows the moved deadline, past 2106 too.
    function test_a_ruling_moves_the_deadline_by_the_dispute_and_the_horizon_with_it() public {
        vm.warp((uint256(1) << 32) + 1_000);
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        t.reviewStarts = 1;
        t.startLongstop = 4 days;
        t.silentLongstop = 20 days;
        t.sellerStake = 10e6;
        bytes32 id = _staked(t, bytes32("r"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint64 deadline = _deal(id).deadline;
        vm.warp(t0 + 40 days);
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.warp(t0 + 41 days);
        vm.prank(reviewSafe);
        escrow.rule(id, 7_000, keccak256("ruling"));
        assertEq(_deal(id).deadline, deadline + 41 days);
        assertEq(_horizon(id), uint256(deadline) + 41 days + t.reclaimGrace + t.startLongstop + t.silentLongstop);
        _stakeKept(id);
    }

    function test_dispute_steps_on_an_undisputed_deal_are_refused_as_its_state() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("u"));
        _deliver(id);
        vm.prank(arbiter);
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.rule(id, 5_000, keccak256("ruling"));
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.applyFallback(id);
    }

    function test_a_proposed_ruling_waits_out_a_hold() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("h"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.prank(arbiter);
        escrow.proposeRuling(id, 10_000, keccak256("ruling"));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        vm.expectRevert(AgreementCommon.OnHold.selector);
        escrow.executeRuling(id);
    }

    /// Terms whose horizon starts exactly at the 730-day cap: a delivery would
    /// push it further, and the cap holds it there.
    function test_a_delivery_never_pushes_the_horizon_past_the_cap() public {
        vm.warp(1_800_000_000);
        AgreementTerms memory t = _terms();
        t.acceptBy = uint64(block.timestamp + 1 hours);
        t.deliveryDeadline = uint64(block.timestamp + 1 days);
        t.reclaimGrace = 0;
        t.reviewWindow = 1 hours;
        t.maxExtensions = 0;
        t.extensionSecs = 0;
        t.reviewStarts = 1;
        t.startLongstop = 364 days;
        t.silentLongstop = 365 days;
        bytes32 id = _fundAccepted(t, bytes32("cap"));
        assertEq(_horizon(id), vm.getBlockTimestamp() + 730 days);
        _deliver(id);
        assertEq(_horizon(id), vm.getBlockTimestamp() + 730 days);
    }

    /// Steps that leave the horizon where it is never touch the reservation,
    /// and keeping the stake after it was freed does nothing.
    function test_steps_that_leave_the_horizon_ask_nothing_of_the_vault() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        t.sellerStake = 10e6;
        bytes32 id = _staked(t, bytes32("k"));
        _deliver(id);
        vm.recordLogs();
        vm.prank(buyer);
        escrow.release(id);
        _noStakeHookFailure();
        _deliver(id);
        vm.recordLogs();
        vm.prank(buyer);
        escrow.release(id);
        _noStakeHookFailure();
        assertEq(vault.expiryOf(address(escrow), id), 0);
    }

    /// A hold that fell before the delivery does not delay its review.
    function test_a_hold_before_the_delivery_does_not_delay_its_claim() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("b"));
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        vm.warp(vm.getBlockTimestamp() + 8 days);
        _deliver(id);
        vm.warp(uint256(_deal(id).deliveredAt) + 3 days);
        escrow.claim(id);
        assertEq(_deal(id).paid, 1);
    }

    /// The last part of a plan paid a day late moves the deadline by that day,
    /// and the horizon with it, every term of the horizon counted.
    function test_a_late_last_part_moves_the_deadline_and_the_horizon_with_it() public {
        AgreementTerms memory t = _terms();
        t.parts = 3;
        t.partEvery = 7 days;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        t.reviewStarts = 1;
        t.startLongstop = 4 days;
        t.silentLongstop = 20 days;
        bytes32 id = _fundAccepted(t, bytes32("plan"));
        uint256 fundedAt = _deal(id).fundedAt;
        uint64 deadline = _deal(id).deadline;
        vm.warp(fundedAt + 7 days);
        vm.prank(buyer);
        escrow.payPart(id);
        vm.warp(fundedAt + 14 days + 1 days);
        vm.prank(buyer);
        escrow.payPart(id);
        assertEq(_deal(id).deadline, deadline + 1 days);
        assertEq(_horizon(id), uint256(deadline) + 1 days + t.reclaimGrace + t.startLongstop + t.silentLongstop);
    }

    /// A ruling wholly for the seller slashes nothing, and the vault is never
    /// asked to.
    function test_a_ruling_wholly_for_the_seller_never_asks_the_vault_to_slash() public {
        AgreementTerms memory t = _terms();
        t.sellerStake = 10e6;
        bytes32 id = _staked(t, bytes32("w"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.warp(t0 + 40 days);
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.expectCall(address(vault), abi.encodeWithSelector(IKarwanStakeVault.slash.selector), 0);
        vm.prank(reviewSafe);
        escrow.rule(id, 10_000, keccak256("ruling"));
    }

    /// A dispute opened on the last second of the deadline's clock ends with
    /// nothing to move: the horizon it would ask for is the moment it ends.
    function test_a_dispute_opened_as_the_deadlines_clock_runs_out_ends_without_a_bump() public {
        AgreementTerms memory t = _terms();
        t.finalRelease = 1;
        bytes32 id = _fundAccepted(t, bytes32("e"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace);
        _deliver(id);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        uint256 openAt = uint256(_deal(id).deadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop;
        vm.warp(openAt);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint64 horizon = _horizon(id);
        vm.warp(openAt + 1 days);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(uint8(_deal(id).state), uint8(AgreementState.Settled));
        assertEq(_horizon(id), horizon);
    }

    /// A proposal names all, nothing or exactly the terms' partial share; a
    /// share below the partial one is refused.
    function test_a_proposal_below_the_partial_share_is_refused() public {
        AgreementTerms memory t = _terms();
        t.partialBps = 5_000;
        bytes32 id = _fundAccepted(t, bytes32("p"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.startPrank(arbiter);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        escrow.proposeRuling(id, 3_000, keccak256("ruling"));
        escrow.proposeRuling(id, 5_000, keccak256("ruling"));
        vm.stopPrank();
    }

    /// A proposal after 2106 announces its whole appeal deadline.
    function test_a_proposal_after_2106_announces_its_whole_appeal_deadline() public {
        vm.warp((uint256(1) << 32) + 1_000);
        bytes32 id = _fundAccepted(_terms(), bytes32("q"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint256 now_ = vm.getBlockTimestamp();
        vm.expectEmit(address(escrow));
        emit DisputeLib.RulingProposed(id, 10_000, keccak256("ruling"), uint64(now_ + 72 hours));
        vm.prank(arbiter);
        escrow.proposeRuling(id, 10_000, keccak256("ruling"));
    }

    /// The seller asks for more time only while the deal runs undisputed.
    function test_an_extension_is_not_requested_during_a_dispute() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("x"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint64 later = _deal(id).deadline + 1 days;
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.requestExtension(id, later);
    }

    /// The fallback waits out a hold like any ruling.
    function test_the_fallback_waits_out_a_hold() public {
        AgreementTerms memory t = _terms();
        t.fallbackBps = 5_000;
        bytes32 id = _fundAccepted(t, bytes32("fb"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.warp(vm.getBlockTimestamp() + RULING_PERIOD);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        vm.expectRevert(AgreementCommon.OnHold.selector);
        escrow.applyFallback(id);
    }

    function _plan(bytes32 salt) internal returns (bytes32 id, AgreementTerms memory t) {
        t = _terms();
        t.parts = 3;
        t.partEvery = 7 days;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        id = _fundAccepted(t, salt);
    }

    /// The last part paid on its due second moves nothing and announces nothing.
    function test_a_last_part_paid_on_its_due_second_moves_no_deadline() public {
        (bytes32 id,) = _plan(bytes32("due"));
        uint256 fundedAt = _deal(id).fundedAt;
        uint64 deadline = _deal(id).deadline;
        vm.warp(fundedAt + 7 days);
        vm.prank(buyer);
        escrow.payPart(id);
        vm.warp(fundedAt + 14 days);
        vm.recordLogs();
        vm.prank(buyer);
        escrow.payPart(id);
        assertEq(_deal(id).deadline, deadline);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != AgreementLib.DeadlineMoved.selector);
        }
    }

    /// A last part paid more than 2^32 seconds late moves the deadline by all
    /// of it.
    function test_a_last_part_paid_ages_late_moves_the_deadline_by_all_of_it() public {
        (bytes32 id,) = _plan(bytes32("age"));
        uint256 fundedAt = _deal(id).fundedAt;
        uint64 deadline = _deal(id).deadline;
        vm.warp(fundedAt + 7 days);
        vm.prank(buyer);
        escrow.payPart(id);
        uint256 late = (uint256(1) << 32) + 5;
        vm.warp(fundedAt + 14 days + late);
        vm.prank(buyer);
        escrow.payPart(id);
        assertEq(_deal(id).deadline, uint256(deadline) + late);
    }

    /// A proposal can give the seller no more than everything.
    function test_a_proposal_above_everything_is_refused() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("all"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.prank(arbiter);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        escrow.proposeRuling(id, 10_001, keccak256("ruling"));
    }

    /// An escalation after 2106 announces its whole ruling deadline.
    function test_an_escalation_after_2106_announces_its_whole_ruling_deadline() public {
        vm.warp((uint256(1) << 32) + 1_000);
        bytes32 id = _fundAccepted(_terms(), bytes32("esc"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint256 now_ = vm.getBlockTimestamp();
        vm.expectEmit(address(escrow));
        emit DisputeLib.DisputeEscalated(id, arbiter, uint64(now_ + RULING_PERIOD));
        vm.prank(arbiter);
        escrow.escalate(id);
    }
}
