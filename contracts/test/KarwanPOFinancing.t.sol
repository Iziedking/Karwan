// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanPOFinancing, IKarwanEscrow, IKarwanInvoiceRegistry} from "../src/KarwanPOFinancing.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC20 used as USDC stand-in. Six decimals to match.
contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Escrow mock. `paid` stays zero unless a test settles it, which keeps
///         the repayment pull on the path most of these tests exercise. Tests
///         that care about the escrow having already paid the assignee call
///         simulateSettlePaying(), which credits the assignee for real rather
///         than only moving the bookkeeping.
contract MockEscrow {
    MockUSDC public usdc;
    mapping(bytes32 => address) private _seller;

    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    mapping(bytes32 => Assignment) public assignmentOf;

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function seedDeal(bytes32 jobId, address, address seller) external {
        _seller[jobId] = seller;
    }

    function sellerOf(bytes32 jobId) external view returns (address) {
        return _seller[jobId];
    }

    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external {
        assignmentOf[jobId] = Assignment({assignee: assignee, amount: amount, paid: 0});
    }

    /// The escrow settles and pays the assignee ahead of the seller.
    function simulateSettlePaying(bytes32 jobId, uint128 amount) external {
        Assignment storage a = assignmentOf[jobId];
        a.paid += amount;
        usdc.mint(a.assignee, amount);
    }
}

/// @notice Vault mock. Tracks reserve/release/slash by the (consumer, id) key
///         like the real vault, pays the beneficiary on slash, and returns the
///         unslashed remainder to the owner's free stake.
contract MockVault {
    struct R {
        address owner;
        uint256 amount;
        address beneficiary;
        bool active;
    }

    mapping(bytes32 => R) public reservations;
    mapping(address => uint256) public freeStake;
    MockUSDC public immutable usdc;

    constructor(address _usdc) {
        usdc = MockUSDC(_usdc);
    }

    function setFreeStake(address who, uint256 amount) external {
        freeStake[who] = amount;
    }

    function freeStakeOf(address owner) external view returns (uint256) {
        return freeStake[owner];
    }

    function _key(address consumer, bytes32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    function reserve(bytes32 id, address owner, uint256 amount, address beneficiary) external {
        bytes32 k = _key(msg.sender, id);
        require(!reservations[k].active, "reserved");
        require(freeStake[owner] >= amount, "insufficient");
        freeStake[owner] -= amount;
        reservations[k] = R(owner, amount, beneficiary, true);
    }

    function release(bytes32 id) external {
        bytes32 k = _key(msg.sender, id);
        R storage r = reservations[k];
        if (!r.active) return;
        r.active = false;
        freeStake[r.owner] += r.amount;
    }

    /// Mirrors the real vault: clamp to the reservation, pay the beneficiary,
    /// return the remainder to the owner's free stake.
    function slashTo(bytes32 id, uint256 amount) external {
        bytes32 k = _key(msg.sender, id);
        R storage r = reservations[k];
        require(r.active, "not reserved");
        r.active = false;
        uint256 take = amount < r.amount ? amount : r.amount;
        if (take > 0) usdc.transfer(r.beneficiary, take);
        if (r.amount > take) freeStake[r.owner] += r.amount - take;
    }
}

/// @notice Registry mock — only isPoDAccepted() is needed.
contract MockRegistry {
    mapping(bytes32 => bool) public podAccepted;

    function setPoD(bytes32 invoiceId, bool v) external {
        podAccepted[invoiceId] = v;
    }

    function isPoDAccepted(bytes32 invoiceId) external view returns (bool) {
        return podAccepted[invoiceId];
    }
}

/// @title PO financing state machine
/// @notice The rail advances the seller directly at fund time and is repaid by
///         the escrow assignment. There is no custody step: the states are
///         None -> Outstanding -> Settled | Defaulted.
///
///         The previous three-step shape (fund into custody, releaseToSeller on
///         proof of delivery, then repay) is gone because the release condition
///         was unreachable on the ordinary settlement path, which stranded the
///         seller's advance. KarwanPOCustodyAttack.t.sol holds that history.
contract KarwanPOFinancingTest is Test {
    KarwanPOFinancing po;
    MockUSDC usdc;
    MockEscrow escrow;
    MockRegistry registry;
    MockVault vault;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");
    address rando = makeAddr("rando");

    bytes32 constant JOB = keccak256("job-1");

    uint128 constant PRINCIPAL = 4_000_000_000; // 4,000 USDC (6 decimals)
    uint128 constant REPAY = 4_200_000_000;     // 4,200 USDC (5% fee)
    uint64 constant REPAYMENT_WINDOW = 30 days;
    uint256 constant FINANCIER_START = 1_000_000_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new MockEscrow(usdc);
        registry = new MockRegistry();
        vault = new MockVault(address(usdc));
        po = new KarwanPOFinancing(address(usdc), address(registry), address(escrow), address(vault));

        escrow.seedDeal(JOB, buyer, seller);

        usdc.mint(financier, FINANCIER_START);
        vm.prank(financier);
        usdc.approve(address(po), type(uint256).max);
    }

    /* ============================ DEPLOYMENT ============================= */

    function test_Constructor_StoresImmutables() public view {
        assertEq(address(po.usdc()), address(usdc));
        assertEq(address(po.registry()), address(registry));
        assertEq(address(po.escrow()), address(escrow));
        assertEq(address(po.vault()), address(vault));
    }

    function test_Constructor_SetsOwnerToDeployer() public view {
        assertEq(po.owner(), address(this));
    }

    function test_Constructor_RevertsOnZeroUSDC() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(0), address(registry), address(escrow), address(vault));
    }

    function test_Constructor_RevertsOnZeroRegistry() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(usdc), address(0), address(escrow), address(vault));
    }

    function test_Constructor_RevertsOnZeroEscrow() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(usdc), address(registry), address(0), address(vault));
    }

    function test_Constructor_RevertsOnZeroVault() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(usdc), address(registry), address(escrow), address(0));
    }

    /* =============================== FUND ================================ */

    /// The advance lands in the seller's wallet in the funding transaction. The
    /// contract's own balance stays zero throughout, which is the structural
    /// reason nothing can be stranded.
    function test_Fund_PaysTheSellerDirectly() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);

        KarwanPOFinancing.POLine memory l = po.getLine(JOB);
        assertEq(uint256(l.state), 1, "Outstanding");
        assertEq(l.financier, financier);
        assertEq(l.seller, seller);
        assertEq(l.principalUsdc, PRINCIPAL);
        assertEq(l.repayUsdc, REPAY);
        assertEq(l.fundedAt, uint64(block.timestamp));
        assertEq(l.repaymentTimeoutAt, uint64(block.timestamp) + REPAYMENT_WINDOW);

        assertEq(usdc.balanceOf(seller), PRINCIPAL, "seller has the advance");
        assertEq(usdc.balanceOf(address(po)), 0, "contract custodies nothing");
        assertEq(usdc.balanceOf(financier), FINANCIER_START - PRINCIPAL);
    }

    function test_Fund_RegistersTheAssignment() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);

        (address assignee, uint128 amount, uint128 paid) = escrow.assignmentOf(JOB);
        assertEq(assignee, financier);
        assertEq(amount, REPAY);
        assertEq(paid, 0);
    }

    function test_Fund_RevertsOnZeroInvoiceId() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidInvoiceId.selector);
        po.fund(bytes32(0), PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
    }

    function test_Fund_RevertsOnZeroPrincipal() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidAmount.selector);
        po.fund(JOB, 0, REPAY, REPAYMENT_WINDOW, 0);
    }

    function test_Fund_RevertsWhenRepayNotAbovePrincipal() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidRepay.selector);
        po.fund(JOB, PRINCIPAL, PRINCIPAL, REPAYMENT_WINDOW, 0);
    }

    function test_Fund_RevertsOnZeroTimeout() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidTimeout.selector);
        po.fund(JOB, PRINCIPAL, REPAY, 0, 0);
    }

    /// The window has to outlast the buyer's own release timing, since
    /// repayment comes out of the settlement rather than the seller's wallet.
    function test_Fund_RevertsOnWindowBelowMinimum() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidTimeout.selector);
        po.fund(JOB, PRINCIPAL, REPAY, 7 days - 1, 0);
    }

    function test_Fund_RevertsOnOversizedTimeout() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidTimeout.selector);
        po.fund(JOB, PRINCIPAL, REPAY, 5 * 365 days + 1, 0);
    }

    /// Goods already delivered and accepted is factoring, not PO financing.
    function test_Fund_RevertsWhenPoDAlreadyAccepted() public {
        registry.setPoD(JOB, true);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.PoDAlreadyAccepted.selector);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
    }

    function test_Fund_RevertsWhenEscrowDealUnknown() public {
        bytes32 unknown = keccak256("nope");
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.MissingEscrowRecord.selector);
        po.fund(unknown, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
    }

    function test_Fund_RevertsOnDoubleFund() public {
        _openLine();
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.AlreadyFunded.selector);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
    }

    function test_Fund_RevertsWhenSellerFundsTheirOwnLine() public {
        usdc.mint(seller, PRINCIPAL);
        vm.startPrank(seller);
        usdc.approve(address(po), type(uint256).max);
        vm.expectRevert(KarwanPOFinancing.SelfFunding.selector);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
        vm.stopPrank();
    }

    /* =========================== CLAIM REPAYMENT ========================== */

    function test_ClaimRepayment_HappyPath_ByFinancier() public {
        _openLine();
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.prank(financier);
        po.claimRepayment(JOB);

        KarwanPOFinancing.POLine memory l = po.getLine(JOB);
        assertEq(uint256(l.state), 2, "Settled");
        assertEq(l.settledAt, uint64(block.timestamp));

        assertEq(usdc.balanceOf(financier), FINANCIER_START - PRINCIPAL + REPAY);
        assertEq(usdc.balanceOf(seller), PRINCIPAL);
    }

    function test_ClaimRepayment_HappyPath_BySeller() public {
        _openLine();
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.prank(seller);
        po.claimRepayment(JOB);

        assertEq(uint256(po.getLine(JOB).state), 2);
        assertEq(usdc.balanceOf(financier), FINANCIER_START - PRINCIPAL + REPAY);
    }

    /// The ordinary case in production: the escrow already paid the assignee,
    /// so closing out pulls nothing at all.
    function test_ClaimRepayment_PullsNothingWhenEscrowPaidInFull() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(usdc.balanceOf(seller), sellerBefore, "nothing pulled");
        assertEq(uint256(po.getLine(JOB).state), 2);
    }

    function test_ClaimRepayment_PullsOnlyTheShortfall() public {
        _openLine();
        uint128 covered = REPAY / 4;
        escrow.simulateSettlePaying(JOB, covered);

        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(sellerBefore - usdc.balanceOf(seller), REPAY - covered, "only the gap");
    }

    function test_ClaimRepayment_RevertsOnUnknownLine() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsForRando() public {
        _openLine();
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotParty.selector);
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsWhenSellerCannotCoverShortfall() public {
        _openLine();
        vm.prank(seller);
        usdc.approve(address(po), REPAY);
        // Seller holds only the advance, which is less than the repay amount.
        vm.prank(financier);
        vm.expectRevert();
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsWhenAllowanceMissing() public {
        _openLine();
        usdc.mint(seller, REPAY);
        vm.prank(financier);
        vm.expectRevert();
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsOnSecondClaim() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY);
        vm.prank(financier);
        po.claimRepayment(JOB);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.claimRepayment(JOB);
    }

    /* ============================ MARK DEFAULTED ========================== */

    function test_MarkDefaulted_HappyPath() public {
        _openLine();
        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);

        vm.prank(financier);
        po.markDefaulted(JOB);

        assertEq(uint256(po.getLine(JOB).state), 3, "Defaulted");
        // No collateral on this line, so nothing moves.
        assertEq(usdc.balanceOf(seller), PRINCIPAL);
        assertEq(usdc.balanceOf(financier), FINANCIER_START - PRINCIPAL);
    }

    function test_MarkDefaulted_RevertsWhileInRepaymentWindow() public {
        _openLine();
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.StillWithinWindow.selector);
        po.markDefaulted(JOB);
    }

    function test_MarkDefaulted_RevertsForNonFinancier() public {
        _openLine();
        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);

        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotFinancier.selector);
        po.markDefaulted(JOB);
    }

    function test_MarkDefaulted_RevertsOnUnknownLine() public {
        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.markDefaulted(JOB);
    }

    function test_MarkDefaulted_RevertsAfterSettled() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY);
        vm.prank(financier);
        po.claimRepayment(JOB);

        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.markDefaulted(JOB);
    }

    /// A financier who was already paid in full by the escrow cannot let the
    /// window lapse and collect the bond on top.
    function test_MarkDefaulted_RevertsWhenEscrowAlreadyPaidInFull() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY);
        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.NothingOutstanding.selector);
        po.markDefaulted(JOB);
    }

    /* ============================== EVENTS =============================== */

    function test_POFunded_Emits() public {
        uint64 expectedTimeout = uint64(block.timestamp) + REPAYMENT_WINDOW;
        vm.expectEmit(true, true, true, true, address(po));
        emit KarwanPOFinancing.POFunded(JOB, financier, seller, PRINCIPAL, REPAY, expectedTimeout);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
    }

    function test_PORepaid_Emits() public {
        _openLine();
        escrow.simulateSettlePaying(JOB, REPAY);

        vm.expectEmit(true, true, false, true, address(po));
        emit KarwanPOFinancing.PORepaid(JOB, financier, REPAY, financier);
        vm.prank(financier);
        po.claimRepayment(JOB);
    }

    /* ============================ FULL FLOW =============================== */

    /// End to end on the path production actually takes: advance out, escrow
    /// settles and pays the assignee, line closes with nothing pulled.
    function test_FullFlow_EscrowRepaysTheFinancier() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
        assertEq(usdc.balanceOf(seller), PRINCIPAL, "seller funded up front");
        assertEq(usdc.balanceOf(address(po)), 0);

        escrow.simulateSettlePaying(JOB, REPAY);

        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(uint256(po.getLine(JOB).state), 2);
        assertEq(usdc.balanceOf(financier), FINANCIER_START - PRINCIPAL + REPAY);
        assertEq(usdc.balanceOf(seller), PRINCIPAL, "seller keeps the advance");
    }

    /* ============================== OWNERSHIP ============================= */

    function test_Ownership_TwoStepTransfer() public {
        po.transferOwnership(rando);
        assertEq(po.owner(), address(this), "not transferred until accepted");
        assertEq(po.pendingOwner(), rando);

        vm.prank(rando);
        po.acceptOwnership();
        assertEq(po.owner(), rando);
        assertEq(po.pendingOwner(), address(0));
    }

    function test_Ownership_RevertsForNonOwner() public {
        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotOwner.selector);
        po.transferOwnership(rando);
    }

    function test_Ownership_AcceptRevertsForNonPending() public {
        po.transferOwnership(rando);
        vm.prank(seller);
        vm.expectRevert(KarwanPOFinancing.NotOwner.selector);
        po.acceptOwnership();
    }

    /* ============================ STAKE FLOOR ============================= */

    function test_StakeFloor_DefaultsToZero() public view {
        assertEq(po.minStakeBps(), 0);
        assertEq(po.stakeFloorFor(PRINCIPAL), 0);
    }

    function test_StakeFloor_OwnerCanSet() public {
        po.setMinStakeBps(1000); // 10%
        assertEq(po.minStakeBps(), 1000);
        assertEq(po.stakeFloorFor(PRINCIPAL), uint256(PRINCIPAL) / 10);
    }

    function test_StakeFloor_RevertsAboveCeiling() public {
        vm.expectRevert(KarwanPOFinancing.StakeFloorTooHigh.selector);
        po.setMinStakeBps(5001);
    }

    function test_StakeFloor_RevertsForNonOwner() public {
        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotOwner.selector);
        po.setMinStakeBps(100);
    }

    function test_StakeFloor_FundRevertsBelowFloor() public {
        po.setMinStakeBps(1000); // 10% of 4,000 = 400
        vault.setFreeStake(seller, 10_000_000_000);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.StakeBelowFloor.selector);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 399_000_000);
    }

    /// The quoted floor is exactly what fund() accepts. Rounding the quote down
    /// would hand callers a number that reverts.
    function test_StakeFloor_QuotedFloorIsAccepted() public {
        po.setMinStakeBps(3333);
        vault.setFreeStake(seller, 10_000_000_000);

        uint256 quoted = po.stakeFloorFor(PRINCIPAL);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, uint128(quoted));

        assertEq(po.getLine(JOB).requiredStakeUsdc, uint128(quoted));
    }

    /* ==================== factoring stake (vault) ======================== */

    uint128 constant STAKE = 1_000_000_000; // 1,000 USDC collateral

    function test_Stake_FundReservesSellerStake() public {
        vault.setFreeStake(seller, 2_000_000_000);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, STAKE);

        assertEq(vault.freeStakeOf(seller), 1_000_000_000, "stake reserved");
        assertEq(po.getLine(JOB).requiredStakeUsdc, STAKE);
    }

    function test_Stake_FundRevertsWhenSellerLacksStake() public {
        vault.setFreeStake(seller, 500_000_000);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InsufficientStake.selector);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, STAKE);
    }

    function test_Stake_SettleReleasesStake() public {
        vault.setFreeStake(seller, 2_000_000_000);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, STAKE);

        escrow.simulateSettlePaying(JOB, REPAY);
        vm.prank(financier);
        po.claimRepayment(JOB);

        assertEq(vault.freeStakeOf(seller), 2_000_000_000, "stake released on settle");
    }

    /// The shortfall exceeds the bond here, so the whole bond is taken.
    function test_Stake_DefaultSlashesToFinancier() public {
        vault.setFreeStake(seller, 2_000_000_000);
        usdc.mint(address(vault), STAKE);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, STAKE);

        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);
        uint256 finBefore = usdc.balanceOf(financier);
        vm.prank(financier);
        po.markDefaulted(JOB);

        assertEq(uint256(po.getLine(JOB).state), 3, "defaulted");
        assertEq(usdc.balanceOf(financier) - finBefore, STAKE, "stake slashed to financier");
    }

    /// A deal that settled most of the way costs the seller only the gap. The
    /// rest of the bond returns to their free stake.
    function test_Stake_DefaultSlashesOnlyTheShortfall() public {
        vault.setFreeStake(seller, 2_000_000_000);
        usdc.mint(address(vault), STAKE);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, STAKE);

        // Escrow covered all but 200 USDC of the repay amount.
        uint128 gap = 200_000_000;
        escrow.simulateSettlePaying(JOB, REPAY - gap);

        vm.warp(block.timestamp + REPAYMENT_WINDOW + 1);
        uint256 finBefore = usdc.balanceOf(financier);
        vm.prank(financier);
        po.markDefaulted(JOB);

        assertEq(usdc.balanceOf(financier) - finBefore, gap, "only the gap slashed");
        assertEq(
            vault.freeStakeOf(seller),
            2_000_000_000 - STAKE + (STAKE - gap),
            "remainder of the bond returned"
        );
    }

    /* ============================ INTERNALS =============================== */

    function _openLine() internal {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, REPAYMENT_WINDOW, 0);
    }
}
