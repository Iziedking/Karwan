// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementTermsLib} from "../../../src/suite/agreement/AgreementTermsLib.sol";
import {AgreementCommon} from "../../../src/suite/agreement/AgreementCommon.sol";
import {SettlementLib} from "../../../src/suite/settlement/SettlementLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {IKarwanStakeVault, Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice The Agreement steps at their edges: who may call each, in which
///         state, how plans, extensions, splits and signed releases behave at
///         their bounds, and where the horizon and the seller's stake go.
contract AgreementLibEdgesTest is AgreementFixture {
    uint256 internal constant NOW = 1_800_000_000;

    function setUp() public {
        _deployAgreement();
        usdc.mint(seller, 1_000e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), 50e6);
        vm.stopPrank();
    }

    function _arrival() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 4 days;
    }

    function _plan() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.parts = 3;
        t.partEvery = 7 days;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        t.cancelFeeBps = 1_000;
    }

    function _staked(AgreementTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        t.sellerStake = 10e6;
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

    function _count(Vm.Log[] memory logs, address emitter, bytes32 sig) internal pure returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == sig) ++n;
        }
    }

    // ------------------------------- Callers ------------------------------

    function test_review_start_more_time_and_extensions_belong_to_their_side() public {
        bytes32 id = _fundAccepted(_arrival(), bytes32("c"));
        _deliver(id);
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.startReview(id);
        vm.prank(buyer);
        escrow.startReview(id);
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.requestMoreTime(id);
        uint64 later = _deal(id).deadline + 1 days;
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.requestExtension(id, later);
        vm.prank(seller);
        escrow.requestExtension(id, later);
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.approveExtension(id, later);
    }

    // ------------------------------ Accepting -----------------------------

    function test_a_deal_is_accepted_once_and_only_if_it_exists() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        bytes32 h = escrow.termsHashOf(_terms());
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.accept(id, h);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.accept(bytes32("nothing"), h);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.cancelUnaccepted(bytes32("nothing"));
    }

    /// Accepted in the last second, and only with the exact terms: a hash
    /// below the real one is as wrong as one above.
    function test_a_deal_is_accepted_up_to_its_last_second_with_the_exact_terms_only() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fund(t, bytes32("a"));
        vm.warp(t.acceptBy);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.accept(id, bytes32(uint256(1)));
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
    }

    /// A plan paid in full early is never overdue, however late the seller
    /// accepts within the accept window.
    function test_a_fully_paid_plan_is_never_overdue() public {
        AgreementTerms memory t = _plan();
        t.acceptBy = uint64(block.timestamp + 25 days);
        bytes32 id = _fund(t, bytes32("p"));
        vm.startPrank(buyer);
        escrow.payPart(id);
        escrow.payPart(id);
        vm.stopPrank();
        vm.warp(uint256(_deal(id).fundedAt) + 3 * 7 days + t.reclaimGrace + 1);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
    }

    // -------------------------------- Plans -------------------------------

    /// Only the last part's lateness moves the deadline.
    function test_an_early_part_paid_after_the_last_due_date_moves_nothing() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("p"));
        uint64 deadline = _deal(id).deadline;
        vm.warp(uint256(_deal(id).fundedAt) + 15 days);
        vm.prank(buyer);
        escrow.payPart(id);
        assertEq(_deal(id).deadline, deadline);
    }

    /// The late last part moves the deadline past 2106 too, and the seller's
    /// stake follows the horizon.
    function test_a_late_last_part_moves_the_stake_with_the_horizon_even_after_2106() public {
        vm.warp((uint256(1) << 32) + 1_000);
        bytes32 id = _staked(_plan(), bytes32("p"));
        uint256 fundedAt = _deal(id).fundedAt;
        uint64 deadline = _deal(id).deadline;
        vm.warp(fundedAt + 7 days);
        vm.prank(buyer);
        escrow.payPart(id);
        vm.warp(fundedAt + 14 days + 1 days);
        vm.prank(buyer);
        escrow.payPart(id);
        assertEq(_deal(id).deadline, deadline + 1 days);
        _stakeKept(id);
    }

    function test_a_cancelled_plan_takes_no_more_parts_and_cancels_once() public {
        AgreementTerms memory t = _plan();
        bytes32 id = _fundAccepted(t, bytes32("p"));
        vm.warp(uint256(_deal(id).fundedAt) + 7 days + t.reclaimGrace + 1);
        escrow.cancelMissed(id);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.payPart(id);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.cancelMissed(id);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.payPart(bytes32("nothing"));
    }

    /// An accepted plan that missed a part frees the seller's stake and records
    /// the ending for both sides.
    function test_a_missed_accepted_plan_frees_the_stake_and_records_both_sides() public {
        AgreementTerms memory t = _plan();
        bytes32 id = _staked(t, bytes32("p"));
        vm.warp(uint256(_deal(id).fundedAt) + 7 days + t.reclaimGrace + 1);
        vm.recordLogs();
        escrow.cancelMissed(id);
        assertEq(_count(vm.getRecordedLogs(), address(record), KarwanRecord.OutcomeRecorded.selector), 2);
        assertEq(vault.expiryOf(address(escrow), id), 0);
    }

    /// The cancel fee on a huge plan is worked out whole.
    function test_the_cancel_fee_on_a_huge_plan_is_worked_out_whole() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(escrow), address(usdc), type(uint128).max, type(uint128).max);
        usdc.mint(buyer, uint256(1) << 127);
        AgreementTerms memory t = _plan();
        t.amount = uint128(1) << 125;
        bytes32 id = _fundAccepted(t, bytes32("p"));
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.warp(uint256(_deal(id).fundedAt) + 7 days + t.reclaimGrace + 1);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller) - sellerBefore, (uint256(t.amount) * t.cancelFeeBps) / 10_000);
    }

    // ------------------------------ Stake keep ----------------------------

    /// Keeping the stake works on a running staked deal; a deal with no stake
    /// has nothing to keep. When the vault refused the move earlier, keepStake
    /// brings the reservation up to date.
    function test_keep_stake_catches_the_reservation_up_after_a_refusal() public {
        bytes32 plain = _fundAccepted(_terms(), bytes32("plain"));
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.keepStake(plain);
        bytes32 id = _staked(_terms(), bytes32("k"));
        vm.mockCallRevert(address(vault), abi.encodeWithSelector(IKarwanStakeVault.extend.selector), "");
        _deliver(id);
        vm.clearMockedCalls();
        assertLt(vault.expiryOf(address(escrow), id), _horizon(id) + 180 days + 30 days);
        escrow.keepStake(id);
        _stakeKept(id);
    }

    // ------------------------------ Delivery ------------------------------

    /// A delivery moves the horizon to cover the start longstop, the silence
    /// longstop and the hold budget, and only a delivery that starts the
    /// review announces a review start.
    function test_a_delivery_moves_the_horizon_and_announces_a_review_only_when_it_starts_one() public {
        AgreementTerms memory t = _arrival();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        assertEq(_horizon(id), uint256(t.deliveryDeadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop);
        vm.recordLogs();
        _deliver(id);
        assertEq(_count(vm.getRecordedLogs(), address(escrow), AgreementLib.ReviewStarted.selector), 0);
        assertEq(_horizon(id), uint256(_deal(id).deliveredAt) + t.startLongstop + t.silentLongstop + 30 days);
        bytes32 other = _fundAccepted(_terms(), bytes32("e"));
        vm.recordLogs();
        _deliver(other);
        assertEq(_count(vm.getRecordedLogs(), address(escrow), AgreementLib.ReviewStarted.selector), 1);
    }

    // ------------------------------ Extensions ----------------------------

    function test_an_extension_request_moves_later_and_only_on_an_accepted_deal() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("x"));
        uint64 deadline = _deal(id).deadline;
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.requestExtension(id, deadline - 1 days);
        bytes32 unaccepted = _fund(_terms(), bytes32("y"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.requestExtension(unaccepted, deadline + 1 days);
    }

    /// The buyer approves exactly the requested deadline, once.
    function test_an_extension_is_approved_for_exactly_the_requested_deadline_once() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("x"));
        uint64 deadline = _deal(id).deadline;
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.approveExtension(id, deadline + 2 days);
        vm.prank(seller);
        escrow.requestExtension(id, deadline + 2 days);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.approveExtension(id, deadline + 1 days);
        vm.prank(buyer);
        escrow.approveExtension(id, deadline + 2 days);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.approveExtension(id, deadline + 2 days);
    }

    /// A buyer's extension moves the deadline later, never past the horizon
    /// limit, and moves the horizon and the stake with it, every term of the
    /// horizon counted.
    function test_extending_the_deadline_is_bounded_and_moves_the_horizon_and_the_stake() public {
        vm.warp(NOW);
        AgreementTerms memory t = _arrival();
        t.silentLongstop = 20 days;
        bytes32 id = _staked(t, bytes32("x"));
        uint64 deadline = _deal(id).deadline;
        vm.startPrank(buyer);
        vm.expectRevert(AgreementLib.BadTerms.selector);
        escrow.extendDeadline(id, deadline - 1);
        vm.expectRevert(AgreementLib.BadTerms.selector);
        escrow.extendDeadline(id, uint64(NOW + 365 days + 1));
        escrow.extendDeadline(id, uint64(NOW + 365 days));
        vm.stopPrank();
        assertEq(_horizon(id), NOW + 365 days + t.reclaimGrace + t.startLongstop + t.silentLongstop);
        _stakeKept(id);
    }

    // ------------------------------- Release ------------------------------

    function test_the_release_digest_follows_its_published_encoding() public view {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = escrow.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
        bytes32 inner = keccak256(
            abi.encode(keccak256("Release(bytes32 dealId,uint8 tranche,uint256 deadline)"), bytes32("deal"), uint8(1), uint256(9))
        );
        assertEq(escrow.releaseDigest(bytes32("deal"), 1, 9), keccak256(abi.encodePacked("\x19\x01", domain, inner)));
    }

    /// A signed release works up to its deadline second and only for the
    /// tranche it names.
    function test_a_signed_release_names_its_tranche_and_works_to_its_last_second() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        bytes32 id = _fundAccepted(t, bytes32("r"));
        _deliver(id);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory ahead = _sig(buyerKey, escrow.releaseDigest(id, 1, deadline));
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.releaseBySig(id, 1, deadline, ahead);
        bytes memory sig = _sig(buyerKey, escrow.releaseDigest(id, 0, deadline));
        vm.warp(deadline);
        vm.prank(stranger);
        escrow.releaseBySig(id, 0, deadline, sig);
        assertEq(_deal(id).paid, 1);
    }

    /// A release during a dispute ends it, and the deadline moves by exactly
    /// the time the dispute held it; the seller's stake follows the horizon.
    function test_a_release_during_a_dispute_moves_the_deadline_by_the_dispute_and_keeps_the_stake() public {
        AgreementTerms memory t = _arrival();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        t.silentLongstop = 20 days;
        bytes32 id = _staked(t, bytes32("r"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint64 deadline = _deal(id).deadline;
        vm.warp(t0 + 40 days);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(_deal(id).deadline, deadline + 40 days);
        _stakeKept(id);
    }

    /// A signed release during a dispute ends it the same way, and the
    /// seller's stake follows the moved horizon.
    function test_a_signed_release_during_a_dispute_keeps_the_stake() public {
        AgreementTerms memory t = _arrival();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        t.silentLongstop = 20 days;
        bytes32 id = _staked(t, bytes32("rs"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        uint64 deadline = _deal(id).deadline;
        vm.warp(t0 + 40 days);
        uint256 by = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sig(buyerKey, escrow.releaseDigest(id, 0, by));
        vm.prank(stranger);
        escrow.releaseBySig(id, 0, by, sig);
        assertEq(_deal(id).deadline, deadline + 40 days);
        _stakeKept(id);
    }

    /// A part paid on a staked plan before any staked deal was accepted on
    /// the escrow, so before it knows the vault, goes through.
    function test_a_part_paid_before_a_staked_plan_is_accepted_goes_through() public {
        AgreementTerms memory t = _plan();
        t.sellerStake = 10e6;
        bytes32 id = _fund(t, bytes32("sp"));
        uint8 before = _deal(id).partsPaid;
        vm.prank(buyer);
        escrow.payPart(id);
        assertEq(_deal(id).partsPaid, before + 1);
    }

    /// Approving an extension nobody asked for is refused as a mismatch, even
    /// for a deadline of zero.
    function test_an_extension_nobody_asked_for_is_not_approved() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("na"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.approveExtension(id, 0);
    }

    function test_a_plan_is_not_released_before_its_last_part() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("p"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.release(id);
    }

    // ------------------------------- Reclaim ------------------------------

    /// A reclaimed deposit is recorded as returned, a missed delivery as
    /// failed.
    function test_a_reclaim_records_a_returned_deposit_or_a_failure() public {
        AgreementTerms memory t = _terms();
        t.silenceOutcome = 1;
        bytes32 id = _fundAccepted(t, bytes32("dep"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(escrow), id, buyerId, 0, Outcome.DEPOSIT_RETURNED, 1, 0);
        escrow.reclaim(id);
        AgreementTerms memory u = _terms();
        u.acceptBy = uint64(block.timestamp + 1 days);
        u.deliveryDeadline = uint64(block.timestamp + 10 days);
        bytes32 other = _fundAccepted(u, bytes32("miss"));
        vm.warp(uint256(u.deliveryDeadline) + u.reclaimGrace + 1);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(escrow), other, buyerId, 0, Outcome.FAILED, 1, 0);
        escrow.reclaim(other);
    }

    // -------------------------------- Splits ------------------------------

    function test_a_split_runs_only_on_a_running_deal() public {
        bytes32 unaccepted = _fund(_terms(), bytes32("u"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.proposeSplit(unaccepted, 5_000);
        bytes32 plan = _fundAccepted(_plan(), bytes32("p"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.proposeSplit(plan, 5_000);
        bytes32 id = _fundAccepted(_terms(), bytes32("s"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 5_000);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.acceptSplit(id, 5_000);
    }

    /// A split is accepted only at the share offered, settles everything, and
    /// leaves no offer behind.
    function test_a_split_is_accepted_at_the_share_offered_and_settles_everything() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("s"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 6_000);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.acceptSplit(id, 5_000);
        vm.prank(seller);
        escrow.acceptSplit(id, 6_000);
        assertFalse(escrow.splitOf(id).active);
        assertEq(_deal(id).released, _deal(id).sellerNet);
        assertEq(_deal(id).feeReleased, _deal(id).feeTotal);
        assertEq(_deal(id).paid, _deal(id).count);
    }

    // ------------------------------- Opening ------------------------------

    /// With no high value set for the asset, a dispute goes to the review
    /// Safe, never the senior one.
    function test_with_no_high_value_set_a_dispute_goes_to_the_review_safe() public {
        hub.setAsset(address(usdc), true, 0);
        bytes32 id = _fundAccepted(_terms(), bytes32("hv0"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        escrow.rule(id, 10_000, keccak256("ruling"));
        assertEq(uint8(_deal(id).state), uint8(AgreementState.Ruled));
    }

    /// The seller accepts only the exact terms: any other hash is refused,
    /// whichever side of the real one it falls.
    function test_accepting_with_any_other_terms_hash_is_refused() public {
        bytes32 id = _fund(_terms(), bytes32("big"));
        vm.startPrank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.accept(id, bytes32(type(uint256).max));
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.accept(id, bytes32(0));
        vm.stopPrank();
    }

    /// A delivery deadline whose horizon would pass 64 bits is capped there,
    /// and the cap is refused as a horizon, not wrapped round to a near one.
    function test_a_horizon_past_64_bits_is_refused_not_wrapped() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = type(uint64).max - 1 days;
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.BadHorizon.selector);
        escrow.fund(bytes32("wrap"), t);
    }

    /// A verifier belongs only to a deal whose review starts on its check,
    /// even a verifier the hub lists.
    function test_a_verifier_on_a_deal_without_a_check_is_refused() public {
        address checker = makeAddr("listed checker");
        hub.setVerifier(checker, true);
        AgreementTerms memory t = _terms();
        t.verifier = checker;
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("v"), t);
    }

    /// A deal at the high value needs both the buyer's final release and the
    /// check: either one alone is refused.
    function test_a_high_value_deal_needs_both_the_final_release_and_the_check() public {
        address checker = makeAddr("listed checker");
        hub.setVerifier(checker, true);
        AgreementTerms memory t = _terms();
        t.amount = 5_000e6;
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.verifier = checker;
        t.checkPolicy = keccak256("policy");
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("hv1"), t);
        t = _terms();
        t.amount = 5_000e6;
        t.finalRelease = 1;
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("hv2"), t);
    }

    /// A plan whose every part is paid has no missed part to cancel on.
    function test_a_fully_paid_plan_is_not_cancelled_as_missed() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("paid"));
        uint256 fundedAt = _deal(id).fundedAt;
        vm.startPrank(buyer);
        vm.warp(fundedAt + 7 days);
        escrow.payPart(id);
        vm.warp(fundedAt + 14 days);
        escrow.payPart(id);
        vm.stopPrank();
        vm.warp(fundedAt + 30 days);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.cancelMissed(id);
    }

    /// A deal reviewed on its check names the policy it is checked against.
    function test_a_checked_deal_without_a_policy_is_refused() public {
        address checker = makeAddr("listed checker");
        hub.setVerifier(checker, true);
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.verifier = checker;
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("np"), t);
    }

    /// A deal of exactly the high value is a high-value deal: its dispute goes
    /// to the senior Safe.
    function test_a_deal_of_exactly_the_high_value_goes_to_the_senior_safe() public {
        address checker = makeAddr("listed checker");
        hub.setVerifier(checker, true);
        hub.setCaps(address(escrow), address(usdc), type(uint128).max, type(uint128).max);
        usdc.mint(buyer, 10_000e6);
        AgreementTerms memory t = _terms();
        t.amount = 5_000e6;
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.finalRelease = 1;
        t.verifier = checker;
        t.checkPolicy = keccak256("policy");
        bytes32 id = _fundAccepted(t, bytes32("hv"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.prank(seniorSafe);
        escrow.rule(id, 10_000, keccak256("ruling"));
        assertEq(uint8(_deal(id).state), uint8(AgreementState.Ruled));
    }
}
