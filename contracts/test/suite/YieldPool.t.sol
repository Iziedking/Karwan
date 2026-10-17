// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanYieldPool} from "../../src/suite/KarwanYieldPool.sol";
import {MockTeller} from "./mocks/MockTeller.sol";
import {BlocklistToken, SkimToken} from "./mocks/BlocklistToken.sol";

/// @notice The yield pool on its own: families park and take back exactly what
///         they parked, cash above a buffer earns, yield leaves only above a
///         cushion and only to the fee recipient, and a Teller that refuses
///         never takes principal with it.
contract YieldPoolTest is SuiteFixture {
    address internal stranger = makeAddr("stranger");
    uint256 internal constant PARKED = 100_000e6;

    function setUp() public {
        _deploySuite();
        _deployYield(address(family), 9_000);
        usdc.mint(address(family), 1_000_000e6);
        vm.prank(address(family));
        usdc.approve(address(pool), type(uint256).max);
    }

    function _park(uint256 amount) internal {
        vm.prank(address(family));
        pool.deposit(amount);
    }

    function _take(uint256 amount) internal {
        vm.prank(address(family));
        pool.withdraw(amount);
    }

    // ------------------------------ Families ------------------------------

    function test_only_a_family_parks_and_only_in_the_hubs_pool() public {
        usdc.mint(stranger, 10e6);
        vm.startPrank(stranger);
        usdc.approve(address(pool), type(uint256).max);
        vm.expectRevert(KarwanYieldPool.NotFamily.selector);
        pool.deposit(10e6);
        vm.stopPrank();
        KarwanYieldPool other = new KarwanYieldPool(address(hub), address(usdc));
        vm.startPrank(address(family));
        usdc.approve(address(other), type(uint256).max);
        vm.expectRevert(KarwanYieldPool.NotFamily.selector);
        other.deposit(10e6);
        vm.stopPrank();
    }

    function test_a_family_takes_back_exactly_what_it_parked() public {
        _park(10_000e6);
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.OverPrincipal.selector);
        pool.withdraw(10_000e6 + 1);
        uint256 before = usdc.balanceOf(address(family));
        _take(4_000e6);
        assertEq(usdc.balanceOf(address(family)), before + 4_000e6);
        assertEq(pool.principalOf(address(family)), 6_000e6);
        assertEq(pool.totalPrincipal(), 6_000e6);
    }

    function test_parking_nothing_is_refused() public {
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.BadAmount.selector);
        pool.deposit(0);
    }

    function test_taking_back_nothing_is_refused() public {
        _park(10_000e6);
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.BadAmount.selector);
        pool.withdraw(0);
        assertEq(pool.principalOf(address(family)), 10_000e6);
    }

    function test_a_token_that_delivers_less_is_never_parked() public {
        SkimToken skim = new SkimToken();
        hub.setAsset(address(skim), true, 0);
        KarwanYieldPool skimPool = new KarwanYieldPool(address(hub), address(skim));
        hub.setYieldPool(address(skim), address(skimPool));
        skim.mint(address(family), 100e6);
        vm.startPrank(address(family));
        skim.approve(address(skimPool), type(uint256).max);
        vm.expectRevert(KarwanYieldPool.BadAmount.selector);
        skimPool.deposit(100e6);
        vm.stopPrank();
        assertEq(skimPool.totalPrincipal(), 0);
    }

    function test_rebalance_keeps_a_cash_buffer_and_subscribes_the_rest() public {
        _park(PARKED);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), 10_000e6);
        assertGt(teller.share_().balanceOf(address(pool)), 0);
        assertApproxEqAbs(pool.value(), PARKED + 1e6, 2);
    }

    function test_the_buffer_never_falls_below_its_floor() public {
        _park(20_000e6);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), 5_000e6);
    }

    function test_the_pool_subscribes_only_what_its_margin_pays_for() public {
        teller.setSpread(4);
        _park(PARKED);
        pool.rebalance();
        assertGe(pool.value(), PARKED);
        assertGt(usdc.balanceOf(address(pool)), 10_000e6);
        uint256 cost = 40e6;
        usdc.mint(feeSafe, cost);
        vm.startPrank(feeSafe);
        usdc.approve(address(pool), cost);
        pool.backstop(cost);
        vm.stopPrank();
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), 10_000e6);
        assertGe(pool.value(), PARKED);
        _take(PARKED);
        assertEq(pool.totalPrincipal(), 0);
    }

    function test_a_pool_without_a_teller_keeps_everything_in_cash() public {
        pool.setTeller(address(0));
        _park(PARKED);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), PARKED + 1e6);
        assertEq(teller.share_().balanceOf(address(pool)), 0);
    }

    function test_a_pool_without_a_teller_is_worth_its_cash() public {
        pool.setTeller(address(0));
        _park(PARKED);
        assertEq(pool.value(), PARKED + 1e6);
        assertEq(pool.deficit(), 0);
    }

    /// The Teller still offers room but cannot take the cash.
    function test_a_subscription_the_teller_refuses_leaves_the_cash_in_the_pool() public {
        _park(PARKED);
        usdc.setBlocked(address(teller), true);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.SubscribeFailed(PARKED + 1e6 - 10_000e6);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), PARKED + 1e6);
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        assertEq(usdc.allowance(address(pool), address(teller)), 0);
    }

    function test_an_unentitled_pool_stays_in_cash() public {
        teller.entitle(address(pool), false);
        _park(PARKED);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), PARKED + 1e6);
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        _take(PARKED);
        assertEq(pool.totalPrincipal(), 0);
    }

    function test_a_withdrawal_beyond_cash_redeems_shares() public {
        _park(PARKED);
        pool.rebalance();
        uint256 before = usdc.balanceOf(address(family));
        _take(60_000e6);
        assertEq(usdc.balanceOf(address(family)), before + 60_000e6);
    }

    function test_a_paused_teller_pays_from_cash_and_refuses_the_rest() public {
        _park(PARKED);
        pool.rebalance();
        teller.setPaused(true);
        _take(5_000e6);
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.Busy.selector);
        pool.withdraw(50_000e6);
        assertEq(pool.principalOf(address(family)), 95_000e6);
        teller.setPaused(false);
        _take(50_000e6);
        assertEq(pool.principalOf(address(family)), 45_000e6);
    }

    function test_a_teller_that_cannot_quote_a_withdrawal_pays_from_cash_and_refuses_the_rest() public {
        _park(PARKED);
        pool.rebalance();
        vm.mockCallRevert(address(teller), abi.encodeWithSelector(MockTeller.previewWithdraw.selector), "");
        _take(5_000e6);
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.Busy.selector);
        pool.withdraw(50_000e6);
        assertEq(pool.principalOf(address(family)), 95_000e6);
        assertGt(teller.share_().balanceOf(address(pool)), 0);
    }

    function test_a_revoked_family_still_takes_back_its_money() public {
        _park(10_000e6);
        hub.revokeFamily(address(family));
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.NotFamily.selector);
        pool.deposit(1e6);
        _take(10_000e6);
        assertEq(pool.totalPrincipal(), 0);
    }

    // -------------------------------- Yield -------------------------------

    function test_yield_goes_to_the_fee_recipient_only_above_the_cushion() public {
        _park(PARKED);
        pool.rebalance();
        teller.setPrice(1.1457e18);
        vm.expectRevert(KarwanYieldPool.NoYield.selector);
        pool.sweepYield();
        teller.setPrice(1.1514e18);
        vm.prank(stranger);
        pool.sweepYield();
        uint256 swept = usdc.balanceOf(feeSafe);
        assertApproxEqAbs(swept, 400e6, 2e6);
        assertGe(pool.value(), PARKED + pool.cushion());
        assertGe(usdc.balanceOf(address(pool)), pool.bufferTarget());
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_a_backstop_of_nothing_is_refused() public {
        vm.prank(feeSafe);
        vm.expectRevert(KarwanYieldPool.BadAmount.selector);
        pool.backstop(0);
    }

    function test_a_fall_in_price_stops_sweeping_until_the_treasury_backstops() public {
        _park(PARKED);
        pool.rebalance();
        teller.setPrice(1.1286e18);
        uint256 hole = pool.deficit();
        assertGt(hole, 0);
        vm.expectRevert(KarwanYieldPool.NoYield.selector);
        pool.sweepYield();
        usdc.mint(feeSafe, hole + pool.cushion());
        vm.startPrank(feeSafe);
        usdc.approve(address(pool), type(uint256).max);
        pool.backstop(hole + pool.cushion());
        vm.stopPrank();
        assertEq(pool.deficit(), 0);
        assertEq(pool.totalPrincipal(), PARKED);
        _take(PARKED);
    }

    function test_a_teller_that_cannot_quote_counts_its_shares_as_nothing() public {
        _park(PARKED);
        pool.rebalance();
        vm.mockCallRevert(address(teller), abi.encodeWithSelector(MockTeller.previewRedeem.selector), "");
        assertEq(pool.value(), 10_000e6);
        vm.expectRevert(KarwanYieldPool.NoYield.selector);
        pool.sweepYield();
    }

    // ------------------------------ Settings ------------------------------

    function test_the_teller_changes_only_while_the_pool_holds_none_of_its_shares() public {
        _park(PARKED);
        pool.rebalance();
        MockTeller next = new MockTeller(usdc);
        vm.expectRevert(KarwanYieldPool.SharesHeld.selector);
        pool.setTeller(address(next));
        pool.stop();
        pool.rebalance();
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        pool.setTeller(address(next));
        assertEq(address(pool.share()), address(next.share_()));
        BlocklistToken other = new BlocklistToken(6);
        MockTeller wrong = new MockTeller(other);
        pool.setTeller(address(0));
        vm.expectRevert(KarwanYieldPool.BadTeller.selector);
        pool.setTeller(address(wrong));
        vm.prank(stranger);
        vm.expectRevert(KarwanYieldPool.NotOwner.selector);
        pool.setTeller(address(next));
    }

    function test_a_teller_for_another_asset_is_refused() public {
        BlocklistToken other = new BlocklistToken(6);
        MockTeller wrong = new MockTeller(other);
        vm.expectRevert(KarwanYieldPool.BadTeller.selector);
        pool.setTeller(address(wrong));
        assertEq(address(pool.teller()), address(teller));
    }

    function test_a_teller_without_a_share_token_is_refused() public {
        MockTeller next = new MockTeller(usdc);
        vm.mockCall(address(next), abi.encodeWithSelector(MockTeller.share.selector), abi.encode(address(0)));
        vm.expectRevert(KarwanYieldPool.BadTeller.selector);
        pool.setTeller(address(next));
        assertEq(address(pool.teller()), address(teller));
    }

    function test_shares_the_teller_cannot_price_block_a_teller_change_however_few() public {
        _park(PARKED);
        pool.rebalance();
        pool.stop();
        pool.rebalance();
        address dusty = makeAddr("dusty");
        teller.entitle(dusty, true);
        usdc.mint(dusty, 10);
        vm.startPrank(dusty);
        usdc.approve(address(teller), 10);
        teller.deposit(10, address(pool));
        vm.stopPrank();
        vm.mockCallRevert(address(teller), abi.encodeWithSelector(MockTeller.previewRedeem.selector), "");
        vm.expectRevert(KarwanYieldPool.SharesHeld.selector);
        pool.setTeller(address(0));
        assertEq(address(pool.teller()), address(teller));
    }

    function test_the_guardian_stops_subscriptions_and_only_the_owner_resumes() public {
        _park(PARKED);
        pool.rebalance();
        vm.prank(stranger);
        vm.expectRevert(KarwanYieldPool.NotGuardian.selector);
        pool.stop();
        vm.prank(guardian);
        pool.stop();
        vm.prank(stranger);
        pool.rebalance();
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        assertApproxEqAbs(usdc.balanceOf(address(pool)), PARKED + 1e6, 2);
        vm.prank(guardian);
        vm.expectRevert(KarwanYieldPool.NotOwner.selector);
        pool.resume();
        pool.resume();
        pool.rebalance();
        assertGt(teller.share_().balanceOf(address(pool)), 0);
    }

    function test_settings_are_bounded_and_the_owners_alone() public {
        vm.expectRevert(KarwanYieldPool.BadSetting.selector);
        pool.setBuffer(5_001, 5_000e6);
        vm.expectRevert(KarwanYieldPool.BadSetting.selector);
        pool.setCushion(9);
        vm.expectRevert(KarwanYieldPool.BadSetting.selector);
        pool.setCushion(501);
        vm.startPrank(stranger);
        vm.expectRevert(KarwanYieldPool.NotOwner.selector);
        pool.setBuffer(2_000, 5_000e6);
        vm.expectRevert(KarwanYieldPool.NotOwner.selector);
        pool.setCushion(100);
        vm.stopPrank();
        pool.setBuffer(2_000, 1_000e6);
        pool.setCushion(100);
        assertEq(pool.bufferBps(), 2_000);
        assertEq(pool.cushionBps(), 100);
    }

    // --------------------------------- Hub --------------------------------

    function test_a_pool_needs_a_hub_and_an_asset() public {
        vm.expectRevert(KarwanYieldPool.Zero.selector);
        new KarwanYieldPool(address(0), address(usdc));
        vm.expectRevert(KarwanYieldPool.Zero.selector);
        new KarwanYieldPool(address(hub), address(0));
    }

    function test_the_hub_points_at_one_pool_per_asset_once() public {
        KarwanYieldPool other = new KarwanYieldPool(address(hub), address(usdc));
        vm.expectRevert(KarwanHub.PoolSet.selector);
        hub.setYieldPool(address(usdc), address(other));
        assertEq(hub.yieldPoolOf(address(usdc)), address(pool));
    }

    function test_the_hub_refuses_a_pool_for_another_asset_or_hub() public {
        BlocklistToken eurc = new BlocklistToken(6);
        hub.setAsset(address(eurc), true, 5_000e6);
        KarwanYieldPool wrongAsset = new KarwanYieldPool(address(hub), address(usdc));
        vm.expectRevert(KarwanHub.BadAsset.selector);
        hub.setYieldPool(address(eurc), address(wrongAsset));
        KarwanYieldPool wrongHub = new KarwanYieldPool(makeAddr("otherHub"), address(eurc));
        vm.expectRevert(KarwanHub.BadAsset.selector);
        hub.setYieldPool(address(eurc), address(wrongHub));
        vm.prank(stranger);
        vm.expectRevert();
        hub.setYieldPool(address(eurc), address(wrongAsset));
    }

    function test_a_familys_yield_share_is_capped_and_copied_by_new_deals() public {
        vm.expectRevert(KarwanHub.BadShare.selector);
        hub.setYieldShare(address(family), 9_001);
        assertEq(hub.openingConfig(address(family), address(usdc)).yieldBps, 9_000);
        hub.setYieldShare(address(family), 0);
        assertEq(hub.openingConfig(address(family), address(usdc)).yieldBps, 0);
    }

    function test_a_subscription_that_leaves_what_is_parked_uncovered_is_undone() public {
        _park(PARKED);
        teller.setShort(100);
        vm.expectRevert(KarwanYieldPool.Uncovered.selector);
        pool.rebalance();
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        assertGe(pool.value(), PARKED);
        teller.setShort(0);
        pool.rebalance();
        assertGt(teller.share_().balanceOf(address(pool)), 0);
    }

    function test_a_stopped_pool_unwinds_in_parts_when_the_teller_limits_a_redemption() public {
        _park(PARKED);
        pool.rebalance();
        uint256 shares = teller.share_().balanceOf(address(pool));
        teller.setRedeemLimit(shares / 2 + 1);
        pool.stop();
        pool.rebalance();
        uint256 left = teller.share_().balanceOf(address(pool));
        assertGt(left, 0);
        assertLt(left, shares);
        pool.rebalance();
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        pool.setTeller(address(0));
    }

    function test_dust_sent_to_the_pool_never_blocks_a_teller_change() public {
        _park(PARKED);
        pool.rebalance();
        pool.stop();
        pool.rebalance();
        address dusty = makeAddr("dusty");
        teller.entitle(dusty, true);
        usdc.mint(dusty, 10);
        vm.startPrank(dusty);
        usdc.approve(address(teller), 10);
        teller.deposit(10, address(pool));
        vm.stopPrank();
        assertGt(teller.share_().balanceOf(address(pool)), 0);
        pool.setTeller(address(0));
        assertEq(address(pool.teller()), address(0));
    }

    function test_a_delisted_asset_takes_no_new_parked_money() public {
        hub.setAsset(address(usdc), false, 0);
        vm.prank(address(family));
        vm.expectRevert(KarwanYieldPool.NotFamily.selector);
        pool.deposit(1e6);
    }

    // ------------------------------- Events -------------------------------

    /// The one log `emitter` wrote with this signature in the recorded logs.
    function _onlyLog(address emitter, bytes32 sig) internal view returns (Vm.Log memory found) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == sig) {
                found = logs[i];
                ++n;
            }
        }
        assertEq(n, 1);
    }

    function test_parking_and_taking_back_are_announced() public {
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.Deposited(address(family), 10_000e6);
        _park(10_000e6);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.Withdrawn(address(family), 4_000e6);
        _take(4_000e6);
    }

    function test_a_subscription_announces_the_cash_paid_and_the_shares_got() public {
        _park(PARKED);
        uint256 cash = usdc.balanceOf(address(pool));
        vm.recordLogs();
        pool.rebalance();
        Vm.Log memory l = _onlyLog(address(pool), KarwanYieldPool.Subscribed.selector);
        (uint256 assets, uint256 shares) = abi.decode(l.data, (uint256, uint256));
        assertGt(assets, 0);
        assertEq(assets, cash - usdc.balanceOf(address(pool)));
        assertEq(shares, teller.share_().balanceOf(address(pool)));
    }

    function test_stopping_redeems_and_announces_the_shares_sold_and_the_cash_got() public {
        _park(PARKED);
        pool.rebalance();
        uint256 shares = teller.share_().balanceOf(address(pool));
        uint256 cash = usdc.balanceOf(address(pool));
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.Stopped(true, guardian);
        vm.prank(guardian, stranger);
        pool.stop();
        vm.recordLogs();
        pool.rebalance();
        Vm.Log memory l = _onlyLog(address(pool), KarwanYieldPool.Redeemed.selector);
        (uint256 sold, uint256 got) = abi.decode(l.data, (uint256, uint256));
        assertEq(sold, shares);
        assertEq(got, usdc.balanceOf(address(pool)) - cash);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.Stopped(false, address(this));
        pool.resume();
    }

    function test_a_sweep_announces_the_fee_recipient_and_what_it_got() public {
        _park(PARKED);
        pool.rebalance();
        teller.setPrice(1.1514e18);
        uint256 before = usdc.balanceOf(feeSafe);
        vm.recordLogs();
        vm.prank(stranger);
        pool.sweepYield();
        Vm.Log memory l = _onlyLog(address(pool), KarwanYieldPool.YieldSwept.selector);
        assertEq(address(uint160(uint256(l.topics[1]))), feeSafe);
        assertEq(abi.decode(l.data, (uint256)), usdc.balanceOf(feeSafe) - before);
    }

    function test_a_backstop_and_each_setting_are_announced() public {
        usdc.mint(feeSafe, 10e6);
        vm.prank(feeSafe);
        usdc.approve(address(pool), 10e6);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.Backstopped(feeSafe, 10e6);
        vm.prank(feeSafe, stranger);
        pool.backstop(10e6);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.BufferSet(2_000, 7_000e6);
        pool.setBuffer(2_000, 7_000e6);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.CushionSet(300);
        pool.setCushion(300);
        MockTeller next = new MockTeller(usdc);
        vm.expectEmit(address(pool));
        emit KarwanYieldPool.TellerSet(address(next), next.share());
        pool.setTeller(address(next));
    }
}
