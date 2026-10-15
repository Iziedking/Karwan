// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";

/// @notice Deal money in the yield pool, through the settlement base: a deal is
///         eligible only as it opened, a family parks only the eligible share
///         of what it holds, every payout is paid in full from the pool, and a
///         pool that cannot pay leaves the payout owed, never lost or stuck.
contract SettlementYieldTest is SuiteFixture {
    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    bytes32 internal constant DEAL = bytes32("yield-deal");
    uint256 internal constant AMOUNT = 50_000e6;

    function setUp() public {
        _deploySuite();
        hub.setCaps(address(family), address(usdc), 100_000e6, 1_000_000e6);
        _funded(buyer, 1_000_000e6);
    }

    function _deal(bytes32 id, uint64 term, uint256 amount) internal {
        vm.startPrank(buyer);
        family.open(id, address(usdc), _one(seller), uint64(block.timestamp) + term);
        family.fund(id, amount);
        vm.stopPrank();
    }

    function _books() internal view {
        assertEq(
            usdc.balanceOf(address(family)) + family.parked(address(usdc)),
            family.held(address(usdc)) + family.owedTotal(address(usdc))
        );
        assertEq(family.parked(address(usdc)), pool.principalOf(address(family)));
    }

    function test_a_deal_takes_its_yield_share_as_it_opened() public {
        _deal(bytes32("before"), 30 days, 1_000e6);
        assertEq(family.accountOf(bytes32("before")).yieldBps, 0);
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        assertEq(family.accountOf(DEAL).yieldBps, 9_000);
        hub.setYieldShare(address(family), 2_000);
        assertEq(family.accountOf(DEAL).yieldBps, 9_000);
        assertEq(family.parkable(address(usdc)), 45_000e6);
    }

    function test_nothing_is_subscribed_until_the_treasury_seeds_the_pool() public {
        _deployYieldBare(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        pool.rebalance();
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        _seedPool();
        pool.rebalance();
        assertGt(teller.share_().balanceOf(address(pool)), 0);
        family.pay(DEAL, seller, AMOUNT);
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    function test_a_short_deal_is_not_eligible() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 3 days - 1, AMOUNT);
        assertEq(family.accountOf(DEAL).yieldBps, 0);
        assertEq(family.parkable(address(usdc)), 0);
    }

    function test_nothing_is_parked_without_a_pool() public {
        _deal(DEAL, 30 days, AMOUNT);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.rebalanceYield(address(usdc));
    }

    function test_anyone_parks_the_eligible_share_and_no_more() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        vm.prank(makeAddr("anyone"));
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 45_000e6);
        assertEq(usdc.balanceOf(address(family)), 5_000e6);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 45_000e6);
        _books();
    }

    function test_a_payout_pulls_from_the_pool_and_is_paid_in_full() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        pool.rebalance();
        family.pay(DEAL, seller, AMOUNT);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(family.parked(address(usdc)), 0);
        assertEq(family.parkable(address(usdc)), 0);
        _books();
    }

    function test_a_payout_the_pool_cannot_cover_is_owed_and_paid_when_it_can() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        pool.rebalance();
        teller.setPaused(true);
        family.pay(DEAL, seller, AMOUNT);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(family.owed(address(usdc), seller), AMOUNT);
        assertEq(family.accountOf(DEAL).balance, 0);
        _books();
        vm.prank(seller);
        vm.expectRevert(KarwanSettlementBase.PoolBusy.selector);
        family.withdrawOwed(address(usdc));
        teller.setPaused(false);
        vm.prank(seller);
        family.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(seller), AMOUNT);
        _books();
    }

    function test_rebalance_brings_back_what_the_deals_no_longer_hold() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        family.pay(DEAL, seller, 3_000e6);
        assertEq(family.parkable(address(usdc)), 42_300e6);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 42_300e6);
        _books();
    }

    function test_a_revoked_family_brings_everything_back() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        hub.revokeFamily(address(family));
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(family)), AMOUNT);
        family.pay(DEAL, seller, AMOUNT);
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    function test_owed_money_is_never_parked() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        usdc.setBlocked(seller, true);
        family.pay(DEAL, seller, AMOUNT);
        assertEq(family.owed(address(usdc), seller), AMOUNT);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 0);
        _books();
    }

    function test_a_fee_is_paid_from_the_pool_too() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        family.pay(DEAL, seller, 4_000e6);
        family.payFee(DEAL, 500e6);
        family.pay(DEAL, seller, AMOUNT - 4_500e6);
        assertEq(usdc.balanceOf(feeSafe), 500e6);
        assertEq(usdc.balanceOf(seller), AMOUNT - 500e6);
        _books();
    }

    function test_a_deal_that_takes_no_yield_is_paid_from_cash_while_the_pool_is_busy() public {
        _deployYield(address(family), 9_000);
        bytes32 shortDeal = bytes32("short");
        _deal(shortDeal, 1 days, 10_000e6);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        pool.rebalance();
        family.pay(DEAL, seller, AMOUNT);
        teller.setPaused(true);
        family.pay(shortDeal, seller, 10_000e6);
        assertEq(usdc.balanceOf(seller), AMOUNT + 10_000e6);
        assertEq(family.owed(address(usdc), seller), 0);
        _books();
    }

    function test_a_delisted_asset_brings_parked_money_back() public {
        _deployYield(address(family), 9_000);
        _deal(DEAL, 30 days, AMOUNT);
        family.rebalanceYield(address(usdc));
        hub.setAsset(address(usdc), false, 0);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(family)), AMOUNT);
    }
}
