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

/// @notice Escrow mock — only getEscrow() is needed.
contract MockEscrow {
    mapping(bytes32 => IKarwanEscrow.EscrowAccount) private _accounts;

    function seedDeal(bytes32 jobId, address buyer, address seller) external {
        IKarwanEscrow.EscrowAccount storage a = _accounts[jobId];
        a.buyer = buyer;
        a.seller = seller;
    }

    function getEscrow(bytes32 jobId) external view returns (IKarwanEscrow.EscrowAccount memory) {
        return _accounts[jobId];
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

contract KarwanPOFinancingTest is Test {
    KarwanPOFinancing po;
    MockUSDC usdc;
    MockEscrow escrow;
    MockRegistry registry;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");
    address rando = makeAddr("rando");

    bytes32 constant JOB = keccak256("job-1");

    uint128 constant PRINCIPAL = 4_000_000_000; // 4,000 USDC (6 decimals)
    uint128 constant REPAY = 4_200_000_000;     // 4,200 USDC (5% fee)
    uint64 constant RELEASE_WINDOW = 30 days;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new MockEscrow();
        registry = new MockRegistry();
        po = new KarwanPOFinancing(address(usdc), address(registry), address(escrow));

        escrow.seedDeal(JOB, buyer, seller);

        // Fund financier and approve PO contract.
        usdc.mint(financier, 1_000_000_000_000); // plenty
        vm.prank(financier);
        usdc.approve(address(po), type(uint256).max);

        // Seller will approve repay amount per test as appropriate.
    }

    /* ============================ DEPLOYMENT ============================= */

    function test_Constructor_StoresImmutables() public view {
        assertEq(address(po.usdc()), address(usdc));
        assertEq(address(po.registry()), address(registry));
        assertEq(address(po.escrow()), address(escrow));
    }

    function test_Constructor_RevertsOnZeroUSDC() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(0), address(registry), address(escrow));
    }

    function test_Constructor_RevertsOnZeroRegistry() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(usdc), address(0), address(escrow));
    }

    function test_Constructor_RevertsOnZeroEscrow() public {
        vm.expectRevert(KarwanPOFinancing.ZeroAddress.selector);
        new KarwanPOFinancing(address(usdc), address(registry), address(0));
    }

    /* =============================== FUND ================================ */

    function test_Fund_HappyPath() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        KarwanPOFinancing.POLine memory l = po.getLine(JOB);
        assertEq(uint256(l.state), 1);                        // Funded
        assertEq(l.financier, financier);
        assertEq(l.seller, seller);
        assertEq(l.principalUsdc, PRINCIPAL);
        assertEq(l.repayUsdc, REPAY);
        assertEq(l.releaseTimeoutAt, uint64(block.timestamp) + RELEASE_WINDOW);

        // USDC moved into contract custody.
        assertEq(usdc.balanceOf(address(po)), PRINCIPAL);
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000 - PRINCIPAL);
    }

    function test_Fund_RevertsOnZeroInvoiceId() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidInvoiceId.selector);
        po.fund(bytes32(0), PRINCIPAL, REPAY, RELEASE_WINDOW);
    }

    function test_Fund_RevertsOnZeroPrincipal() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidAmount.selector);
        po.fund(JOB, 0, REPAY, RELEASE_WINDOW);
    }

    function test_Fund_RevertsWhenRepayNotAbovePrincipal() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidRepay.selector);
        po.fund(JOB, PRINCIPAL, PRINCIPAL, RELEASE_WINDOW);
    }

    function test_Fund_RevertsOnZeroTimeout() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidTimeout.selector);
        po.fund(JOB, PRINCIPAL, REPAY, 0);
    }

    function test_Fund_RevertsOnOversizedTimeout() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidTimeout.selector);
        po.fund(JOB, PRINCIPAL, REPAY, 5 * 365 days + 1);
    }

    function test_Fund_RevertsWhenPoDAlreadyAccepted() public {
        registry.setPoD(JOB, true);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.PoDAlreadyAccepted.selector);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
    }

    function test_Fund_RevertsWhenEscrowDealUnknown() public {
        bytes32 unknown = keccak256("nope");
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.MissingEscrowRecord.selector);
        po.fund(unknown, PRINCIPAL, REPAY, RELEASE_WINDOW);
    }

    function test_Fund_RevertsOnDoubleFund() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.AlreadyFunded.selector);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
    }

    /* =========================== RELEASE TO SELLER ======================== */

    function test_ReleaseToSeller_HappyPath() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        registry.setPoD(JOB, true);

        // Any address can trigger release; principal still goes to the
        // seller stored at fund time.
        vm.prank(rando);
        po.releaseToSeller(JOB);

        KarwanPOFinancing.POLine memory l = po.getLine(JOB);
        assertEq(uint256(l.state), 2); // Released
        assertEq(l.releasedAt, uint64(block.timestamp));
        assertEq(l.repaymentTimeoutAt, uint64(block.timestamp) + 7 days);

        // USDC moved to seller.
        assertEq(usdc.balanceOf(seller), PRINCIPAL);
        assertEq(usdc.balanceOf(address(po)), 0);
    }

    function test_ReleaseToSeller_RevertsWithoutPoD() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        vm.expectRevert(KarwanPOFinancing.PoDNotAccepted.selector);
        po.releaseToSeller(JOB);
    }

    function test_ReleaseToSeller_RevertsOnUnfundedLine() public {
        registry.setPoD(JOB, true);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.releaseToSeller(JOB);
    }

    function test_ReleaseToSeller_RevertsAfterSettled() public {
        // Run through fund + release + claim, then try release again.
        _fundAndRelease();
        _approveAndClaim();

        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.releaseToSeller(JOB);
    }

    /* =========================== CLAIM REPAYMENT ========================== */

    function test_ClaimRepayment_HappyPath_ByFinancier() public {
        _fundAndRelease();
        // Seller funds their wallet (from settlement) and approves PO contract.
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.prank(financier);
        po.claimRepayment(JOB);

        KarwanPOFinancing.POLine memory l = po.getLine(JOB);
        assertEq(uint256(l.state), 3); // Settled
        assertEq(l.settledAt, uint64(block.timestamp));

        // Financier received the repay. Seller had PRINCIPAL from release +
        // REPAY from settlement-mint; after the pull, PRINCIPAL remains.
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000 - PRINCIPAL + REPAY);
        assertEq(usdc.balanceOf(seller), PRINCIPAL);
    }

    function test_ClaimRepayment_HappyPath_BySeller() public {
        _fundAndRelease();
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.prank(seller);
        po.claimRepayment(JOB);

        assertEq(uint256(po.getLine(JOB).state), 3);
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000 - PRINCIPAL + REPAY);
    }

    function test_ClaimRepayment_RevertsBeforeRelease() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsForRando() public {
        _fundAndRelease();
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotParty.selector);
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsWhenSellerHasNoBalance() public {
        _fundAndRelease();
        vm.prank(seller);
        usdc.approve(address(po), REPAY);
        // Seller never received settlement; balance is 0.
        vm.prank(financier);
        vm.expectRevert(); // mock USDC reverts on insufficient balance
        po.claimRepayment(JOB);
    }

    function test_ClaimRepayment_RevertsWhenAllowanceMissing() public {
        _fundAndRelease();
        usdc.mint(seller, REPAY);
        // Seller funded but never approved.
        vm.prank(financier);
        vm.expectRevert(); // mock reverts on allowance
        po.claimRepayment(JOB);
    }

    /* ========================== RECLAIM PRINCIPAL ========================= */

    function test_ReclaimPrincipal_HappyPath() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        // Travel past release timeout.
        vm.warp(block.timestamp + RELEASE_WINDOW + 1);

        vm.prank(financier);
        po.reclaimPrincipal(JOB);

        assertEq(uint256(po.getLine(JOB).state), 4); // Reclaimed
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000);
        assertEq(usdc.balanceOf(address(po)), 0);
    }

    function test_ReclaimPrincipal_RevertsWhileInWindow() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.StillWithinWindow.selector);
        po.reclaimPrincipal(JOB);
    }

    function test_ReclaimPrincipal_RevertsForNonFinancier() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        vm.warp(block.timestamp + RELEASE_WINDOW + 1);

        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotFinancier.selector);
        po.reclaimPrincipal(JOB);
    }

    function test_ReclaimPrincipal_RevertsWhenPoDLanded() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        registry.setPoD(JOB, true);
        vm.warp(block.timestamp + RELEASE_WINDOW + 1);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.PoDAlreadyAccepted.selector);
        po.reclaimPrincipal(JOB);
    }

    function test_ReclaimPrincipal_RevertsWhenAlreadyReleased() public {
        _fundAndRelease();
        vm.warp(block.timestamp + RELEASE_WINDOW + 1);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.reclaimPrincipal(JOB);
    }

    /* ============================ MARK DEFAULTED ========================== */

    function test_MarkDefaulted_HappyPath() public {
        _fundAndRelease();
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(financier);
        po.markDefaulted(JOB);

        assertEq(uint256(po.getLine(JOB).state), 5); // Defaulted
        // No funds moved.
        assertEq(usdc.balanceOf(seller), PRINCIPAL);
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000 - PRINCIPAL);
    }

    function test_MarkDefaulted_RevertsWhileInRepaymentWindow() public {
        _fundAndRelease();
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.StillWithinWindow.selector);
        po.markDefaulted(JOB);
    }

    function test_MarkDefaulted_RevertsForNonFinancier() public {
        _fundAndRelease();
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(rando);
        vm.expectRevert(KarwanPOFinancing.NotFinancier.selector);
        po.markDefaulted(JOB);
    }

    function test_MarkDefaulted_RevertsBeforeRelease() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);

        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.markDefaulted(JOB);
    }

    function test_MarkDefaulted_RevertsAfterSettled() public {
        _fundAndRelease();
        _approveAndClaim();

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.InvalidState.selector);
        po.markDefaulted(JOB);
    }

    /* ============================== EVENTS =============================== */

    function test_POFunded_Emits() public {
        uint64 expectedTimeout = uint64(block.timestamp) + RELEASE_WINDOW;
        vm.expectEmit(true, true, true, true, address(po));
        emit KarwanPOFinancing.POFunded(JOB, financier, seller, PRINCIPAL, REPAY, expectedTimeout);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
    }

    function test_POReleased_Emits() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        registry.setPoD(JOB, true);

        vm.expectEmit(true, true, false, true, address(po));
        emit KarwanPOFinancing.POReleased(JOB, seller, PRINCIPAL);
        po.releaseToSeller(JOB);
    }

    function test_PORepaid_Emits() public {
        _fundAndRelease();
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        vm.expectEmit(true, true, false, true, address(po));
        emit KarwanPOFinancing.PORepaid(JOB, financier, REPAY, financier);
        vm.prank(financier);
        po.claimRepayment(JOB);
    }

    /* ============================ FULL FLOW =============================== */

    function test_FullHappyPathFlow() public {
        // 1. Financier funds.
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        assertEq(usdc.balanceOf(address(po)), PRINCIPAL);

        // 2. PoD anchors on registry (simulating buyer/attester action).
        registry.setPoD(JOB, true);

        // 3. Anyone releases principal to seller.
        po.releaseToSeller(JOB);
        assertEq(usdc.balanceOf(seller), PRINCIPAL);

        // 4. Seller receives settlement off-chain (simulated by mint).
        usdc.mint(seller, REPAY);
        // 5. Seller approves PO contract for repay.
        vm.prank(seller);
        usdc.approve(address(po), REPAY);

        // 6. Anyone (here financier) claims repayment.
        vm.prank(financier);
        po.claimRepayment(JOB);

        // Final state checks.
        assertEq(uint256(po.getLine(JOB).state), 3); // Settled
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000 - PRINCIPAL + REPAY);
        // Seller kept (PRINCIPAL + REPAY) - REPAY = PRINCIPAL from settlement.
        assertEq(usdc.balanceOf(seller), PRINCIPAL);
    }

    function test_PoDTimeoutFlow() public {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        // PoD never lands. Financier reclaims after timeout.
        vm.warp(block.timestamp + RELEASE_WINDOW + 1);
        vm.prank(financier);
        po.reclaimPrincipal(JOB);
        assertEq(usdc.balanceOf(financier), 1_000_000_000_000);
    }

    function test_DefaultFlow() public {
        _fundAndRelease();
        // Seller never repays. Financier writes off after window.
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(financier);
        po.markDefaulted(JOB);
        assertEq(uint256(po.getLine(JOB).state), 5);
    }

    /* ============================ INTERNALS =============================== */

    function _fundAndRelease() internal {
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, RELEASE_WINDOW);
        registry.setPoD(JOB, true);
        po.releaseToSeller(JOB);
    }

    function _approveAndClaim() internal {
        usdc.mint(seller, REPAY);
        vm.prank(seller);
        usdc.approve(address(po), REPAY);
        vm.prank(financier);
        po.claimRepayment(JOB);
    }
}
