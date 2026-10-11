// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";
import {IKarwanHub} from "../../src/suite/interfaces/IKarwanSuite.sol";
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
}
