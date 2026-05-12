// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow, IERC20} from "../src/KarwanEscrow.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        override
        returns (bool)
    {
        if (allowance[from][msg.sender] < type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract KarwanEscrowTest is Test {
    KarwanEscrow escrow;
    MockUSDC usdc;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    bytes32 constant JOB_ID = keccak256("job-1");

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new KarwanEscrow(address(usdc));
        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_FundEscrow_Works() public {
        uint8[] memory pcts = new uint8[](2);
        pcts[0] = 50;
        pcts[1] = 50;
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, pcts);
        assertEq(usdc.balanceOf(address(escrow)), 500e18);
    }

    function test_ReleaseProgress_PartialThenFinal() public {
        uint8[] memory pcts = new uint8[](2);
        pcts[0] = 40;
        pcts[1] = 60;
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, pcts);

        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0);
        assertEq(usdc.balanceOf(seller), 200e18);

        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 1);
        assertEq(usdc.balanceOf(seller), 500e18);
    }

    function test_FundEscrow_RevertsOnInvalidMilestones() public {
        uint8[] memory pcts = new uint8[](2);
        pcts[0] = 30;
        pcts[1] = 50;
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidMilestones.selector);
        escrow.fundEscrow(JOB_ID, seller, 500e18, pcts);
    }
}
