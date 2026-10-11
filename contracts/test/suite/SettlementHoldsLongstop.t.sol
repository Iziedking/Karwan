// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {KarwanRecord} from "../../src/suite/KarwanRecord.sol";
import {IKarwanRecord, Outcome} from "../../src/suite/interfaces/IKarwanSuite.sol";

contract SettlementHoldsLongstopTest is SuiteFixture {
    address internal buyer;
    uint64 internal buyerId;
    address internal seller;
    uint64 internal sellerId;
    bytes32 internal constant DEAL = bytes32("deal-h");
    uint64 internal horizon;

    function setUp() public {
        _deploySuite();
        (buyer,, buyerId) = _person("buyer");
        (seller,, sellerId) = _person("seller");
        _funded(buyer, 10_000e6);
        horizon = uint64(block.timestamp + 30 days);
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), _one(seller), horizon);
        family.fund(DEAL, 100e6);
        vm.stopPrank();
        vm.prank(seller);
        family.accept(DEAL);
    }

    function test_only_the_guardian_holds() public {
        vm.expectRevert(KarwanSettlementBase.NotGuardian.selector);
        family.hold(DEAL, bytes32("scan"));
    }

    function test_hold_delays_claims_never_refunds() public {
        vm.prank(guardian);
        family.hold(DEAL, bytes32("scan"));
        vm.expectRevert(KarwanSettlementBase.OnHold.selector);
        family.claim(DEAL, seller, 10e6);
        family.pay(DEAL, buyer, 10e6);
        vm.warp(block.timestamp + 7 days);
        family.claim(DEAL, seller, 10e6);
    }

    function test_hold_budget_is_thirty_days_charged_in_full() public {
        for (uint256 i; i < 4; ++i) {
            vm.prank(guardian);
            family.hold(DEAL, bytes32("x"));
            vm.prank(guardian);
            family.releaseHold(DEAL);
        }
        vm.prank(guardian);
        family.hold(DEAL, bytes32("x"));
        assertEq(family.accountOf(DEAL).holdUntil, uint64(block.timestamp + 2 days));
        vm.warp(block.timestamp + 2 days);
        vm.prank(guardian);
        vm.expectRevert(KarwanSettlementBase.HoldBudget.selector);
        family.hold(DEAL, bytes32("x"));
    }

    function test_holds_do_not_stack() public {
        vm.prank(guardian);
        family.hold(DEAL, bytes32("x"));
        vm.prank(guardian);
        vm.expectRevert(KarwanSettlementBase.OnHold.selector);
        family.hold(DEAL, bytes32("x"));
    }

    function test_longstop_only_by_the_senior_safe_after_180_days() public {
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 60e6;
        vm.prank(reviewSafe);
        vm.expectRevert(KarwanSettlementBase.NotSenior.selector);
        family.longstopSplit(DEAL, 40e6, toPayees);
        vm.warp(uint256(horizon) + 180 days - 1);
        vm.prank(seniorSafe);
        vm.expectRevert(KarwanSettlementBase.Early.selector);
        family.longstopSplit(DEAL, 40e6, toPayees);
    }

    function test_longstop_uses_the_senior_safe_from_opening() public {
        hub.setReviewers(reviewSafe, makeAddr("newSenior"));
        vm.warp(uint256(horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 100e6;
        vm.prank(makeAddr("newSenior"));
        vm.expectRevert(KarwanSettlementBase.NotSenior.selector);
        family.longstopSplit(DEAL, 0, toPayees);
        vm.prank(seniorSafe);
        family.longstopSplit(DEAL, 0, toPayees);
    }

    function test_longstop_splits_everything_between_the_parties_only() public {
        vm.warp(uint256(horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 60e6;
        vm.prank(seniorSafe);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.longstopSplit(DEAL, 39e6, toPayees);
        vm.prank(seniorSafe);
        family.longstopSplit(DEAL, 40e6, toPayees);
        assertEq(usdc.balanceOf(seller), 60e6);
        assertEq(usdc.balanceOf(buyer), 10_000e6 - 100e6 + 40e6);
        assertTrue(family.longstopped(DEAL));
        assertTrue(family.accountOf(DEAL).closed);
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(family), DEAL, sellerId, 1)));
    }

    function test_longstop_refused_on_an_empty_deal() public {
        family.pay(DEAL, buyer, 100e6);
        vm.warp(uint256(horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        vm.prank(seniorSafe);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.longstopSplit(DEAL, 0, toPayees);
    }

    function test_longstop_pays_the_financier_first_and_credits_a_blocked_party() public {
        address financier = makeAddr("financier");
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 30e6, 0, 0, "");
        usdc.setBlocked(buyer, true);
        vm.warp(uint256(horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 60e6;
        vm.prank(seniorSafe);
        family.longstopSplit(DEAL, 40e6, toPayees);
        assertEq(usdc.balanceOf(financier), 30e6);
        assertEq(usdc.balanceOf(seller), 30e6);
        assertEq(family.owed(address(usdc), buyer), 40e6);
        assertTrue(family.accountOf(DEAL).closed);
    }

    function test_retry_drops_an_outcome_already_recorded() public {
        vm.mockCallRevert(address(record), abi.encodeWithSelector(IKarwanRecord.recordOutcome.selector), "down");
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        vm.clearMockedCalls();
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        family.retryRecord(DEAL, 1);
        assertEq(family.pendingRecord(keccak256(abi.encode(DEAL, uint8(1)))), 0);
    }

    function test_a_family_cannot_record_an_unknown_outcome() public {
        vm.expectRevert(KarwanSettlementBase.BadOutcome.selector);
        family.recordOutcome(DEAL, 1, 0, 0);
        vm.expectRevert(KarwanSettlementBase.BadOutcome.selector);
        family.recordOutcome(DEAL, 1, Outcome.MAX + 1, 0);
    }

    function test_horizon_extension_delays_the_longstop() public {
        family.extendHorizon(DEAL, horizon + 60 days);
        vm.warp(uint256(horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 100e6;
        vm.prank(seniorSafe);
        vm.expectRevert(KarwanSettlementBase.Early.selector);
        family.longstopSplit(DEAL, 0, toPayees);
    }

    function test_outcome_goes_to_the_identity_from_opening() public {
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(family), DEAL, sellerId, 1)));
    }

    function test_payee_who_never_accepted_gets_no_record() public {
        bytes32 deal2 = bytes32("deal-unaccepted");
        vm.prank(buyer);
        family.open(deal2, address(usdc), _one(seller), horizon);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.OutcomeUnrecorded(deal2, 1);
        family.recordOutcome(deal2, 1, Outcome.FAILED, 0);
        assertFalse(record.outcomeRecorded(record.outcomeKey(address(family), deal2, sellerId, 1)));
        family.recordOutcome(deal2, 0, Outcome.CANCELLED, 0);
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(family), deal2, buyerId, 0)));
    }

    function test_revoked_family_still_pays_out_and_its_records_wait() public {
        hub.revokeFamily(address(family));
        family.pay(DEAL, seller, 100e6);
        assertEq(usdc.balanceOf(seller), 100e6);
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        assertEq(family.pendingRecord(keccak256(abi.encode(DEAL, uint8(1)))), uint24(Outcome.COMPLETED) << 16);
    }

    function test_unbound_party_gets_no_record() public {
        address anon = makeAddr("anon");
        bytes32 deal2 = bytes32("deal-anon");
        vm.startPrank(buyer);
        family.open(deal2, address(usdc), _one(anon), horizon);
        vm.stopPrank();
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.OutcomeUnrecorded(deal2, 1);
        family.recordOutcome(deal2, 1, Outcome.COMPLETED, 0);
    }

    function test_failed_record_write_is_pending_and_retried() public {
        vm.mockCallRevert(address(record), abi.encodeWithSelector(IKarwanRecord.recordOutcome.selector), "down");
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        bytes32 key = keccak256(abi.encode(DEAL, uint8(1)));
        assertEq(family.pendingRecord(key), (uint24(Outcome.COMPLETED) << 16));
        vm.expectRevert();
        family.retryRecord(DEAL, 1);
        assertEq(family.pendingRecord(key), (uint24(Outcome.COMPLETED) << 16));
        vm.clearMockedCalls();
        family.retryRecord(DEAL, 1);
        assertEq(family.pendingRecord(key), 0);
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(family), DEAL, sellerId, 1)));
        vm.expectRevert(KarwanSettlementBase.NoPending.selector);
        family.retryRecord(DEAL, 1);
    }

    function test_value_bands() public {
        bytes32[4] memory ids = [bytes32("b0"), bytes32("b1"), bytes32("b2"), bytes32("b3")];
        uint256[4] memory amounts = [uint256(99e6), 100e6, 1_000e6, 10_000e6];
        hub.setCaps(address(family), address(usdc), 10_000e6, 100_000e6);
        _funded(buyer, 20_000e6);
        for (uint256 i; i < 4; ++i) {
            vm.startPrank(buyer);
            family.open(ids[i], address(usdc), _one(seller), horizon);
            family.fund(ids[i], amounts[i]);
            vm.stopPrank();
            vm.prank(seller);
            family.accept(ids[i]);
            vm.expectEmit(address(record));
            emit KarwanRecord.OutcomeRecorded(address(family), ids[i], sellerId, 1, Outcome.COMPLETED, uint8(i), 0);
            family.recordOutcome(ids[i], 1, Outcome.COMPLETED, 0);
        }
    }
}
