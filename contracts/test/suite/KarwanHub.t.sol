// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";
import {IKarwanHub} from "../../src/suite/interfaces/IKarwanSuite.sol";
import {KarwanYieldPool} from "../../src/suite/KarwanYieldPool.sol";
import {BlocklistToken} from "./mocks/BlocklistToken.sol";

contract KarwanHubTest is Test {
    KarwanHub internal hub;
    BlocklistToken internal usdc;
    address internal family = makeAddr("family");
    address internal guardian = makeAddr("guardian");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        hub = new KarwanHub(address(this));
        usdc = new BlocklistToken(6);
        hub.wire(makeAddr("identity"), makeAddr("record"), makeAddr("stakeVault"));
        hub.setFeeRecipient(makeAddr("feeSafe"));
        hub.setGuardian(guardian);
        hub.setReviewers(makeAddr("reviewSafe"), makeAddr("seniorSafe"));
        hub.setAsset(address(usdc), true, 5_000e6);
        hub.registerFamily(family, 100);
        hub.setCaps(family, address(usdc), 1_000e6, 10_000e6);
    }

    function test_open_when_everything_is_set() public view {
        IKarwanHub.OpeningConfig memory c = hub.openingConfig(family, address(usdc));
        assertTrue(c.open);
        assertEq(c.feeBps, 100);
        assertEq(c.perDealCap, 1_000e6);
        assertEq(c.highValue, 5_000e6);
        assertEq(hub.totalCapOf(family, address(usdc)), 10_000e6);
    }

    function test_closed_for_unknown_family_asset_or_missing_caps() public {
        assertFalse(hub.openingConfig(stranger, address(usdc)).open);
        assertFalse(hub.openingConfig(family, address(0xE0)).open);
        hub.setCaps(family, address(usdc), 0, 0);
        assertFalse(hub.openingConfig(family, address(usdc)).open);
    }

    function test_guardian_pauses_only_the_owner_resumes() public {
        vm.prank(guardian);
        hub.pauseFamily(family);
        assertFalse(hub.openingConfig(family, address(usdc)).open);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        hub.resumeFamily(family);
        hub.resumeFamily(family);
        assertTrue(hub.openingConfig(family, address(usdc)).open);
    }

    function test_stranger_cannot_pause() public {
        vm.prank(stranger);
        vm.expectRevert(KarwanHub.NotGuardian.selector);
        hub.pauseFamily(family);
    }

    function test_retired_family_stays_retired_and_stays_a_family() public {
        hub.retireFamily(family);
        assertFalse(hub.openingConfig(family, address(usdc)).open);
        assertTrue(hub.isFamily(family));
        vm.expectRevert(KarwanHub.AlreadyRegistered.selector);
        hub.registerFamily(family, 100);
    }

    function test_open_deals_take_money_unless_paused_revoked_or_asset_off() public {
        assertTrue(hub.acceptsMoney(family, address(usdc)));
        hub.retireFamily(family);
        assertTrue(hub.acceptsMoney(family, address(usdc)));
        hub.setCaps(family, address(usdc), 0, 10_000e6);
        assertTrue(hub.acceptsMoney(family, address(usdc)));
        vm.prank(guardian);
        hub.pauseFamily(family);
        assertFalse(hub.acceptsMoney(family, address(usdc)));
        hub.resumeFamily(family);
        hub.setAsset(address(usdc), false, 0);
        assertFalse(hub.acceptsMoney(family, address(usdc)));
        hub.setAsset(address(usdc), true, 0);
        hub.revokeFamily(family);
        assertFalse(hub.acceptsMoney(family, address(usdc)));
        assertFalse(hub.acceptsMoney(stranger, address(usdc)));
    }

    function test_revoked_family_loses_every_power() public {
        hub.revokeFamily(family);
        assertFalse(hub.isFamily(family));
        assertFalse(hub.openingConfig(family, address(usdc)).open);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hub.revokeFamily(family);
    }

    function test_ownership_cannot_be_renounced() public {
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.renounceOwnership();
        assertEq(hub.owner(), address(this));
    }

    function test_fee_ceiling_is_ten_percent() public {
        vm.expectRevert(KarwanHub.BadFee.selector);
        hub.setFamilyFee(family, 1_001);
        vm.expectRevert(KarwanHub.BadFee.selector);
        hub.registerFamily(makeAddr("f2"), 1_001);
        hub.setFamilyFee(family, 1_000);
    }

    /// A fee paid to a family's own address would stay in it while its books
    /// let it go, so a family is never the fee recipient.
    function test_a_family_is_never_the_fee_recipient() public {
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.setFeeRecipient(family);
        address next = makeAddr("nextFamily");
        hub.setFeeRecipient(next);
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.registerFamily(next, 100);
    }

    /// The hub, the stake vault and a yield pool would hold fees with no way
    /// out, so none of them is the fee recipient either, in whichever order
    /// they are set.
    function test_no_suite_contract_is_the_fee_recipient() public {
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.setFeeRecipient(address(hub));
        address stakeVault = hub.stakeVault();
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.setFeeRecipient(stakeVault);

        KarwanYieldPool pool = new KarwanYieldPool(address(hub), address(usdc));
        address feeSafe = hub.feeRecipient();
        hub.setFeeRecipient(address(pool));
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.setYieldPool(address(usdc), address(pool));
        hub.setFeeRecipient(feeSafe);
        hub.setYieldPool(address(usdc), address(pool));
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        hub.setFeeRecipient(address(pool));

        KarwanHub fresh = new KarwanHub(address(this));
        address freshVault = makeAddr("freshVault");
        fresh.setFeeRecipient(freshVault);
        address identity = makeAddr("identity");
        address record = makeAddr("record");
        vm.expectRevert(KarwanHub.NotAllowed.selector);
        fresh.wire(identity, record, freshVault);
    }

    function test_caps_per_deal_never_above_total() public {
        vm.expectRevert(KarwanHub.BadCaps.selector);
        hub.setCaps(family, address(usdc), 2_000e6, 1_000e6);
    }

    function test_assets_must_have_six_decimals() public {
        BlocklistToken eighteen = new BlocklistToken(18);
        vm.expectRevert(KarwanHub.BadAsset.selector);
        hub.setAsset(address(eighteen), true, 0);
    }

    function test_wire_once_and_only_by_the_deployer() public {
        vm.expectRevert(KarwanHub.AlreadyWired.selector);
        hub.wire(address(1), address(2), address(3));
        KarwanHub fresh = new KarwanHub(address(this));
        vm.prank(stranger);
        vm.expectRevert(KarwanHub.NotDeployer.selector);
        fresh.wire(address(1), address(2), address(3));
    }

    function test_wire_refuses_a_zero_address() public {
        KarwanHub fresh = new KarwanHub(address(this));
        address identity = makeAddr("identity");
        address record = makeAddr("record");
        address stakeVault = makeAddr("stakeVault");
        vm.expectRevert(KarwanHub.Zero.selector);
        fresh.wire(address(0), record, stakeVault);
        vm.expectRevert(KarwanHub.Zero.selector);
        fresh.wire(identity, address(0), stakeVault);
        vm.expectRevert(KarwanHub.Zero.selector);
        fresh.wire(identity, record, address(0));
        assertEq(fresh.identity(), address(0));
        fresh.wire(identity, record, stakeVault);
        assertEq(fresh.stakeVault(), stakeVault);
    }

    function test_a_zero_family_is_refused() public {
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.registerFamily(address(0), 100);
        (bool registered,,,,) = hub.families(address(0));
        assertFalse(registered);
    }

    function test_a_zero_asset_is_refused() public {
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setAsset(address(0), true, 0);
        assertFalse(hub.assetAllowed(address(0)));
    }

    function test_a_zero_yield_pool_is_refused() public {
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setYieldPool(address(usdc), address(0));
        assertEq(hub.yieldPoolOf(address(usdc)), address(0));
    }

    function test_a_zero_fee_recipient_is_refused() public {
        address feeSafe = hub.feeRecipient();
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setFeeRecipient(address(0));
        assertEq(hub.feeRecipient(), feeSafe);
    }

    function test_a_zero_guardian_is_refused() public {
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setGuardian(address(0));
        assertEq(hub.guardian(), guardian);
    }

    function test_zero_reviewers_are_refused() public {
        address review = hub.reviewSafe();
        address senior = hub.seniorSafe();
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setReviewers(address(0), senior);
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setReviewers(review, address(0));
        assertEq(hub.reviewSafe(), review);
        assertEq(hub.seniorSafe(), senior);
    }

    function test_a_zero_verifier_is_refused() public {
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setVerifier(address(0), true);
        assertFalse(hub.isVerifier(address(0)));
    }

    function test_a_zero_issuer_is_refused() public {
        vm.expectRevert(KarwanHub.Zero.selector);
        hub.setIssuer(address(0), true);
        assertFalse(hub.isIssuer(address(0)));
    }

    function test_an_unregistered_family_has_nothing_to_change() public {
        address token = address(usdc);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.setFamilyFee(stranger, 100);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.retireFamily(stranger);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.revokeFamily(stranger);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.pauseFamily(stranger);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.resumeFamily(stranger);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.setCaps(stranger, token, 1, 1);
        vm.expectRevert(KarwanHub.UnknownFamily.selector);
        hub.setYieldShare(stranger, 1);
        assertEq(hub.totalCapOf(stranger, token), 0);
    }

    function test_every_setter_is_owner_only() public {
        vm.startPrank(stranger);
        bytes memory e = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);
        vm.expectRevert(e);
        hub.registerFamily(address(9), 0);
        vm.expectRevert(e);
        hub.setCaps(family, address(usdc), 1, 1);
        vm.expectRevert(e);
        hub.setAsset(address(usdc), false, 0);
        vm.expectRevert(e);
        hub.setFeeRecipient(stranger);
        vm.expectRevert(e);
        hub.setGuardian(stranger);
        vm.expectRevert(e);
        hub.setReviewers(stranger, stranger);
        vm.expectRevert(e);
        hub.setAutoArbiter(stranger);
        vm.expectRevert(e);
        hub.setVerifier(stranger, true);
        vm.expectRevert(e);
        hub.setIssuer(stranger, true);
        vm.expectRevert(e);
        hub.retireFamily(family);
        vm.expectRevert(e);
        hub.setFamilyFee(family, 0);
        vm.expectRevert(e);
        hub.resumeFamily(family);
        vm.expectRevert(e);
        hub.revokeFamily(family);
        vm.stopPrank();
    }

    function test_owned_by_the_timelock_a_change_waits_48_hours() public {
        address ownerSafe = makeAddr("ownerSafe");
        KarwanTimelock tl = new KarwanTimelock(48 hours, ownerSafe, guardian);
        KarwanHub governed = new KarwanHub(address(tl));
        bytes memory data = abi.encodeCall(KarwanHub.setGuardian, (stranger));
        vm.prank(ownerSafe);
        tl.schedule(address(governed), 0, data, bytes32(0), bytes32(0), 48 hours);
        vm.prank(ownerSafe);
        vm.expectRevert();
        tl.execute(address(governed), 0, data, bytes32(0), bytes32(0));
        vm.warp(block.timestamp + 48 hours);
        vm.prank(ownerSafe);
        tl.execute(address(governed), 0, data, bytes32(0), bytes32(0));
        assertEq(governed.guardian(), stranger);
    }

    // ------------------------------- Events -------------------------------

    function test_wiring_is_announced() public {
        KarwanHub fresh = new KarwanHub(address(this));
        address i = makeAddr("identity-2");
        address r = makeAddr("record-2");
        address v = makeAddr("vault-2");
        vm.expectEmit(address(fresh));
        emit KarwanHub.Wired(i, r, v);
        fresh.wire(i, r, v);
    }

    function test_each_change_to_a_family_is_announced() public {
        address next = makeAddr("next");
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilySet(next, false, 50);
        hub.registerFamily(next, 50);
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilySet(next, false, 70);
        hub.setFamilyFee(next, 70);
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilyPaused(next, true, guardian);
        vm.prank(guardian, stranger);
        hub.pauseFamily(next);
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilyPaused(next, false, address(this));
        hub.resumeFamily(next);
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilySet(next, true, 70);
        hub.retireFamily(next);
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilySet(next, true, 90);
        hub.setFamilyFee(next, 90);
        vm.expectEmit(address(hub));
        emit KarwanHub.FamilyRevoked(next);
        hub.revokeFamily(next);
    }

    function test_assets_caps_and_yield_settings_are_announced() public {
        vm.expectEmit(address(hub));
        emit KarwanHub.AssetSet(address(usdc), true, 9_000e6);
        hub.setAsset(address(usdc), true, 9_000e6);
        vm.expectEmit(address(hub));
        emit KarwanHub.CapsSet(family, address(usdc), 500e6, 5_000e6);
        hub.setCaps(family, address(usdc), 500e6, 5_000e6);
        KarwanYieldPool pool = new KarwanYieldPool(address(hub), address(usdc));
        vm.expectEmit(address(hub));
        emit KarwanHub.YieldPoolSet(address(usdc), address(pool));
        hub.setYieldPool(address(usdc), address(pool));
        vm.expectEmit(address(hub));
        emit KarwanHub.YieldShareSet(family, 4_000);
        hub.setYieldShare(family, 4_000);
    }

    function test_roles_and_lists_are_announced() public {
        address who = makeAddr("who");
        address senior = makeAddr("senior");
        vm.expectEmit(address(hub));
        emit KarwanHub.RoleSet("feeRecipient", who);
        hub.setFeeRecipient(who);
        vm.expectEmit(address(hub));
        emit KarwanHub.RoleSet("guardian", who);
        hub.setGuardian(who);
        vm.expectEmit(address(hub));
        emit KarwanHub.RoleSet("reviewSafe", who);
        vm.expectEmit(address(hub));
        emit KarwanHub.RoleSet("seniorSafe", senior);
        hub.setReviewers(who, senior);
        vm.expectEmit(address(hub));
        emit KarwanHub.RoleSet("autoArbiter", who);
        hub.setAutoArbiter(who);
        vm.expectEmit(address(hub));
        emit KarwanHub.ListSet("verifier", who, true);
        hub.setVerifier(who, true);
        vm.expectEmit(address(hub));
        emit KarwanHub.ListSet("issuer", who, true);
        hub.setIssuer(who, true);
        vm.expectEmit(address(hub));
        emit KarwanHub.ListSet("issuer", who, false);
        hub.setIssuer(who, false);
    }

    // ------------------------------ Outcomes ------------------------------

    function test_a_family_fee_of_exactly_the_maximum_is_accepted() public {
        address f = makeAddr("maxFee");
        hub.registerFamily(f, 1_000);
        hub.setFamilyFee(f, 1_000);
        hub.setCaps(f, address(usdc), 1_000e6, 10_000e6);
        assertEq(hub.openingConfig(f, address(usdc)).feeBps, 1_000);
    }

    function test_a_token_with_fewer_than_six_decimals_is_refused() public {
        BlocklistToken two = new BlocklistToken(2);
        vm.expectRevert(KarwanHub.BadAsset.selector);
        hub.setAsset(address(two), true, 0);
    }

    function test_no_yield_share_is_copied_for_an_asset_without_a_pool() public {
        hub.setYieldShare(family, 5_000);
        assertEq(hub.openingConfig(family, address(usdc)).yieldBps, 0);
    }
}
