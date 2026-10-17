// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {IKarwanRecord, Outcome} from "../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice Every step of a deal's account is announced with every field, so
///         an indexer can follow the money from the logs alone. Callers are
///         relayed, so msg.sender is not tx.origin.
contract SettlementEventsTest is SuiteFixture {
    address internal buyer;
    uint64 internal buyerId;
    address internal seller;
    address internal financier = makeAddr("financier");
    address internal relayer = makeAddr("relayer");
    bytes32 internal constant DEAL = bytes32("deal-1");

    function setUp() public {
        _deploySuite();
        (buyer,, buyerId) = _person("buyer");
        (seller,,) = _person("seller");
        _funded(buyer, 10_000e6);
    }

    function _open() internal {
        vm.prank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(vm.getBlockTimestamp() + 30 days));
    }

    function _openAndFund(uint256 amount) internal {
        _open();
        vm.prank(buyer);
        family.fund(DEAL, amount);
    }

    function test_opening_a_payee_and_consent_are_announced() public {
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.AccountOpened(DEAL, address(usdc), buyer, 1, FEE_BPS, feeSafe);
        vm.prank(buyer, relayer);
        family.open(DEAL, address(usdc), _one(seller), uint64(vm.getBlockTimestamp() + 30 days));
        address second = makeAddr("second");
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.PayeeAdded(DEAL, second);
        family.addPayee(DEAL, second);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.Accepted(DEAL, seller);
        vm.prank(seller, relayer);
        family.accept(DEAL);
        uint64 later = uint64(vm.getBlockTimestamp() + 60 days);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.HorizonSet(DEAL, later);
        family.extendHorizon(DEAL, later);
    }

    function test_money_in_and_a_pledge_are_announced() public {
        _open();
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.Funded(DEAL, buyer, 100e6);
        vm.prank(buyer, relayer);
        family.fund(DEAL, 100e6);
        bytes32 other = bytes32("deal-2");
        vm.prank(buyer);
        family.open(other, address(usdc), _one(seller), uint64(vm.getBlockTimestamp() + 30 days));
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.Promised(other, 50e6);
        vm.prank(buyer, relayer);
        family.pledge(other, 50e6);
    }

    function test_payouts_name_the_assignee_the_payee_and_the_fee_recipient() public {
        _openAndFund(100e6);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.PayoutAssigned(DEAL, seller, financier, 70e6);
        vm.prank(seller, relayer);
        family.assignPayout(DEAL, seller, financier, 70e6, 0, 0, "");
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.Paid(DEAL, financier, 70e6, true);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.Paid(DEAL, seller, 29e6, false);
        family.pay(DEAL, seller, 99e6);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.FeePaid(DEAL, feeSafe, 1e6);
        family.payFee(DEAL, 1e6);
    }

    function test_releasing_an_assignment_names_the_assignee() public {
        _openAndFund(100e6);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 70e6, 0, 0, "");
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.AssignmentReleased(DEAL, seller, financier);
        vm.prank(financier, relayer);
        family.releaseAssignment(DEAL, seller);
    }

    function test_withdrawing_an_owed_payout_is_announced() public {
        _openAndFund(100e6);
        usdc.setBlocked(seller, true);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.PayoutCredited(address(usdc), seller, 40e6);
        family.pay(DEAL, seller, 40e6);
        usdc.setBlocked(seller, false);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.OwedWithdrawn(address(usdc), seller, 40e6);
        vm.prank(seller, relayer);
        family.withdrawOwed(address(usdc));
    }

    function test_a_hold_and_its_release_are_announced() public {
        _openAndFund(100e6);
        bytes32 reason = keccak256("report");
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.Held(DEAL, uint64(vm.getBlockTimestamp()) + 7 days, reason);
        vm.prank(guardian, relayer);
        family.hold(DEAL, reason);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.HoldReleased(DEAL);
        vm.prank(guardian, relayer);
        family.releaseHold(DEAL);
    }

    function test_the_longstop_names_the_senior_reviewer() public {
        _openAndFund(100e6);
        vm.warp(uint256(family.accountOf(DEAL).horizon) + family.LONGSTOP());
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 60e6;
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.AccountClosed(DEAL);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.LongstopSplit(DEAL, seniorSafe);
        vm.prank(seniorSafe, relayer);
        family.longstopSplit(DEAL, 40e6, toPayees);
    }

    /// A record that could not be written waits, and a retry after someone
    /// else wrote it says so instead of writing it twice.
    function test_a_record_that_waits_and_one_already_written_are_announced() public {
        _openAndFund(100e6);
        vm.mockCallRevert(address(record), abi.encodeWithSelector(IKarwanRecord.recordOutcome.selector), "down");
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.RecordPending(DEAL, 0, Outcome.COMPLETED, 7);
        family.recordOutcome(DEAL, 0, Outcome.COMPLETED, 7);
        vm.clearMockedCalls();
        vm.prank(address(family));
        record.recordOutcome(DEAL, buyerId, 0, Outcome.COMPLETED, 0, 7);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.RecordAlreadyWritten(DEAL, 0);
        family.retryRecord(DEAL, 0);
    }

    /// Parking and pulling name the amount that moved, which is the change in
    /// what the family has parked.
    function test_parking_and_pulling_yield_name_the_amount_that_moved() public {
        _deployYield(address(family), 9_000);
        _openAndFund(1_000e6);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.YieldParked(address(usdc), 900e6);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 900e6);
        vm.recordLogs();
        family.pay(DEAL, seller, 1_000e6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 pulled;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(family) && logs[i].topics[0] == KarwanSettlementBase.YieldPulled.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), address(usdc));
                pulled += abi.decode(logs[i].data, (uint256));
            }
        }
        assertGt(pulled, 0);
        assertEq(pulled, 900e6 - family.parked(address(usdc)));
    }
}
