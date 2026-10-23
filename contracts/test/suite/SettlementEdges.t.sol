// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {SettlementLib} from "../../src/suite/settlement/SettlementLib.sol";
import {KarwanRecord} from "../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../src/suite/interfaces/IKarwanSuite.sol";
import {BonusToken} from "./mocks/BlocklistToken.sol";

/// @notice The settlement base at its edges: amounts far beyond today's caps,
///         the yield eligibility line, the payout and assignment events, what a
///         payout or fee of nothing does, the consent bit of a second payee, a
///         record that fails and is retried, and the yield books at tiny amounts.
contract SettlementEdgesTest is SuiteFixture {
    address internal buyer;
    uint256 internal buyerKey;
    uint64 internal buyerId;
    address internal seller;
    uint256 internal sellerKey;
    uint64 internal sellerId;
    address internal financier = makeAddr("financier");
    address internal stranger = makeAddr("stranger");
    bytes32 internal constant DEAL = bytes32("edge");

    function setUp() public {
        _deploySuite();
        (buyer, buyerKey, buyerId) = _person("buyer");
        (seller, sellerKey, sellerId) = _person("seller");
        _funded(buyer, 100_000e6);
    }

    function _open(uint256 amount) internal {
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        if (amount != 0) family.fund(DEAL, amount);
        vm.stopPrank();
    }

    function _count(Vm.Log[] memory logs, bytes32 sig) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(family) && logs[i].topics[0] == sig) ++n;
        }
    }

    // ------------------------------ Encodings -----------------------------

    function test_the_assign_digest_follows_its_published_encoding() public view {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = family.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
        bytes32 typeHash = keccak256(
            "Assign(bytes32 dealId,address payee,address assignee,uint128 amount,address submitter,uint256 nonce,uint256 deadline)"
        );
        bytes32 inner = keccak256(abi.encode(typeHash, DEAL, seller, financier, uint128(5), stranger, uint256(6), uint256(7)));
        assertEq(
            family.assignDigest(DEAL, seller, financier, 5, stranger, 6, 7),
            keccak256(abi.encodePacked("\x19\x01", domain, inner))
        );
    }

    // -------------------------------- Opening -----------------------------

    function test_a_deal_is_eligible_for_yield_from_exactly_three_days() public {
        _deployYield(address(family), 9_000);
        vm.startPrank(buyer);
        family.open(bytes32("long"), address(usdc), _one(seller), uint64(block.timestamp + 3 days));
        family.open(bytes32("short"), address(usdc), _one(seller), uint64(block.timestamp + 3 days - 1));
        vm.stopPrank();
        assertEq(family.accountOf(bytes32("long")).yieldBps, 9_000);
        assertEq(family.accountOf(bytes32("short")).yieldBps, 0);
    }

    function test_a_horizon_already_past_is_refused() public {
        vm.warp(1_800_000_000);
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.BadHorizon.selector);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp - 1));
    }

    /// A payee whose identity is older than the payer's is still a payee.
    function test_a_payee_with_an_older_identity_than_the_payer_is_accepted() public {
        (address late,,) = _person("late");
        _funded(late, 1_000e6);
        vm.prank(late);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        assertTrue(family.isParty(DEAL, seller));
    }

    function test_accepting_twice_sets_the_consent_bit_once() public {
        _open(0);
        vm.startPrank(seller);
        family.accept(DEAL);
        family.accept(DEAL);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).consentMask, 1);
    }

    // -------------------------------- Funding -----------------------------

    function test_a_token_that_delivers_more_than_asked_is_never_funded() public {
        BonusToken bonus = new BonusToken();
        hub.setAsset(address(bonus), true, 0);
        hub.setCaps(address(family), address(bonus), 1_000e6, 10_000e6);
        bonus.mint(buyer, 100e6);
        vm.startPrank(buyer);
        bonus.approve(address(family), type(uint256).max);
        family.open(DEAL, address(bonus), _one(seller), uint64(block.timestamp + 30 days));
        vm.expectRevert(SettlementLib.BadDelivery.selector);
        family.fund(DEAL, 100e6);
        vm.stopPrank();
    }

    function test_a_pledge_cannot_pass_the_total_cap() public {
        hub.setCaps(address(family), address(usdc), 1_000e6, 1_500e6);
        _open(1_000e6);
        vm.startPrank(buyer);
        family.open(bytes32("second"), address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        vm.expectRevert(SettlementLib.OverCap.selector);
        family.pledge(bytes32("second"), 600e6);
        vm.stopPrank();
    }

    function test_the_parkable_share_adds_up_across_deals() public {
        _deployYield(address(family), 9_000);
        _open(500e6);
        vm.startPrank(buyer);
        family.open(bytes32("second"), address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        family.fund(bytes32("second"), 800e6);
        vm.stopPrank();
        assertEq(family.parkable(address(usdc)), 450e6 + 720e6);
    }

    /// Amounts far beyond any cap the hub sets today are pledged, funded, paid,
    /// assigned and charged whole.
    function test_amounts_far_beyond_todays_caps_are_booked_whole() public {
        hub.setCaps(address(family), address(usdc), type(uint128).max, type(uint128).max);
        uint256 big = uint256(1) << 122;
        usdc.mint(buyer, big * 2);
        _open(0);
        vm.startPrank(buyer);
        family.pledge(DEAL, big + 5);
        family.fund(DEAL, big);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).promised, 5);
        assertEq(family.accountOf(DEAL).funded, big);
        assertEq(family.accountOf(DEAL).balance, big);
        uint256 fee = (big * FEE_BPS) / 10_000;
        assertEq(family.feeLeft(DEAL), fee);
        family.payFee(DEAL, fee);
        assertEq(family.accountOf(DEAL).feePaid, fee);
        uint128 assigned = uint128(1) << 70;
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, assigned, 0, 0, "");
        uint256 rest = big - fee;
        family.pay(DEAL, seller, rest);
        (, , uint128 paid) = family.assignmentOf(DEAL, seller);
        assertEq(paid, assigned);
        assertEq(usdc.balanceOf(financier), assigned);
        assertEq(usdc.balanceOf(seller), rest - assigned);
        assertEq(family.accountOf(DEAL).balance, 0);
    }

    // -------------------------------- Payouts -----------------------------

    function test_paying_nothing_to_anyone_and_charging_no_fee_do_nothing() public {
        _open(100e6);
        vm.recordLogs();
        family.pay(DEAL, stranger, 0);
        family.payFee(DEAL, 0);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(family.accountOf(DEAL).balance, 100e6);
    }

    function test_a_plain_payout_names_only_the_party_and_credits_no_one() public {
        _open(100e6);
        vm.recordLogs();
        family.pay(DEAL, seller, 10e6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, SettlementLib.Paid.selector), 1);
        assertEq(_count(logs, SettlementLib.PayoutCredited.selector), 0);
    }

    /// Part of a payout goes to the assignee, the rest to the payee, each
    /// named with its own amount; once the assignment is repaid, payouts name
    /// the payee alone.
    function test_an_assignment_takes_its_share_then_steps_aside() public {
        _open(100e6);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 30e6, 0, 0, "");
        vm.expectEmit(address(family));
        emit SettlementLib.Paid(DEAL, financier, 30e6, true);
        vm.expectEmit(address(family));
        emit SettlementLib.Paid(DEAL, seller, 20e6, false);
        family.pay(DEAL, seller, 50e6);
        vm.recordLogs();
        family.pay(DEAL, seller, 10e6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, SettlementLib.Paid.selector), 1);
        assertEq(logs[0].topics[2], bytes32(uint256(uint160(seller))));
    }

    /// A payout the assignment takes whole leaves nothing for a blocked payee,
    /// so nothing is credited to them.
    function test_a_payout_taken_whole_by_the_assignee_credits_nothing_to_a_blocked_payee() public {
        _open(100e6);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 50e6, 0, 0, "");
        usdc.setBlocked(seller, true);
        vm.recordLogs();
        family.pay(DEAL, seller, 50e6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, SettlementLib.PayoutCredited.selector), 0);
        assertEq(_count(logs, SettlementLib.Paid.selector), 1);
        assertEq(usdc.balanceOf(financier), 50e6);
    }

    function test_an_assignment_to_no_one_the_payee_the_family_or_of_nothing_is_refused() public {
        _open(100e6);
        vm.startPrank(seller);
        vm.expectRevert(SettlementLib.BadParties.selector);
        family.assignPayout(DEAL, seller, address(0), 10e6, 0, 0, "");
        vm.expectRevert(SettlementLib.BadParties.selector);
        family.assignPayout(DEAL, seller, seller, 10e6, 0, 0, "");
        vm.expectRevert(SettlementLib.BadParties.selector);
        family.assignPayout(DEAL, seller, address(family), 10e6, 0, 0, "");
        vm.expectRevert(SettlementLib.BadParties.selector);
        family.assignPayout(DEAL, seller, financier, 0, 0, 0, "");
        vm.stopPrank();
    }

    function test_a_signed_assignment_is_accepted_up_to_its_deadline_second() public {
        _open(100e6);
        uint256 deadline = block.timestamp;
        bytes32 d = family.assignDigest(DEAL, seller, financier, 10e6, financier, 1, deadline);
        bytes memory s = _sig(sellerKey, d);
        vm.prank(financier);
        family.assignPayout(DEAL, seller, financier, 10e6, 1, deadline, s);
        (address assignee,,) = family.assignmentOf(DEAL, seller);
        assertEq(assignee, financier);
    }

    // --------------------------------- Yield ------------------------------

    /// A payout the pool could not cover leaves more parked than the deals
    /// need; once the pool pays again, rebalancing brings it down to exactly
    /// the target.
    function test_rebalance_brings_parked_money_down_to_exactly_the_target_once_the_pool_pays() public {
        _deployYield(address(family), 9_000);
        hub.setCaps(address(family), address(usdc), 100_000e6, 1_000_000e6);
        _open(50_000e6);
        family.rebalanceYield(address(usdc));
        pool.rebalance();
        teller.setPaused(true);
        family.pay(DEAL, seller, 20_000e6);
        assertEq(family.owed(address(usdc), seller), 20_000e6);
        assertGt(family.parked(address(usdc)), family.parkable(address(usdc)));
        teller.setPaused(false);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), family.parkable(address(usdc)));
    }

    /// A payout or a fee from a deal that takes no yield leaves what is parked
    /// alone, even while more is parked than the deals need.
    function test_a_payout_from_a_deal_without_yield_leaves_the_parked_money_alone() public {
        _deployYield(address(family), 9_000);
        hub.setCaps(address(family), address(usdc), 100_000e6, 1_000_000e6);
        _open(50_000e6);
        bytes32 short = bytes32("short");
        vm.startPrank(buyer);
        family.open(short, address(usdc), _one(seller), uint64(block.timestamp + 2 days));
        family.fund(short, 30_000e6);
        vm.stopPrank();
        assertEq(family.accountOf(short).yieldBps, 0);
        family.rebalanceYield(address(usdc));
        pool.rebalance();
        teller.setPaused(true);
        family.pay(DEAL, seller, 20_000e6);
        uint256 parked = family.parked(address(usdc));
        assertGt(parked, family.parkable(address(usdc)));
        teller.setPaused(false);
        family.pay(short, seller, 1_000e6);
        assertEq(family.parked(address(usdc)), parked);
        family.payFee(short, 10e6);
        assertEq(family.parked(address(usdc)), parked);
    }

    /// Funded a unit at a time, nothing is parkable; paying it all out leaves
    /// the books at zero rather than below.
    function test_tiny_fundings_paid_out_at_once_leave_the_parkable_share_at_zero() public {
        _deployYield(address(family), 9_000);
        _open(0);
        vm.startPrank(buyer);
        for (uint256 i; i < 10; ++i) {
            family.fund(DEAL, 1);
        }
        vm.stopPrank();
        assertEq(family.parkable(address(usdc)), 0);
        family.pay(DEAL, seller, 10);
        assertEq(family.parkable(address(usdc)), 0);
    }

    /// At tiny amounts the parkable share can round above what deals hold;
    /// the last payout still brings every parked unit back.
    function test_the_last_tiny_payout_brings_every_parked_unit_back() public {
        _deployYield(address(family), 9_000);
        _open(10);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 9);
        family.pay(DEAL, seller, 9);
        family.pay(DEAL, seller, 1);
        assertEq(family.held(address(usdc)), 0);
        assertEq(family.parked(address(usdc)), 0);
    }

    /// What is still promised after a funding is kept whole beyond 64 bits.
    function test_a_promise_left_beyond_64_bits_is_kept_whole() public {
        hub.setCaps(address(family), address(usdc), type(uint128).max, type(uint128).max);
        uint256 big = uint256(1) << 100;
        usdc.mint(buyer, 1e6);
        _open(0);
        vm.startPrank(buyer);
        family.pledge(DEAL, big);
        family.fund(DEAL, 1e6);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).promised, big - 1e6);
    }

    /// When rounding leaves the parkable share above what deals hold, a
    /// payout still brings parked money down to what they hold, even when the
    /// family has cash enough not to need it.
    function test_rounding_above_what_deals_hold_still_trims_parked_money_to_it() public {
        _deployYield(address(family), 9_000);
        _open(10);
        family.rebalanceYield(address(usdc));
        usdc.mint(address(family), 100);
        family.pay(DEAL, seller, 9);
        assertEq(family.parked(address(usdc)), 1);
        family.pay(DEAL, seller, 1);
        assertGt(family.parkable(address(usdc)), family.held(address(usdc)));
        assertEq(family.parked(address(usdc)), 0);
    }

    // --------------------------- Holds and long-stop ----------------------

    function test_a_hold_after_2106_lasts_seven_days() public {
        _open(100e6);
        vm.warp((uint256(1) << 32) + 50);
        vm.prank(guardian);
        family.hold(DEAL, bytes32("scan"));
        assertEq(family.accountOf(DEAL).holdUntil, vm.getBlockTimestamp() + 7 days);
    }

    function test_a_horizon_never_moves_earlier_and_staying_put_is_not_announced() public {
        _open(100e6);
        uint64 horizon = family.accountOf(DEAL).horizon;
        vm.recordLogs();
        family.extendHorizon(DEAL, horizon - 1 days);
        family.extendHorizon(DEAL, horizon);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(family.accountOf(DEAL).horizon, horizon);
    }

    // -------------------------------- Record ------------------------------

    /// Only the second of two payees accepted: the record follows each
    /// payee's own consent bit.
    function test_the_record_follows_each_payees_own_consent() public {
        (address other,,) = _person("other");
        address[] memory two = new address[](2);
        two[0] = seller;
        two[1] = other;
        vm.prank(buyer);
        family.open(DEAL, address(usdc), two, uint64(block.timestamp + 30 days));
        vm.prank(other);
        family.accept(DEAL);
        vm.expectEmit(address(family));
        emit SettlementLib.OutcomeUnrecorded(DEAL, 1);
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        vm.recordLogs();
        family.recordOutcome(DEAL, 2, Outcome.COMPLETED, 0);
        assertEq(_count(vm.getRecordedLogs(), SettlementLib.OutcomeUnrecorded.selector), 0);
    }

    function test_a_payee_with_no_identity_is_left_unrecorded_not_pending() public {
        address nobody = makeAddr("nobody");
        vm.prank(buyer);
        family.open(DEAL, address(usdc), _one(nobody), uint64(block.timestamp + 30 days));
        vm.prank(nobody);
        family.accept(DEAL);
        vm.expectEmit(address(family));
        emit SettlementLib.OutcomeUnrecorded(DEAL, 1);
        family.recordOutcome(DEAL, 1, Outcome.COMPLETED, 0);
        assertEq(family.pendingRecord(keccak256(abi.encode(DEAL, uint8(1)))), 0);
    }

    /// A record that fails waits with its outcome and detail packed, and the
    /// retry writes exactly them.
    function test_a_failed_record_waits_packed_and_is_retried_exactly() public {
        _open(100e6);
        vm.prank(seller);
        family.accept(DEAL);
        vm.mockCallRevert(address(record), abi.encodeWithSelector(KarwanRecord.recordOutcome.selector), "");
        family.recordOutcome(DEAL, 1, Outcome.FAILED, 7_000);
        assertEq(
            family.pendingRecord(keccak256(abi.encode(DEAL, uint8(1)))), (uint24(Outcome.FAILED) << 16) | 7_000
        );
        vm.clearMockedCalls();
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(family), DEAL, sellerId, 1, Outcome.FAILED, 1, 7_000);
        family.retryRecord(DEAL, 1);
    }

    /// A deal names at most eight payees.
    function test_a_deal_with_more_payees_than_the_limit_is_refused() public {
        address[] memory many = new address[](9);
        for (uint256 i; i < 9; ++i) {
            (many[i],,) = _person(string(abi.encodePacked("payee", vm.toString(i))));
        }
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.BadParties.selector);
        family.open(DEAL, address(usdc), many, uint64(block.timestamp + 30 days));
    }

    /// The zero address is never a party to a deal.
    function test_the_zero_address_is_never_a_party() public {
        _open(10e6);
        assertFalse(family.isParty(DEAL, address(0)));
        assertTrue(family.isParty(DEAL, seller));
    }
}
