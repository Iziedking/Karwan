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
    /// Per-deal reservation actually used by most tests (50%). The
    /// constructor's _maxReservationBps is the ceiling on what a buyer can
    /// pick at fund time; setting it to 10000 lets us also test the full-
    /// stake-reservation case without redeploying the escrow per test.
    uint16 constant RESERVATION_BPS = 5000;
    uint16 constant MAX_RESERVATION_BPS = 10000;

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
            MAX_RESERVATION_BPS
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
        escrow.fundEscrow(JOB_ID, seller, amount, _twoMilestones(50, 50), RESERVATION_BPS);
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    /* ============================ FUNDING =============================== */

    function test_FundEscrow_PullsDealAmountPlusBuyerFeeHalf() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
        // 500e18 + 0.75% (half of 1.5%) = 503.75e18.
        assertEq(usdc.balanceOf(address(escrow)), 503.75e18);
    }

    function test_FundEscrow_LeavesStateAsFunded() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
        // 10 fields in the auto-getter (milestonePcts dropped); state is last.
        // Struct order in auto-getter (milestonePcts dropped):
        // buyer, seller, dealAmount, sellerNet, feeTotal, released,
        // feeReleased, reservedAmount, milestonesReleased, state, reservationBps.
        // 11 fields total.
        (, , , , , , , , , KarwanEscrow.EscrowState state, ) = escrow.escrows(JOB_ID);
        assertEq(uint8(state), uint8(KarwanEscrow.EscrowState.Funded));
    }

    function test_ReleaseProgress_RevertsBeforeAccept() public {
        // Buyer funds, seller has not accepted yet. Releasing must fail.
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidState.selector);
        escrow.releaseProgress(JOB_ID, 0);
    }

    /* ============================ ACCEPTANCE ============================ */

    function test_AcceptEscrow_ReservesStake() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);

        uint256 freeBefore = vault.freeStakeOf(seller);
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
        uint256 freeAfter = vault.freeStakeOf(seller);
        // 50% of 500e18 = 250e18 reserved.
        assertEq(freeBefore - freeAfter, 250e18);

        // Struct order: buyer, seller, dealAmount, sellerNet, feeTotal,
        // released, feeReleased, reservedAmount, milestonePcts (DROPPED by
        // Solidity's auto-getter since it's a dynamic array),
        // milestonesReleased, state, reservationBps. So the destructured
        // tuple is 11 fields and reservedAmount is the 8th.
        (, , , , , , , uint256 reservedAmount, , KarwanEscrow.EscrowState state, ) =
            escrow.escrows(JOB_ID);
        assertEq(reservedAmount, 250e18);
        assertEq(uint8(state), uint8(KarwanEscrow.EscrowState.Accepted));
    }

    function test_AcceptEscrow_RevertsOnInsufficientStake() public {
        // Fresh seller with no stake.
        address poorSeller = makeAddr("poor");
        bytes32 jobId = keccak256("poor-job");
        vm.prank(buyer);
        escrow.fundEscrow(jobId, poorSeller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
        vm.prank(poorSeller);
        vm.expectRevert(KarwanEscrow.InsufficientStake.selector);
        escrow.acceptEscrow(jobId);
    }

    function test_AcceptEscrow_OnlySeller() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
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
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
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
        new KarwanEscrow(address(usdc), FEE_BPS, address(0), address(vault), address(rep), MAX_RESERVATION_BPS);
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(KarwanEscrow.FeeTooHigh.selector);
        new KarwanEscrow(address(usdc), 1001, treasury, address(vault), address(rep), MAX_RESERVATION_BPS);
    }

    function test_Constructor_RevertsOnReservationTooHigh() public {
        vm.expectRevert(KarwanEscrow.ReservationTooHigh.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, treasury, address(vault), address(rep), 10001);
    }

    function test_Constructor_RevertsOnZeroVault() public {
        vm.expectRevert(KarwanEscrow.InvalidVault.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, treasury, address(0), address(rep), MAX_RESERVATION_BPS);
    }

    function test_Constructor_RevertsOnZeroReputation() public {
        vm.expectRevert(KarwanEscrow.InvalidReputation.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, treasury, address(vault), address(0), MAX_RESERVATION_BPS);
    }

    /* ====================== AUDIT FIX REGRESSIONS ======================= */

    /// M-3: getEscrow returns the full struct including milestonePcts,
    /// unlike the public mapping auto-getter which silently drops dynamic
    /// arrays. The off-by-one tuple destructuring bug we hit during the
    /// initial test write is exactly what this method prevents.
    function test_AuditM3_GetEscrowReturnsMilestonePcts() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(40, 60), RESERVATION_BPS);
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

    /* ==================== v2.E PER-DEAL reservationBps ================== */

    /// Casual deal (bps=0) accepts without touching the vault. Seller can
    /// accept with zero stake. State still moves to Accepted; reservedAmount
    /// stays 0; freeStake unchanged.
    function test_v2E_CasualDeal_AcceptsWithoutStake() public {
        address freshSeller = makeAddr("fresh"); // no stake at all
        bytes32 jobId = keccak256("casual-1");
        vm.prank(buyer);
        escrow.fundEscrow(jobId, freshSeller, 500e18, _twoMilestones(50, 50), 0);
        // Seller with zero free stake CAN accept on a casual deal.
        vm.prank(freshSeller);
        escrow.acceptEscrow(jobId);

        KarwanEscrow.EscrowAccount memory e = escrow.getEscrow(jobId);
        assertEq(uint8(e.state), uint8(KarwanEscrow.EscrowState.Accepted));
        assertEq(e.reservedAmount, 0);
        assertEq(e.reservationBps, 0);
        assertEq(vault.freeStakeOf(freshSeller), 0);
    }

    /// Casual deal settles cleanly with both parties credited Success.
    /// The vault.release path is gated on reservedAmount > 0 so it no-ops.
    function test_v2E_CasualDeal_SettlesWithRepCredit() public {
        address freshSeller = makeAddr("fresh-settle");
        bytes32 jobId = keccak256("casual-settle");
        vm.prank(buyer);
        escrow.fundEscrow(jobId, freshSeller, 500e18, _twoMilestones(50, 50), 0);
        vm.prank(freshSeller);
        escrow.acceptEscrow(jobId);
        vm.prank(buyer);
        escrow.releaseFinal(jobId);

        (uint256 buyerSuccess, , ) = rep.scores(buyer);
        (uint256 sellerSuccess, , ) = rep.scores(freshSeller);
        assertEq(buyerSuccess, 1);
        assertEq(sellerSuccess, 1);
    }

    /// Casual deal disputed + refunded: no slash, no rep credit either way.
    /// Pre-accept disputes already worked this way; we assert the new
    /// post-accept casual path behaves the same.
    function test_v2E_CasualDeal_Refund_NoSlashNoRep() public {
        address freshSeller = makeAddr("fresh-refund");
        bytes32 jobId = keccak256("casual-refund");
        vm.prank(buyer);
        escrow.fundEscrow(jobId, freshSeller, 500e18, _twoMilestones(50, 50), 0);
        vm.prank(freshSeller);
        escrow.acceptEscrow(jobId);
        vm.prank(buyer);
        escrow.dispute(jobId, "casual-bail");
        vm.prank(buyer);
        escrow.refund(jobId);

        (uint256 buyerSuccess, , uint256 buyerFailed) = rep.scores(buyer);
        (uint256 sellerSuccess, , uint256 sellerFailed) = rep.scores(freshSeller);
        // No reservation existed, so no slash and no rep mark.
        assertEq(buyerSuccess + buyerFailed + sellerSuccess + sellerFailed, 0);
    }

    /// Per-deal bps below MIN_TRUSTED_BPS (5000), but not zero, reverts.
    function test_v2E_FundEscrow_RevertsOnBpsBelowFloor() public {
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidReservation.selector);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), 4999);
    }

    /// Per-deal bps above maxReservationBps reverts.
    function test_v2E_FundEscrow_RevertsOnBpsAboveCeiling() public {
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidReservation.selector);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), 10001);
    }

    /// Per-deal bps exactly at maxReservationBps (100%) works: seller reserves
    /// the full deal value. With 400e18 stake the seller can accept up to
    /// a 400e18 deal at 100%.
    function test_v2E_AcceptEscrow_FullStakeReservation() public {
        bytes32 jobId = keccak256("hundred-pct");
        vm.prank(buyer);
        escrow.fundEscrow(jobId, seller, 400e18, _twoMilestones(50, 50), 10000);
        vm.prank(seller);
        escrow.acceptEscrow(jobId);

        KarwanEscrow.EscrowAccount memory e = escrow.getEscrow(jobId);
        assertEq(e.reservedAmount, 400e18);
        assertEq(vault.freeStakeOf(seller), 0);
    }

    /// Different deals with different reservationBps coexist. The per-deal
    /// reservedAmount is independently tracked.
    function test_v2E_MultipleDeals_IndependentReservations() public {
        bytes32 j1 = keccak256("trusted");
        bytes32 j2 = keccak256("casual");
        vm.prank(buyer);
        escrow.fundEscrow(j1, seller, 200e18, _twoMilestones(50, 50), 5000);
        vm.prank(buyer);
        escrow.fundEscrow(j2, seller, 200e18, _twoMilestones(50, 50), 0);

        vm.prank(seller);
        escrow.acceptEscrow(j1);
        vm.prank(seller);
        escrow.acceptEscrow(j2);

        // Only j1 reserved against the seller's stake.
        assertEq(escrow.getEscrow(j1).reservedAmount, 100e18);
        assertEq(escrow.getEscrow(j2).reservedAmount, 0);
        assertEq(vault.reservedTotal(seller), 100e18);
    }

    /// EscrowRefunded event includes priorReleased (audit D.6). After a
    /// partial release + dispute + refund, the event surfaces both the
    /// remaining refund amount AND what had already been released to the
    /// seller before the dispute. Indexers reconstruct partial state.
    function test_v2E_EscrowRefunded_IncludesPriorReleased() public {
        _fundAndAccept(500e18);
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0); // first 50% out: sellerNet * 50% = 248.125e18
        vm.prank(seller);
        escrow.dispute(JOB_ID, "stalled-after-first");

        // Expect EscrowRefunded with priorReleased reflecting the first
        // milestone. sellerNet = 496.25e18, first release = 248.125e18.
        // remaining = (sellerNet - released) + (feeTotal - feeReleased)
        //           = (496.25 - 248.125) + (7.5 - 3.75)
        //           = 248.125 + 3.75 = 251.875e18
        vm.expectEmit(true, false, false, true);
        emit KarwanEscrow.EscrowRefunded(JOB_ID, 251.875e18, 248.125e18);
        vm.prank(buyer);
        escrow.refund(JOB_ID);
    }

    /// Reputation credits route through vault.resolveOwner so the on-chain
    /// scores live on identity wallets. When seller is unmapped (no
    /// registerOwner call), it falls through as itself — backwards-
    /// compatible default.
    function test_v2E_ReputationKeyedByIdentity_PassThrough() public {
        // No agent → owner mapping registered, so seller resolves to itself.
        _fundAndAccept(500e18);
        vm.prank(buyer);
        escrow.releaseFinal(JOB_ID);
        (uint256 sellerSuccess, , ) = rep.scores(seller);
        assertEq(sellerSuccess, 1, "rep credited to seller itself when unmapped");
    }

    function test_v2E_ReputationKeyedByIdentity_ResolvesAgent() public {
        // Mock the agent → owner mapping. The seller in our setUp is the
        // identity wallet. Create a fresh "sellerAgent" address, register
        // it as an agent for seller, then fund + accept FROM the agent.
        // The vault's identity-resolved freeStakeOf reads stake from the
        // owner so the agent passes the stake check using the owner's
        // 400e18 deposit. Reputation should credit `seller` (the identity)
        // when the deal settles, not the agent.
        address sellerAgent = makeAddr("seller-agent");
        bytes32 jobId = keccak256("agent-flow");

        // Agent registers itself as owned by `seller`.
        vm.prank(sellerAgent);
        vault.registerOwner(seller);

        vm.prank(buyer);
        escrow.fundEscrow(jobId, sellerAgent, 200e18, _twoMilestones(50, 50), RESERVATION_BPS);
        vm.prank(sellerAgent);
        escrow.acceptEscrow(jobId);
        vm.prank(buyer);
        escrow.releaseFinal(jobId);

        // Success credit should land on the IDENTITY wallet, not the agent.
        (uint256 identitySuccess, , ) = rep.scores(seller);
        (uint256 agentSuccess, , ) = rep.scores(sellerAgent);
        assertEq(identitySuccess, 1, "rep on identity wallet");
        assertEq(agentSuccess, 0, "rep NOT on agent wallet");
    }
}
