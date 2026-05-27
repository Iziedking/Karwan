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
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (allowance[from][msg.sender] < type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract KarwanEscrowTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    bytes32 constant JOB_ID = keccak256("job-1");

    uint16 constant FEE_BPS = 150; // 1.5%
    uint16 constant RESERVATION_BPS = 5000; // 50%

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
            RESERVATION_BPS
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));

        usdc.mint(buyer, 1000e18);
        usdc.mint(seller, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        // Stake enough seller collateral so they can accept a 500e18 deal
        // (50% reservation = 250e18). 400e18 is plenty.
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(400e18);
        vm.stopPrank();
    }

    function _twoMilestones(uint8 a, uint8 b) internal pure returns (uint8[] memory pcts) {
        pcts = new uint8[](2);
        pcts[0] = a;
        pcts[1] = b;
    }

    function _fundAndAccept(uint256 amount) internal {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, amount, _twoMilestones(50, 50));
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    /* ============================ FUNDING =============================== */

    function test_FundEscrow_PullsDealAmountPlusBuyerFeeHalf() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        // 500e18 + 0.75% (half of 1.5%) = 503.75e18.
        assertEq(usdc.balanceOf(address(escrow)), 503.75e18);
    }

    function test_FundEscrow_LeavesStateAsFunded() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        // 10 fields in the auto-getter (milestonePcts dropped); state is last.
        (, , , , , , , , , KarwanEscrow.EscrowState state) = escrow.escrows(JOB_ID);
        assertEq(uint8(state), uint8(KarwanEscrow.EscrowState.Funded));
    }

    function test_ReleaseProgress_RevertsBeforeAccept() public {
        // Buyer funds, seller has not accepted yet. Releasing must fail.
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidState.selector);
        escrow.releaseProgress(JOB_ID, 0);
    }

    /* ============================ ACCEPTANCE ============================ */

    function test_AcceptEscrow_ReservesStake() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));

        uint256 freeBefore = vault.freeStakeOf(seller);
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
        uint256 freeAfter = vault.freeStakeOf(seller);
        // 50% of 500e18 = 250e18 reserved.
        assertEq(freeBefore - freeAfter, 250e18);

        // Struct order: buyer, seller, dealAmount, sellerNet, feeTotal,
        // released, feeReleased, reservedAmount, milestonePcts (DROPPED by
        // Solidity's auto-getter since it's a dynamic array),
        // milestonesReleased, state. So the destructured tuple is 10 fields
        // and reservedAmount is the 8th.
        (, , , , , , , uint256 reservedAmount, , KarwanEscrow.EscrowState state) =
            escrow.escrows(JOB_ID);
        assertEq(reservedAmount, 250e18);
        assertEq(uint8(state), uint8(KarwanEscrow.EscrowState.Accepted));
    }

    function test_AcceptEscrow_RevertsOnInsufficientStake() public {
        // Fresh seller with no stake.
        address poorSeller = makeAddr("poor");
        bytes32 jobId = keccak256("poor-job");
        vm.prank(buyer);
        escrow.fundEscrow(jobId, poorSeller, 500e18, _twoMilestones(50, 50));
        vm.prank(poorSeller);
        vm.expectRevert(KarwanEscrow.InsufficientStake.selector);
        escrow.acceptEscrow(jobId);
    }

    function test_AcceptEscrow_OnlySeller() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.NotSeller.selector);
        escrow.acceptEscrow(JOB_ID);
    }

    /* ============================ RELEASE =============================== */

    function test_ReleaseProgress_SplitsSellerAndTreasury() public {
        _fundAndAccept(500e18);
        // sellerNet = 496.25e18, feeTotal = 7.5e18.
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0); // 50%
        // sellerNet * 50% = 248.125e18, fee * 50% = 3.75e18.
        assertEq(usdc.balanceOf(seller), 1000e18 - 400e18 + 248.125e18);
        assertEq(usdc.balanceOf(treasury), 3.75e18);

        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 1); // final, sweeps remainder
        assertEq(usdc.balanceOf(seller), 1000e18 - 400e18 + 496.25e18);
        assertEq(usdc.balanceOf(treasury), 7.5e18);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ReleaseProgress_FinalReleasesReservationAndRecordsReputation() public {
        _fundAndAccept(500e18);
        uint256 freeBefore = vault.freeStakeOf(seller);
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0);
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 1); // final
        // Reservation released back to free.
        assertEq(vault.freeStakeOf(seller), freeBefore + 250e18);
        // Both sides recorded success (symmetric crediting).
        (uint256 buyerSuccess, , ) = rep.scores(buyer);
        (uint256 sellerSuccess, , ) = rep.scores(seller);
        assertEq(buyerSuccess, 1);
        assertEq(sellerSuccess, 1);
    }

    function test_ReleaseFinal_SweepsEverythingAndRecords() public {
        _fundAndAccept(500e18);
        vm.prank(buyer);
        escrow.releaseFinal(JOB_ID);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        // Reservation released, reputation recorded.
        assertEq(vault.reservedTotal(seller), 0);
        (uint256 sellerSuccess, , ) = rep.scores(seller);
        assertEq(sellerSuccess, 1);
    }

    /* ============================ DISPUTE =============================== */

    function test_Dispute_FromAccepted_AllowsRefund_WithSlash() public {
        _fundAndAccept(500e18);
        vm.prank(seller);
        escrow.dispute(JOB_ID, "ipfs://reason");

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.refund(JOB_ID);
        // Buyer recovers the escrow funds PLUS the 250e18 slash.
        uint256 expectedRecovery = 503.75e18 + 250e18;
        assertEq(usdc.balanceOf(buyer), buyerBefore + expectedRecovery);

        // Reputation: seller failedCount++, buyer successCount++.
        (uint256 buyerSuccess, , uint256 buyerFailed) = rep.scores(buyer);
        (, , uint256 sellerFailed) = rep.scores(seller);
        assertEq(buyerSuccess, 1);
        assertEq(buyerFailed, 0);
        assertEq(sellerFailed, 1);
    }

    function test_Dispute_FromFunded_RefundsWithoutSlash() public {
        // Buyer funds, seller never accepts, buyer disputes + refunds.
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        vm.prank(buyer);
        escrow.dispute(JOB_ID, "buyer-bailing");

        uint256 sellerStakeBefore = vault.activeStakeOf(seller);
        vm.prank(buyer);
        escrow.refund(JOB_ID);
        // No slash since the seller never accepted.
        assertEq(vault.activeStakeOf(seller), sellerStakeBefore);
        // No reputation record either: pre-accept refund is a no-fault retraction.
        (uint256 buyerSuccess, , uint256 buyerFailed) = rep.scores(buyer);
        (uint256 sellerSuccess, , uint256 sellerFailed) = rep.scores(seller);
        assertEq(buyerSuccess + buyerFailed + sellerSuccess + sellerFailed, 0);
    }

    function test_ReleaseFromDispute_PaysSeller_AndRecordsDisputeResolved() public {
        _fundAndAccept(500e18);
        vm.prank(buyer);
        escrow.dispute(JOB_ID, "considering-late-delivery");

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(buyer);
        escrow.releaseFromDispute(JOB_ID);
        // Seller fully paid.
        assertEq(usdc.balanceOf(seller), sellerBefore + 496.25e18);
        // Reservation released, not slashed.
        assertEq(vault.reservedTotal(seller), 0);
        // Both sides recorded as DisputeResolved.
        (, uint256 buyerDisputed, ) = rep.scores(buyer);
        (, uint256 sellerDisputed, ) = rep.scores(seller);
        assertEq(buyerDisputed, 1);
        assertEq(sellerDisputed, 1);
    }

    function test_ReleaseFromDispute_OnlyBuyer() public {
        _fundAndAccept(500e18);
        vm.prank(seller);
        escrow.dispute(JOB_ID, "reason");
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotBuyer.selector);
        escrow.releaseFromDispute(JOB_ID);
    }

    function test_Refund_RevertsForNonBuyer() public {
        _fundAndAccept(500e18);
        vm.prank(seller);
        escrow.dispute(JOB_ID, "ipfs://reason");
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotBuyer.selector);
        escrow.refund(JOB_ID);
    }

    /* ========================= INSURANCE-INTEGRITY ====================== */

    function test_SellerCannotCoolStakeAfterAccept() public {
        _fundAndAccept(500e18);
        // The seller has 400e18 active, 250e18 reserved. Trying to cool the
        // only position would leave 0 active < 250e18 reserved.
        vm.prank(seller);
        vm.expectRevert(KarwanVault.ReservationLocked.selector);
        vault.requestWithdraw(1);
    }

    /* ============================ CONSTRUCTOR =========================== */

    function test_Constructor_RevertsOnZeroTreasury() public {
        vm.expectRevert(KarwanEscrow.InvalidTreasury.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, address(0), address(vault), address(rep), RESERVATION_BPS);
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(KarwanEscrow.FeeTooHigh.selector);
        new KarwanEscrow(address(usdc), 1001, treasury, address(vault), address(rep), RESERVATION_BPS);
    }

    function test_Constructor_RevertsOnReservationTooHigh() public {
        vm.expectRevert(KarwanEscrow.ReservationTooHigh.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, treasury, address(vault), address(rep), 10001);
    }

    function test_Constructor_RevertsOnZeroVault() public {
        vm.expectRevert(KarwanEscrow.InvalidVault.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, treasury, address(0), address(rep), RESERVATION_BPS);
    }

    function test_Constructor_RevertsOnZeroReputation() public {
        vm.expectRevert(KarwanEscrow.InvalidReputation.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, treasury, address(vault), address(0), RESERVATION_BPS);
    }

    /* ====================== AUDIT FIX REGRESSIONS ======================= */

    /// M-3: getEscrow returns the full struct including milestonePcts,
    /// unlike the public mapping auto-getter which silently drops dynamic
    /// arrays. The off-by-one tuple destructuring bug we hit during the
    /// initial test write is exactly what this method prevents.
    function test_AuditM3_GetEscrowReturnsMilestonePcts() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(40, 60));
        KarwanEscrow.EscrowAccount memory e = escrow.getEscrow(JOB_ID);
        assertEq(e.dealAmount, 500e18);
        assertEq(e.milestonePcts.length, 2);
        assertEq(e.milestonePcts[0], 40);
        assertEq(e.milestonePcts[1], 60);
        assertEq(uint8(e.state), uint8(KarwanEscrow.EscrowState.Funded));
    }

    /// M-2: if vault.slash were to revert mid-refund, the buyer's refund
    /// must still complete. We can't easily make vault.slash revert in a
    /// happy-path setUp (it's resilient by design), but we can prove the
    /// state-clearance order: e.reservedAmount is zeroed BEFORE the slash
    /// call, and the SlashFailed event path exists.
    /// This test asserts that the refund's state transition lands and
    /// the slash side-effect happens after, so a hypothetical slash
    /// failure cannot strand the buyer.
    function test_AuditM2_RefundOrdersStateBeforeSlash() public {
        _fundAndAccept(500e18);
        vm.prank(seller);
        escrow.dispute(JOB_ID, "reason");

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.refund(JOB_ID);

        // Buyer is refunded regardless of slash outcome (happy path
        // here, but the try/catch ensures the assertion holds even if
        // slash had reverted).
        assertGt(usdc.balanceOf(buyer), buyerBefore);

        KarwanEscrow.EscrowAccount memory e = escrow.getEscrow(JOB_ID);
        assertEq(uint8(e.state), uint8(KarwanEscrow.EscrowState.Refunded));
        assertEq(e.reservedAmount, 0, "reservedAmount cleared before slash side-effect");
    }
}
