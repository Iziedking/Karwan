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

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (allowance[from][msg.sender] < type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @title F-3: a late seller must not be able to revoke the buyer's reclaim
/// @notice reclaimAfterDeadline is the buyer's trustless exit when a seller
///         never delivers. It requires `deliveredAt == 0`. markDelivered had
///         no deadline check and is re-callable, so a seller who blew the
///         deadline could set deliveredAt and strip that exit.
///
///         The dispute route does not save the buyer either: lapseDispute
///         clears deliveredAt but also pushes deliveryDeadline forward by the
///         frozen duration, so the seller can simply re-mark and the buyer
///         never reaches a state where reclaim is callable.
contract KarwanEscrowF3ReclaimAttackTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    bytes32 constant JOB_ID = keccak256("f3-job");

    uint16 constant FEE_BPS = 150;
    uint64 constant GRACE = 1 days;
    uint64 baseDeadline;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc),
            FEE_BPS,
            treasury,
            address(vault),
            address(rep),
            10000,
            KarwanEscrow.YieldConfig({backstop: address(0), operator: address(0), coverageFloor: 0, maxYieldBps: 8000}),
            KarwanEscrow.TimingConfig({
                minReviewWindow: 60,
                maxReviewWindow: 180 days,
                disputeTimeoutSecs: 14 days,
                attestedWindowSecs: 1 days,
                maxDeadlineHorizon: 730 days
            })
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);

        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        baseDeadline = uint64(block.timestamp) + 10 days;
    }

    function _pcts() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50;
        p[1] = 50;
    }

    function _fundAndAccept() internal {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID,
            seller,
            500e18,
            _pcts(),
            0,
            KarwanEscrow.Timing({deliveryDeadline: baseDeadline, reviewWindow: 0, reclaimGrace: GRACE})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    /// The core exploit: seller blows the deadline entirely, then marks
    /// delivered with a junk proof once the buyer's reclaim has already
    /// vested. The buyer's exit must survive it.
    function test_F3_LateMarkDeliveredCannotRevokeVestedReclaim() public {
        _fundAndAccept();

        // Deadline and grace both blow past with nothing delivered. The
        // buyer's reclaim right has vested at this point.
        vm.warp(uint256(baseDeadline) + GRACE + 1);

        // Seller front-runs the reclaim with a junk proof hash.
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.DeadlinePassed.selector);
        escrow.markDelivered(JOB_ID, bytes32(0));

        // The buyer's trustless exit still works.
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
        assertGt(usdc.balanceOf(buyer), before, "buyer reclaimed");
        assertEq(
            uint8(escrow.getEscrow(JOB_ID).state),
            uint8(KarwanEscrow.EscrowState.Refunded),
            "escrow refunded"
        );
    }

    /// The grace window is the seller's genuine last chance, so a mark inside
    /// it must still be allowed. Only a mark after reclaim has vested is refused.
    function test_F3_MarkDeliveredStillAllowedInsideGrace() public {
        _fundAndAccept();
        vm.warp(uint256(baseDeadline) + 1); // past deadline, inside grace

        vm.prank(seller);
        escrow.markDelivered(JOB_ID, keccak256("real-work"));
        assertGt(escrow.getEscrow(JOB_ID).deliveredAt, 0, "late-but-in-grace delivery lands");

        // And the buyer can no longer reclaim, because delivery is pending
        // review. That is the intended trade, not the bug.
        vm.warp(uint256(baseDeadline) + GRACE + 1);
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.DeliveryPending.selector);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
    }

    /// The loop: mark inside grace, buyer disputes, dispute lapses (clearing
    /// deliveredAt but pushing the deadline out by the frozen duration), seller
    /// re-marks. Without a fix this repeats forever and the buyer never reaches
    /// a block where reclaim is callable.
    function test_F3_DisputeLapseLoopCannotStallReclaimForever() public {
        _fundAndAccept();

        // Seller marks inside grace to arm the loop.
        vm.warp(uint256(baseDeadline) + 1);
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, keccak256("stall"));

        // Buyer must dispute, else the seller claims after the review window.
        vm.prank(buyer);
        escrow.dispute(JOB_ID, "not-delivered");

        // Arbiter never rules. After the timeout either party lapses it.
        vm.warp(block.timestamp + 14 days + 1);
        vm.prank(buyer);
        escrow.lapseDispute(JOB_ID);

        // The seller tries to re-arm. With the deadline pushed forward by the
        // frozen duration this used to succeed, resetting the whole cycle.
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.DeadlinePassed.selector);
        escrow.markDelivered(JOB_ID, keccak256("stall-again"));

        // The buyer's exit is reachable.
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
        assertEq(
            uint8(escrow.getEscrow(JOB_ID).state),
            uint8(KarwanEscrow.EscrowState.Refunded),
            "buyer escaped the loop"
        );
    }

    /// A deal with no delivery deadline has no reclaim path at all, so the
    /// deadline guard must not accidentally block an open-ended deal.
    function test_F3_NoDeadlineDealsUnaffected() public {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID,
            seller,
            500e18,
            _pcts(),
            0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 0, reclaimGrace: 0})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);

        vm.warp(block.timestamp + 400 days);
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, keccak256("open-ended"));
        assertGt(escrow.getEscrow(JOB_ID).deliveredAt, 0, "open-ended deal still deliverable");
    }
}
