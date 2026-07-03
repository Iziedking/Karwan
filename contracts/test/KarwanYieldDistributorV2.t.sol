// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanYieldDistributor} from "../src/KarwanYieldDistributor.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

/// @title KarwanYieldDistributor two-step ownership (audit I-2)
contract KarwanYieldDistributorV2Test is Test {
    KarwanYieldDistributor dist;
    MockUSDC usdc;
    address operator = makeAddr("operator");
    address eve = makeAddr("eve");

    function setUp() public {
        usdc = new MockUSDC();
        dist = new KarwanYieldDistributor(address(usdc), operator);
    }

    function test_TwoStepOwnership() public {
        dist.transferOwnership(eve);
        assertEq(dist.owner(), address(this), "owner unchanged until accept");
        assertEq(dist.pendingOwner(), eve);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(KarwanYieldDistributor.NotPendingOwner.selector);
        dist.acceptOwnership();

        vm.prank(eve);
        dist.acceptOwnership();
        assertEq(dist.owner(), eve, "owner rotated");
        assertEq(dist.pendingOwner(), address(0));
    }

    function test_OnlyOwnerCanStartTransfer() public {
        vm.prank(eve);
        vm.expectRevert(KarwanYieldDistributor.NotOwner.selector);
        dist.transferOwnership(eve);
    }
}
