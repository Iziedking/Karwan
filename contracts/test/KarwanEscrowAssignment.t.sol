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

/// @title Receivable assignment: the financier is paid by the escrow, not by the seller
/// @notice Exploit-first spec for TRADE_FINANCE_V2_DESIGN.md §2 and §6.
///
///         Today the escrow pays the seller and the financier is repaid by a
///         pull from the seller's wallet afterwards. A seller who empties that
///         wallet between settlement and the watcher tick keeps the advance.
///         `test_Exploit_...` below is that hole, written against the current
///         contract so it passes until assignment lands.
///
///         The remaining tests are the fix: the escrow itself pays the assignee
///         out of its own balance at settlement, so there is no second transfer
///         that can fail and no window in which the seller holds the money.
contract KarwanEscrowAssignmentTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");
    address treasury = makeAddr("treasury");
    address assigner = makeAddr("poFinancing");
    bytes32 constant JOB = keccak256("assignment-job");

    uint256 constant DEAL = 1000e18;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc),
            150,
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

        usdc.mint(buyer, 10_000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _single() internal pure returns (uint8[] memory p) {
        p = new uint8[](1);
        p[0] = 100;
    }

    function _halves() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50;
        p[1] = 50;
    }

    function _fundAndAccept(uint8[] memory pcts) internal {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB,
            seller,
            DEAL,
            pcts,
            0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 5 days, reclaimGrace: 0})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB);
    }

    /// The hole, stated as a test. With no assignment the entire seller net
    /// lands in the seller's wallet and the financier holds nothing but a
    /// promise. Delete this test when assignment becomes mandatory.
    function test_Exploit_SellerReceivesEverythingAndFinancierHoldsNothing() public {
        _fundAndAccept(_single());
        vm.prank(seller);
        escrow.markDelivered(JOB, bytes32(0));
        vm.prank(buyer);
        escrow.releaseFinal(JOB);

        assertGt(usdc.balanceOf(seller), 0, "seller took the whole net");
        assertEq(usdc.balanceOf(financier), 0, "financier paid nothing by the escrow");
    }

    // ---------------------------------------------------------------- fix

    function _assign(uint128 amount) internal {
        escrow.setAssigner(assigner, true);
        vm.prank(assigner);
        escrow.assignPayout(JOB, financier, amount);
    }

    /// §6.1 The seller can drain their wallet; it changes nothing, because the
    /// escrow never sends them the assigned portion in the first place.
    function test_AssigneePaidFirstOnFinalRelease() public {
        _fundAndAccept(_single());
        _assign(400e18);

        vm.prank(seller);
        escrow.markDelivered(JOB, bytes32(0));
        vm.prank(buyer);
        escrow.releaseFinal(JOB);

        assertEq(usdc.balanceOf(financier), 400e18, "assignee paid in full");
        uint256 sellerNet = DEAL - (DEAL * 150) / 10000 / 2;
        assertEq(usdc.balanceOf(seller), sellerNet - 400e18, "seller took the residual");
    }

    /// §6.9 A repay amount above what the deal will pay must cap, never revert.
    /// Stranding settlement to protect a financier would be worse than a haircut.
    function test_AssignmentAboveSellerNetCapsWithoutReverting() public {
        _fundAndAccept(_single());
        _assign(uint128(DEAL * 2));

        vm.prank(seller);
        escrow.markDelivered(JOB, bytes32(0));
        vm.prank(buyer);
        escrow.releaseFinal(JOB);

        uint256 sellerNet = DEAL - (DEAL * 150) / 10000 / 2;
        assertEq(usdc.balanceOf(financier), sellerNet, "assignee capped at what was due");
        assertEq(usdc.balanceOf(seller), 0, "nothing left for the seller");
    }

    /// §6.7 Milestones: the assignee is senior and is paid out first across
    /// releases until satisfied. Pro-rata is not computable when the number of
    /// future releases is unknown at assignment time.
    function test_AssigneeIsSeniorAcrossMilestones() public {
        _fundAndAccept(_halves());
        _assign(300e18);

        vm.prank(buyer);
        escrow.releaseProgress(JOB, 0);

        uint256 firstNet = ((DEAL * 50) / 100) - ((DEAL * 150) / 10000 / 2) / 2;
        assertEq(usdc.balanceOf(financier), firstNet < 300e18 ? firstNet : 300e18, "assignee first");

        vm.prank(buyer);
        escrow.releaseProgress(JOB, 1);

        assertEq(usdc.balanceOf(financier), 300e18, "assignee satisfied, no more");
        assertGt(usdc.balanceOf(seller), 0, "seller paid once the assignee is whole");
    }

    /// §6.8 One receivable, one financier. A second assignment is a double sale.
    function test_SecondAssignmentReverts() public {
        _fundAndAccept(_single());
        _assign(200e18);

        vm.prank(assigner);
        vm.expectRevert();
        escrow.assignPayout(JOB, makeAddr("financier2"), 100e18);
    }

    /// An unauthorised caller must not be able to attach itself to a receivable.
    function test_UnauthorisedAssignerReverts() public {
        _fundAndAccept(_single());
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        escrow.assignPayout(JOB, financier, 100e18);
    }

    /// §6.6 A refund returns the buyer's money to the buyer. The assignment must
    /// not divert any of it: the financier's recourse there is the seller's
    /// collateral, not the buyer's principal.
    function test_RefundPathIgnoresAssignment() public {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB,
            seller,
            DEAL,
            _single(),
            0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 5 days, reclaimGrace: 0})
        );
        _assign(400e18);

        vm.prank(buyer);
        escrow.dispute(JOB, "");
        vm.prank(buyer);
        escrow.refund(JOB);

        assertEq(usdc.balanceOf(financier), 0, "assignee paid nothing from a refund");
        assertEq(usdc.balanceOf(buyer), 10_000e18, "buyer made whole");
    }

    /// §7 Conservation: every path still pays out exactly what was escrowed.
    function testFuzz_ConservationHoldsUnderAssignment(uint128 assigned) public {
        assigned = uint128(bound(assigned, 1, DEAL * 2));
        _fundAndAccept(_single());
        _assign(assigned);

        vm.prank(seller);
        escrow.markDelivered(JOB, bytes32(0));
        vm.prank(buyer);
        escrow.releaseFinal(JOB);

        assertEq(
            usdc.balanceOf(financier) + usdc.balanceOf(seller) + usdc.balanceOf(treasury),
            DEAL + (DEAL * 150) / 10000 / 2,
            "payouts sum to the escrowed principal"
        );
        assertEq(usdc.balanceOf(address(escrow)), 0, "nothing stranded in the escrow");
    }
}
