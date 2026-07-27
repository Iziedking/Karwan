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

/// @dev Escrow stand-in that actually custodies the buyer's money and pays out
///      through a faithful port of KarwanEscrow._paySellerSide (src line 612):
///      the assignee is senior, capped at what is owed rather than reverting,
///      and the two transfers always sum to the amount settled. Modelling the
///      real cash movement is the point here. A mock that minted to the
///      assignee would hide the fact that the financier is paid OUT OF THE
///      SELLER'S PROCEEDS, which is the whole defect.
contract MockEscrow {
    MockUSDC public usdc;
    mapping(bytes32 => address) public sellers;
    mapping(bytes32 => uint256) public deposits;
    mapping(address => bool) public authorizedAssigners;

    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    mapping(bytes32 => Assignment) public assignmentOf;

    error NotAssigner();
    error AlreadyAssigned();

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function setAssigner(address who, bool ok) external {
        authorizedAssigners[who] = ok;
    }

    /// The buyer funds the deal. Real money now sits in escrow custody.
    function fundDeal(bytes32 jobId, address seller, uint256 amount) external {
        sellers[jobId] = seller;
        deposits[jobId] += amount;
        usdc.transferFrom(msg.sender, address(this), amount);
    }

    function sellerOf(bytes32 jobId) external view returns (address) {
        return sellers[jobId];
    }

    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external {
        if (!authorizedAssigners[msg.sender]) revert NotAssigner();
        if (assignmentOf[jobId].assignee != address(0)) revert AlreadyAssigned();
        assignmentOf[jobId] = Assignment({assignee: assignee, amount: amount, paid: 0});
    }

    /// The ordinary settlement path. Note what it does NOT do: anchor proof of
    /// delivery on the registry. No milestone release or final release ever
    /// does, which is precisely why the custody unlock is unreachable.
    function settle(bytes32 jobId) external {
        uint256 amount = deposits[jobId];
        deposits[jobId] = 0;

        Assignment storage a = assignmentOf[jobId];
        uint256 cut;
        if (a.assignee != address(0) && a.paid < a.amount) {
            uint256 owed = uint256(a.amount) - uint256(a.paid);
            cut = amount < owed ? amount : owed;
            a.paid += uint128(cut);
            usdc.transfer(a.assignee, cut);
        }
        if (amount > cut) {
            usdc.transfer(sellers[jobId], amount - cut);
        }
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

    /// Records what the contract asked to be slashed, so a test can assert the
    /// shortfall was recovered rather than the whole bond.
    mapping(bytes32 => uint256) public slashedAmount;

    function reserve(bytes32, address, uint256, address) external {}
    function release(bytes32) external {}

    function slashTo(bytes32 id, uint256 amount) external {
        slashedAmount[id] = amount;
    }

    function freeStakeOf(address owner) external view returns (uint256) {
        return free[owner];
    }
}

/// @title PO financing pays the seller atomically with the assignment
/// @notice Regression record for the funds-losing defect found 2026-07-27.
///
///         THE DEFECT, as it stood. KarwanPOFinancing.fund() did two things
///         that were never re-linked:
///
///           1. escrow.assignPayout(...) redirected the settlement to the
///              financier immediately, unconditionally and irrevocably.
///           2. the principal went into the contract's own custody, released to
///              the seller only by releaseToSeller(), which required
///              registry.isPoDAccepted().
///
///         The ordinary milestone path never anchors PoD. So the financier was
///         paid out of the seller's settlement while the seller's advance sat
///         locked in custody. The seller delivered and received nothing, and
///         after the release window the financier reclaimed the principal too,
///         ending a full repay amount ahead with nothing at risk.
///
///         THIS WAS THE DEFAULT OUTCOME, NOT AN EDGE CASE. Every test in
///         KarwanPOAssignment.t.sol routed through a helper that set PoD true,
///         which is why the suite was green while the rail lost money. That is
///         the reason these tests drive settlement WITHOUT anchoring PoD.
///
///         THE FIX. Custody is gone. fund() moves the advance from the
///         financier straight to the seller in the same transaction as the
///         assignment, so no state exists where the redirect is live and the
///         advance is unpaid. releaseToSeller and reclaimPrincipal no longer
///         exist; there is nothing to strand and nothing to reclaim.
///
///         Figures mirror the live incident on deal 0x71524c98...4080:
///         financier advanced 90, repay 100, deal value 100.
contract KarwanPOCustodyAttackTest is Test {
    KarwanPOFinancing po;
    MockUSDC usdc;
    MockEscrow escrow;
    MockRegistry registry;
    MockVault vault;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");

    bytes32 constant JOB = keccak256("po-custody-attack");
    uint128 constant PRINCIPAL = 90_000_000;
    uint128 constant REPAY = 100_000_000;
    uint256 constant DEAL = 100_000_000;
    uint64 constant WINDOW = 30 days;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new MockEscrow(usdc);
        registry = new MockRegistry();
        vault = new MockVault();
        po = new KarwanPOFinancing(address(usdc), address(registry), address(escrow), address(vault));

        escrow.setAssigner(address(po), true);

        usdc.mint(buyer, DEAL);
        usdc.mint(financier, PRINCIPAL);

        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(financier);
        usdc.approve(address(po), type(uint256).max);
        vm.prank(seller);
        usdc.approve(address(po), type(uint256).max);

        // The buyer funds the deal, then the financier opens the PO line.
        vm.prank(buyer);
        escrow.fundDeal(JOB, seller, DEAL);
    }

    function _openLine() internal {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, WINDOW, 0);
    }

    /// The advance is in the seller's hands the moment the line opens, with no
    /// unlock condition standing between them and it. This is the assertion the
    /// old design could not make.
    function test_Closed_SellerHoldsTheAdvanceImmediately() public {
        _openLine();

        assertEq(usdc.balanceOf(seller), PRINCIPAL, "seller has working capital at once");
        assertEq(usdc.balanceOf(address(po)), 0, "the contract custodies nothing");
    }

    /// The defect, driven exactly as before: settle the ordinary way, never
    /// anchoring PoD. The seller keeps the advance and the financier is repaid
    /// out of the settlement. Both sides end on the agreed spread.
    function test_Closed_OrdinarySettlementLeavesBothSidesWhole() public {
        _openLine();

        // No PoD anchored, because nothing on this path ever anchors one.
        escrow.settle(JOB);

        assertEq(usdc.balanceOf(seller), PRINCIPAL, "seller keeps the advance");
        assertEq(usdc.balanceOf(address(po)), 0, "nothing stranded");
        assertEq(usdc.balanceOf(financier), REPAY, "financier repaid by the escrow");

        // The seller gave up REPAY of settlement for a PRINCIPAL advance, so
        // the spread is the financier's return and nothing else moved.
        assertEq(uint256(REPAY) - uint256(PRINCIPAL), 10_000_000, "spread is the only cost");
    }

    /// PoD is no longer load-bearing for the seller getting paid. Anchoring it
    /// changes nothing, which is the point: the outcome no longer depends on a
    /// step the ordinary path never performs.
    function test_Closed_OutcomeIsIdenticalWithPoDAnchored() public {
        _openLine();
        registry.setPoD(JOB, true);
        escrow.settle(JOB);

        assertEq(usdc.balanceOf(seller), PRINCIPAL, "same as the un-anchored path");
        assertEq(usdc.balanceOf(financier), REPAY, "same as the un-anchored path");
        assertEq(usdc.balanceOf(address(po)), 0, "still no custody");
    }

    /// The contract never holds USDC at any point in a line's life, so there is
    /// no balance for an unlock bug to strand in the first place.
    function test_Closed_ContractHoldsNoBalanceAcrossTheWholeLifecycle() public {
        assertEq(usdc.balanceOf(address(po)), 0, "before funding");
        _openLine();
        assertEq(usdc.balanceOf(address(po)), 0, "after funding");
        escrow.settle(JOB);
        assertEq(usdc.balanceOf(address(po)), 0, "after settlement");
        vm.prank(financier);
        po.claimRepayment(JOB);
        assertEq(usdc.balanceOf(address(po)), 0, "after close-out");
    }

    /// The successor to the old double-dip. reclaimPrincipal is gone, so the
    /// remaining way to take a second bite was to let the window lapse and
    /// slash the bond after the escrow had already paid in full. Refused.
    function test_Closed_CannotDefaultOnceEscrowHasPaidInFull() public {
        _openLine();
        escrow.settle(JOB);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.NothingOutstanding.selector);
        po.markDefaulted(JOB);

        assertEq(usdc.balanceOf(financier), REPAY, "financier capped at the repay amount");
    }

    /// A line that settles cleanly closes out with nothing pulled from the
    /// seller, because the escrow already paid the assignee.
    function test_Closed_ClaimPullsNothingWhenEscrowPaidInFull() public {
        _openLine();
        escrow.settle(JOB);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(usdc.balanceOf(seller), sellerBefore, "nothing pulled from the seller");
        assertEq(usdc.balanceOf(financier), REPAY, "financier whole");
    }

    /// A deal that settles short is a real default, but only for the gap. The
    /// seller loses collateral covering what the escrow failed to cover, and
    /// the remainder of the bond goes back to their free stake.
    function test_Closed_DefaultSlashesOnlyTheShortfall() public {
        bytes32 job2 = keccak256("po-partial-settlement");
        uint256 settledShort = 30_000_000;
        uint128 stake = 100_000_000;

        usdc.mint(buyer, settledShort);
        vm.prank(buyer);
        escrow.fundDeal(job2, seller, settledShort);

        vault.setFree(seller, stake);
        vm.prank(financier);
        po.fund(job2, PRINCIPAL, REPAY, WINDOW, stake);

        // The escrow can only pay the assignee what the deal actually held.
        escrow.settle(job2);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(financier);
        po.markDefaulted(job2);

        assertEq(
            vault.slashedAmount(job2),
            uint256(REPAY) - settledShort,
            "slashed exactly the amount the escrow left uncovered"
        );
        assertLt(vault.slashedAmount(job2), stake, "the rest of the bond is not taken");
    }

    /// A seller cannot finance their own receivable: it would assign their
    /// settlement to themselves and post their own collateral for the
    /// privilege, corrupting the financing reputation signal.
    function test_Closed_SellerCannotFundTheirOwnLine() public {
        usdc.mint(seller, PRINCIPAL);
        vm.startPrank(seller);
        usdc.approve(address(po), type(uint256).max);
        vm.expectRevert(KarwanPOFinancing.SelfFunding.selector);
        po.fund(JOB, PRINCIPAL, REPAY, WINDOW, 0);
        vm.stopPrank();
    }
}
