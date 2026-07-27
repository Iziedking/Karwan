// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanPOFinancing} from "../src/KarwanPOFinancing.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burnFrom(address from, uint256 amount) external {
        balanceOf[from] -= amount;
        totalSupply -= amount;
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

/// Escrow stand-in carrying the assignment surface the real one now exposes.
contract MockEscrow {
    mapping(bytes32 => address) public sellers;
    mapping(address => bool) public authorizedAssigners;

    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    mapping(bytes32 => Assignment) public assignmentOf;

    error NotAssigner();
    error AlreadyAssigned();

    function seedDeal(bytes32 jobId, address seller) external {
        sellers[jobId] = seller;
    }

    function setAssigner(address who, bool ok) external {
        authorizedAssigners[who] = ok;
    }

    function sellerOf(bytes32 jobId) external view returns (address) {
        return sellers[jobId];
    }

    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external {
        if (!authorizedAssigners[msg.sender]) revert NotAssigner();
        if (assignmentOf[jobId].assignee != address(0)) revert AlreadyAssigned();
        assignmentOf[jobId] = Assignment({assignee: assignee, amount: amount, paid: 0});
    }

    /// Stands in for the escrow settling and paying the assignee first.
    function simulateSettlePaying(bytes32 jobId, uint128 amount, MockUSDC usdc) external {
        Assignment storage a = assignmentOf[jobId];
        a.paid += amount;
        usdc.mint(a.assignee, amount);
    }
}

contract MockRegistry {
    mapping(bytes32 => bool) public podAccepted;

    function setPoD(bytes32 invoiceId, bool ok) external {
        podAccepted[invoiceId] = ok;
    }

    function isPoDAccepted(bytes32 invoiceId) external view returns (bool) {
        return podAccepted[invoiceId];
    }
}

contract MockVault {
    mapping(address => uint256) public free;

    function setFree(address who, uint256 amount) external {
        free[who] = amount;
    }

    function reserve(bytes32, address, uint256, address) external {}
    function release(bytes32) external {}
    function slashTo(bytes32, uint256) external {}

    function freeStakeOf(address owner) external view returns (uint256) {
        return free[owner];
    }
}

/// @title PO financing repaid by the escrow, not by pulling from the seller
/// @notice Exploit-first spec for TRADE_FINANCE_V2_DESIGN.md §2.
///
///         The old rail released principal to the seller, then pulled repayUsdc
///         back out of the seller's wallet after the escrow settled. A seller
///         who spent the settlement first kept the advance and the pull simply
///         reverted, which is the hole `test_Exploit_` records.
///
///         With assignment the escrow pays the financier directly at
///         settlement, and claimRepayment only has to collect a shortfall.
contract KarwanPOAssignmentTest is Test {
    KarwanPOFinancing po;
    MockUSDC usdc;
    MockEscrow escrow;
    MockRegistry registry;
    MockVault vault;

    address seller = makeAddr("seller");
    address financier = makeAddr("financier");

    bytes32 constant JOB = keccak256("po-assignment");
    uint128 constant PRINCIPAL = 4_000_000_000;
    uint128 constant REPAY = 4_200_000_000;
    uint64 constant WINDOW = 30 days;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new MockEscrow();
        registry = new MockRegistry();
        vault = new MockVault();
        po = new KarwanPOFinancing(address(usdc), address(registry), address(escrow), address(vault));

        escrow.seedDeal(JOB, seller);
        escrow.setAssigner(address(po), true);

        usdc.mint(financier, 1_000_000_000_000);
        vm.prank(financier);
        usdc.approve(address(po), type(uint256).max);
        vm.prank(seller);
        usdc.approve(address(po), type(uint256).max);
    }

    /// Opening the line IS the disbursement now. There is no second step, and
    /// no PoD to anchor: the helper this replaced set PoD true on every path,
    /// which is exactly how the custody defect stayed hidden behind a green
    /// suite. See KarwanPOCustodyAttack.t.sol.
    function _openLine() internal {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, WINDOW, 0);
    }

    /// Funding now sells the receivable in the same transaction that commits
    /// the cash, so there is never a window where the advance is out and the
    /// redirect is not yet in place.
    function test_FundRegistersTheAssignment() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, WINDOW, 0);

        (address assignee, uint128 amount, uint128 paid) = escrow.assignmentOf(JOB);
        assertEq(assignee, financier, "financier is the assignee");
        assertEq(amount, REPAY, "assigned for the repay amount");
        assertEq(paid, 0, "nothing paid yet");
    }

    /// An escrow that will not accept an assignment means the line would fall
    /// back to the pull rail. Fail loudly at funding rather than quietly
    /// opening an unprotected line.
    function test_FundRevertsWhenEscrowHasNotAuthorisedThisContract() public {
        escrow.setAssigner(address(po), false);
        vm.prank(financier);
        vm.expectRevert();
        po.fund(JOB, PRINCIPAL, REPAY, WINDOW, 0);
    }

    /// The hole, recorded. The seller receives the advance, spends everything,
    /// and the pull has nothing to take.
    function test_Exploit_PullFailsWhenSellerSpentTheSettlement() public {
        _openLine();
        usdc.burnFrom(seller, usdc.balanceOf(seller));

        vm.prank(financier);
        vm.expectRevert();
        po.claimRepayment(JOB);
    }

    /// §6.1 With the escrow having paid the assignee, an empty seller wallet is
    /// irrelevant: nothing is pulled and the line settles.
    function test_SettlesWithoutPullingWhenEscrowAlreadyPaid() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY, usdc);
        usdc.burnFrom(seller, usdc.balanceOf(seller));

        uint256 before = usdc.balanceOf(financier);
        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(usdc.balanceOf(financier), before, "no pull, already paid by the escrow");
    }

    /// §6.9 A deal too small to cover the repay leaves a shortfall. The escrow
    /// paid what it could; the remainder is still the seller's obligation.
    function test_PullsOnlyTheShortfall() public {
        _openLine();
        uint128 paidByEscrow = REPAY / 4;
        escrow.simulateSettlePaying(JOB, paidByEscrow, usdc);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(sellerBefore - usdc.balanceOf(seller), REPAY - paidByEscrow, "only the gap was pulled");
    }

    /// §7 A line is repaid at most once.
    function test_SecondClaimReverts() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY, usdc);
        vm.prank(financier);
        po.claimRepayment(JOB);

        vm.prank(financier);
        vm.expectRevert();
        po.claimRepayment(JOB);
    }
}
