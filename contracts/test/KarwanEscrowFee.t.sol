// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 a) external { balanceOf[to] += a; totalSupply += a; }
    function approve(address s, uint256 a) external override returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external override returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external override returns (bool) {
        if (allowance[f][msg.sender] < type(uint256).max) allowance[f][msg.sender] -= a;
        balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

/// @title Adjustable base fee
/// @notice feeBps is owner-settable in v2 (2% default at deploy), bounded, and
///         SNAPSHOTTED per deal at fund so a later change never touches deals
///         already funded.
contract KarwanEscrowFeeTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address eve = makeAddr("eve");
    uint256 constant U = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        // Deploy at the new 2% base fee.
        escrow = new KarwanEscrow(address(usdc), 200, treasury, address(vault), address(rep), 10000);
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));

        usdc.mint(buyer, 100_000 * U);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _one() internal pure returns (uint8[] memory p) {
        p = new uint8[](1);
        p[0] = 100;
    }

    function test_Fee_DefaultsToTwoPercent() public view {
        assertEq(escrow.feeBps(), 200, "2% base fee");
    }

    function test_Fee_PullsTwoPercent() public {
        vm.prank(buyer);
        escrow.fundEscrow(keccak256("j1"), seller, 1000 * U, _one(), 0);
        // 2% of 1000 = 20 fee; buyer half = 10; funded = 1010.
        assertEq(usdc.balanceOf(address(escrow)), 1010 * U, "funded = deal + buyer half-fee");
        assertEq(escrow.getEscrow(keccak256("j1")).feeTotal, 20 * U, "2% fee snapshot");
    }

    function test_Fee_OwnerAdjustsForFutureDeals() public {
        // Fund one deal at 2%.
        vm.prank(buyer);
        escrow.fundEscrow(keccak256("j1"), seller, 1000 * U, _one(), 0);

        // Owner raises the base fee to 3% as the ecosystem grows.
        escrow.setFeeBps(300);
        assertEq(escrow.feeBps(), 300);

        // The earlier deal keeps its 2% snapshot.
        assertEq(escrow.getEscrow(keccak256("j1")).feeTotal, 20 * U, "old deal unchanged");

        // A new deal takes 3%.
        vm.prank(buyer);
        escrow.fundEscrow(keccak256("j2"), seller, 1000 * U, _one(), 0);
        assertEq(escrow.getEscrow(keccak256("j2")).feeTotal, 30 * U, "new deal at 3%");
    }

    function test_Fee_BoundedAndOwnerOnly() public {
        vm.prank(eve);
        vm.expectRevert(KarwanEscrow.NotOwner.selector);
        escrow.setFeeBps(300);

        // Above the 10% ceiling reverts.
        vm.expectRevert(KarwanEscrow.FeeTooHigh.selector);
        escrow.setFeeBps(1001);

        // Exactly the ceiling is allowed.
        escrow.setFeeBps(1000);
        assertEq(escrow.feeBps(), 1000);
    }

    function test_Fee_ConstructorRejectsOverCeiling() public {
        vm.expectRevert(KarwanEscrow.FeeTooHigh.selector);
        new KarwanEscrow(address(usdc), 1001, treasury, address(vault), address(rep), 10000);
    }
}
