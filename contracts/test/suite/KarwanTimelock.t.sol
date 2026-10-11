// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";

contract KarwanTimelockTest is Test {
    address internal ownerSafe = makeAddr("ownerSafe");
    address internal guardianSafe = makeAddr("guardianSafe");
    KarwanTimelock internal tl;

    function setUp() public {
        tl = new KarwanTimelock(48 hours, ownerSafe, guardianSafe);
    }

    function _schedule(bytes memory data, bytes32 salt) internal returns (bytes32 id) {
        id = tl.hashOperation(address(tl), 0, data, bytes32(0), salt);
        vm.prank(ownerSafe);
        tl.schedule(address(tl), 0, data, bytes32(0), salt, 48 hours);
    }

    function test_constructor_refuses_a_delay_below_the_floor() public {
        vm.expectRevert(KarwanTimelock.BelowFloor.selector);
        new KarwanTimelock(23 hours, ownerSafe, guardianSafe);
    }

    function test_constructor_refuses_missing_safes() public {
        vm.expectRevert(KarwanTimelock.Zero.selector);
        new KarwanTimelock(48 hours, address(0), guardianSafe);
        vm.expectRevert(KarwanTimelock.Zero.selector);
        new KarwanTimelock(48 hours, ownerSafe, address(0));
    }

    function test_delay_cannot_drop_below_the_floor_even_through_itself() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (1 hours));
        _schedule(data, bytes32("low"));
        vm.warp(block.timestamp + 48 hours);
        vm.prank(ownerSafe);
        vm.expectRevert(KarwanTimelock.BelowFloor.selector);
        tl.execute(address(tl), 0, data, bytes32(0), bytes32("low"));
    }

    function test_delay_can_move_down_to_the_floor() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (24 hours));
        _schedule(data, bytes32("floor"));
        vm.warp(block.timestamp + 48 hours);
        vm.prank(ownerSafe);
        tl.execute(address(tl), 0, data, bytes32(0), bytes32("floor"));
        assertEq(tl.getMinDelay(), 24 hours);
    }

    function test_nothing_executes_before_the_delay() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (72 hours));
        _schedule(data, bytes32("early"));
        vm.warp(block.timestamp + 47 hours);
        vm.prank(ownerSafe);
        vm.expectRevert();
        tl.execute(address(tl), 0, data, bytes32(0), bytes32("early"));
    }

    function test_guardian_can_cancel_a_queued_change() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (72 hours));
        bytes32 id = _schedule(data, bytes32("cancel"));
        vm.prank(guardianSafe);
        tl.cancel(id);
        assertFalse(tl.isOperation(id));
    }

    function test_guardian_cannot_queue_or_execute() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (72 hours));
        bytes32 proposer = tl.PROPOSER_ROLE();
        vm.prank(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guardianSafe, proposer)
        );
        tl.schedule(address(tl), 0, data, bytes32(0), bytes32("g"), 48 hours);
    }

    function test_guardian_cannot_cancel_a_protected_change() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (72 hours));
        bytes32 id = tl.hashOperation(address(tl), 0, data, bytes32(0), bytes32("p"));
        vm.prank(ownerSafe);
        tl.scheduleProtected(address(tl), 0, data, bytes32(0), bytes32("p"));
        vm.prank(guardianSafe);
        vm.expectRevert(KarwanTimelock.Protected.selector);
        tl.cancel(id);
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(ownerSafe);
        vm.expectRevert();
        tl.execute(address(tl), 0, data, bytes32(0), bytes32("p"));
        vm.warp(block.timestamp + 1);
        vm.prank(ownerSafe);
        tl.execute(address(tl), 0, data, bytes32(0), bytes32("p"));
        assertEq(tl.getMinDelay(), 72 hours);
    }

    function test_owner_can_cancel_its_own_protected_change() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (72 hours));
        bytes32 id = tl.hashOperation(address(tl), 0, data, bytes32(0), bytes32("p"));
        vm.prank(ownerSafe);
        tl.scheduleProtected(address(tl), 0, data, bytes32(0), bytes32("p"));
        vm.prank(ownerSafe);
        tl.cancel(id);
        assertFalse(tl.isOperation(id));
    }

    function test_only_the_owner_schedules_a_protected_change() public {
        bytes memory data = abi.encodeCall(TimelockController.updateDelay, (72 hours));
        bytes32 proposer = tl.PROPOSER_ROLE();
        vm.prank(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, guardianSafe, proposer)
        );
        tl.scheduleProtected(address(tl), 0, data, bytes32(0), bytes32("g"));
    }

    function test_no_outside_admin() public view {
        assertFalse(tl.hasRole(tl.DEFAULT_ADMIN_ROLE(), address(this)));
        assertFalse(tl.hasRole(tl.DEFAULT_ADMIN_ROLE(), ownerSafe));
        assertTrue(tl.hasRole(tl.DEFAULT_ADMIN_ROLE(), address(tl)));
    }
}
