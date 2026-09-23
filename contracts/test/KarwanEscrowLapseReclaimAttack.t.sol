// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LapseMockUSDC is IERC20 {
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

/// @notice Internal audit R1, finding ESC-01. A seller delivers on time, close
///         to the deadline. The buyer disputes late in the review window, the
///         arbiter does not rule within the dispute timeout, the buyer lapses
///         the dispute and reclaims the whole deal. lapseDispute wipes the
///         pending delivery, and the lapse credit does not carry the clock past
///         "now", so markDelivered is already refused and reclaim is open.
contract KarwanEscrowLapseReclaimAttackTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    LapseMockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    bytes32 constant JOB_ID = keccak256("lapse-reclaim-job");

    uint64 constant REVIEW = 5 days;
    uint64 constant GRACE = 1 days;
    uint64 constant DISPUTE_TIMEOUT = 14 days;
    uint256 constant DEAL = 500e6;

    uint64 deadline;

    function setUp() public {
        usdc = new LapseMockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc), 150, treasury, address(vault), address(rep), 10000,
            KarwanEscrow.YieldConfig({backstop: address(0), operator: address(0), coverageFloor: 0, maxYieldBps: 8000}),
            KarwanEscrow.TimingConfig({
                minReviewWindow: 60,
                maxReviewWindow: 180 days,
                disputeTimeoutSecs: DISPUTE_TIMEOUT,
                attestedWindowSecs: 1 days,
                maxDeadlineHorizon: 730 days
            })
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);

        usdc.mint(buyer, 10_000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        deadline = uint64(block.timestamp) + 10 days;
        uint8[] memory pcts = new uint8[](1);
        pcts[0] = 100;
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID, seller, DEAL, pcts, 0,
            KarwanEscrow.Timing({deliveryDeadline: deadline, reviewWindow: REVIEW, reclaimGrace: GRACE})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    function _deliverOnTimeThenLapse() internal {
        vm.warp(deadline - 1 hours);
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, keccak256("proof"));

        vm.warp(deadline - 1 hours + REVIEW - 1 minutes);
        vm.prank(buyer);
        escrow.dispute(JOB_ID, "late-dispute");

        vm.warp(block.timestamp + DISPUTE_TIMEOUT);
        vm.prank(buyer);
        escrow.lapseDispute(JOB_ID);
    }

    /// An on-time seller must not lose the delivered milestone to a buyer who
    /// only disputed and waited. After the lapse the buyer cannot reclaim.
    function test_ESC01_BuyerCannotReclaimAfterLapsingOnTimeDelivery() public {
        _deliverOnTimeThenLapse();

        vm.prank(buyer);
        vm.expectRevert();
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
    }

    /// After the lapse the on-time seller keeps a live path to payment: the
    /// delivery is still pending review, or can be marked again.
    function test_ESC01_SellerStillHasPathToPaymentAfterLapse() public {
        _deliverOnTimeThenLapse();

        KarwanEscrow.EscrowAccount memory e = escrow.getEscrow(JOB_ID);
        if (e.deliveredAt == 0) {
            vm.prank(seller);
            escrow.markDelivered(JOB_ID, keccak256("proof-again"));
            e = escrow.getEscrow(JOB_ID);
        }
        vm.warp(e.claimDeadline);
        uint256 before = usdc.balanceOf(seller);
        vm.prank(seller);
        escrow.claimMilestone(JOB_ID, 0);
        assertGt(usdc.balanceOf(seller), before, "on-time seller is paid");
    }
}
