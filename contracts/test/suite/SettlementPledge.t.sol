// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";

/// @notice Money a payer promises at opening, such as the rest of an
///         instalment plan, is counted against the caps when the deal opens and
///         is never refused later for room or a pause.
contract SettlementPledgeTest is SuiteFixture {
    address internal buyer;
    address internal seller;
    address internal stranger = makeAddr("stranger");
    bytes32 internal constant DEAL = bytes32("plan");

    function setUp() public {
        _deploySuite();
        (buyer,,) = _person("buyer");
        (seller,,) = _person("seller");
        _funded(buyer, 100_000e6);
    }

    function _openPlan(bytes32 dealId, uint256 first, uint256 rest) internal {
        vm.startPrank(buyer);
        family.open(dealId, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        family.fund(dealId, first);
        family.pledge(dealId, rest);
        vm.stopPrank();
    }

    function test_a_pledge_counts_against_the_total_cap_when_the_deal_opens() public {
        hub.setCaps(address(family), address(usdc), 100e6, 100e6);
        _openPlan(DEAL, 10e6, 30e6);
        assertEq(family.promisedTotal(address(usdc)), 30e6);
        assertEq(family.accountOf(DEAL).promised, 30e6);
        vm.startPrank(buyer);
        family.open(bytes32("other"), address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        vm.expectRevert(KarwanSettlementBase.OverCap.selector);
        family.fund(bytes32("other"), 61e6);
        family.fund(bytes32("other"), 60e6);
        vm.stopPrank();
    }

    function test_a_pledge_respects_the_per_deal_cap() public {
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        family.fund(DEAL, 400e6);
        vm.expectRevert(KarwanSettlementBase.OverCap.selector);
        family.pledge(DEAL, PER_DEAL - 400e6 + 1);
        family.pledge(DEAL, PER_DEAL - 400e6);
        vm.stopPrank();
    }

    function test_pledged_money_is_taken_while_paused_and_nothing_more() public {
        _openPlan(DEAL, 10e6, 30e6);
        vm.prank(guardian);
        hub.pauseFamily(address(family));
        vm.startPrank(buyer);
        vm.expectRevert(KarwanSettlementBase.OverCap.selector);
        family.fund(DEAL, 31e6);
        family.fund(DEAL, 20e6);
        family.fund(DEAL, 10e6);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.fund(DEAL, 1e6);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).balance, 40e6);
        assertEq(family.promisedTotal(address(usdc)), 0);
    }

    function test_pledged_money_is_taken_when_the_caps_are_full() public {
        _openPlan(DEAL, 10e6, 30e6);
        hub.setCaps(address(family), address(usdc), 10e6, 10e6);
        vm.prank(buyer);
        family.fund(DEAL, 30e6);
        assertEq(family.accountOf(DEAL).balance, 40e6);
    }

    function test_a_revoked_family_or_a_delisted_asset_refuses_pledged_money() public {
        _openPlan(DEAL, 10e6, 30e6);
        _openPlan(bytes32("second"), 10e6, 30e6);
        hub.setAsset(address(usdc), false, 0);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.fund(DEAL, 10e6);
        hub.setAsset(address(usdc), true, 5_000e6);
        hub.revokeFamily(address(family));
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.fund(bytes32("second"), 10e6);
    }

    function test_only_the_payer_pledges_and_only_once() public {
        vm.prank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        vm.prank(stranger);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.pledge(DEAL, 10e6);
        vm.startPrank(buyer);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.pledge(DEAL, 0);
        family.pledge(DEAL, 10e6);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.pledge(DEAL, 10e6);
        vm.stopPrank();
    }

    function test_closing_frees_what_was_never_paid() public {
        _openPlan(DEAL, 10e6, 30e6);
        family.pay(DEAL, buyer, 10e6);
        family.close(DEAL);
        assertEq(family.accountOf(DEAL).promised, 0);
        assertEq(family.promisedTotal(address(usdc)), 0);
    }

    function test_the_longstop_frees_what_was_never_paid() public {
        _openPlan(DEAL, 10e6, 30e6);
        vm.warp(uint256(family.accountOf(DEAL).horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        vm.prank(seniorSafe);
        family.longstopSplit(DEAL, 10e6, toPayees);
        assertEq(family.promisedTotal(address(usdc)), 0);
    }
}
