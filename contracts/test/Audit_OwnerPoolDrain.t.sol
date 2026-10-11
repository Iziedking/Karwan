// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanDealEscrow} from "../src/KarwanDealEscrow.sol";
import {DealTerms, DealState} from "../src/KarwanDealTypes.sol";
import {KarwanStakeVault} from "../src/KarwanStakeVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BlockUSDC} from "./KarwanDealEscrow.t.sol";

/// A pool that takes deposits and never gives them back: what an owner-chosen
/// pool address can be.
contract SinkPool {
    IERC20 immutable usdc;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function deposit(uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256) external pure {
        revert("gone");
    }
}

/// Audit finding C-01: the escrow owner can point the escrow at any pool after
/// deals are funded and let anyone park their principal there. The beta
/// deploys with no pool, but setPool stays open to the owner forever. The safe
/// behaviour asserted here: a deal accepted while the escrow had no pool pays
/// its seller in full whatever the owner does afterwards.
contract AuditOwnerPoolDrainTest is Test {
    BlockUSDC usdc;
    KarwanDealEscrow escrow;
    KarwanStakeVault vault;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address reviewSafe = makeAddr("review");
    address seniorSafe = makeAddr("senior");
    address anyone = makeAddr("anyone");

    function setUp() public {
        usdc = new BlockUSDC();
        vault = new KarwanStakeVault(address(usdc), address(this));
        escrow = new KarwanDealEscrow(
            address(usdc),
            address(vault),
            address(this),
            KarwanDealEscrow.Bounds({
                maxReservationBps: 10_000,
                minReview: 1 hours,
                maxReview: 180 days,
                maxHorizon: 730 days,
                disputeTimeout: 14 days,
                appealWindow: 3 days,
                autoRulingSla: 5 days
            })
        );
        vault.setConsumer(address(escrow), true);
        escrow.setRoles(treasury, address(0), reviewSafe, seniorSafe);
        escrow.setFeeBps(150);
        escrow.setCaps(1_000e6, 10_000e6, 5_000e6);
        assertEq(address(escrow.pool()), address(0), "the beta has no pool");
        usdc.mint(buyer, 10_000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _open() internal returns (bytes32 id) {
        DealTerms memory t;
        t.seller = seller;
        t.amount = 1_000e6;
        t.pcts[0] = 100;
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 1 hours;
        t.maxExtensions = 1;
        t.extensionSecs = 1 hours;
        t.silentLongstop = 9 days;
        t.agreementHash = keccak256("agreement");
        vm.prank(buyer);
        id = escrow.fund(keccak256("deal-1"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
    }

    function test_C01_OwnerCannotRouteFundedPrincipalToAPoolSetLater() public {
        bytes32 id = _open();
        uint256 balanceBefore = usdc.balanceOf(address(escrow));
        assertEq(balanceBefore, 1_007.5e6, "deal principal plus the buyer fee share sits in the escrow");

        // The owner (a 2-of-3 Safe on mainnet, no timelock in the beta) points the
        // escrow at a pool of its choosing and widens the yield policy.
        SinkPool sink = new SinkPool(address(usdc));
        escrow.setPool(address(sink));
        escrow.setYieldPolicy(0, 0);

        // Anyone parks. The deal was accepted before any pool existed.
        vm.prank(anyone);
        escrow.parkIdle();

        assertEq(usdc.balanceOf(address(escrow)), balanceBefore, "principal left the escrow for an owner-chosen pool");

        vm.prank(seller);
        escrow.markDelivered(id, keccak256("proof"));
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), 992.5e6, "the seller received the full net");
        assertEq(escrow.owed(seller), 0, "nothing was merely credited");
    }
}
