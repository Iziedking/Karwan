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

/// @title Settlement-timing gaps are CLOSED in Escrow v2b
/// @notice The pre-v2b versions of these tests (git history) proved two gaps
///         live: the buyer had no trustless timeout exit after the seller
///         accepted (closing H-1 removed post-accept refund without a
///         replacement), and a dispute at the claim buzzer froze the seller's
///         claim forever behind the arbiter key. v2b adds the consented
///         per-deal clock (deadline + reclaim), the mutual-cancel handshake,
///         the dispute lapse with clock-pause, and identity-wallet standing.
contract KarwanEscrowTimingAttackTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    bytes32 constant JOB_ID = keccak256("timing-job");

    uint16 constant FEE_BPS = 150;
    uint16 constant RESERVATION_BPS = 5000;
    uint16 constant MAX_RESERVATION_BPS = 10000;

    // 500 deal, 1.5% fee: sellerNet 496.25, feeTotal 7.5, funded 503.75.
    uint256 constant SELLER_NET = 496.25e18;
    uint256 constant FUNDED = 503.75e18;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc), FEE_BPS, treasury, address(vault), address(rep), MAX_RESERVATION_BPS
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);

        usdc.mint(buyer, 1000e18);
        usdc.mint(seller, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

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

    function _timing(uint64 deadlineFromNow, uint64 window, uint64 grace)
        internal
        view
        returns (KarwanEscrow.Timing memory)
    {
        return KarwanEscrow.Timing({
            deliveryDeadline: deadlineFromNow == 0 ? 0 : uint64(vm.getBlockTimestamp()) + deadlineFromNow,
            reviewWindow: window,
            reclaimGrace: grace
        });
    }

    /// Fund with a 10-day deadline, 1-day grace, default review window.
    function _fundTimedAndAccept() internal {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS, _timing(10 days, 0, 1 days)
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    // ========================= GAP 1 flipped ==========================

    /// FIX 1. The seller accepts and never delivers. After the consented
    /// deadline plus grace, the buyer reclaims everything trustlessly and the
    /// full reservation (nothing was delivered) slashes to them. No arbiter
    /// involved. The H-1 clawback stays closed: refund still reverts.
    function test_V2B_BuyerReclaimsAfterDeadline() public {
        _fundTimedAndAccept();

        vm.warp(vm.getBlockTimestamp() + 11 days + 1);
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));

        // Full funded amount back plus the whole 250 reserve (0% delivered).
        assertEq(usdc.balanceOf(buyer), 1000e18 + 250e18, "buyer made whole plus insurance");
        assertEq(vault.activeStakeOf(seller), 150e18, "late seller slashed");
        assertEq(
            uint8(escrow.getEscrow(JOB_ID).state), uint8(KarwanEscrow.EscrowState.Refunded), "refunded"
        );
        (, , uint256 failed) = rep.scores(seller);
        assertEq(failed, 1, "lateness recorded as Failed");
    }

    /// The clawback direction stays closed even with the deadline machinery:
    /// before the deadline the buyer has no reclaim and no refund.
    function test_V2B_NoReclaimBeforeDeadline_NoRefundEver() public {
        _fundTimedAndAccept();

        vm.startPrank(buyer);
        vm.expectRevert(KarwanEscrow.DeadlineNotPassed.selector);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));

        escrow.dispute(JOB_ID, "clawback attempt");
        vm.expectRevert(KarwanEscrow.RefundAfterAccept.selector);
        escrow.refund(JOB_ID);
        vm.stopPrank();
    }

    /// A marked delivery blocks the reclaim: the buyer must answer the
    /// delivery (release or dispute), not race the deadline past it.
    function test_V2B_ReclaimBlockedWhileDeliveryPending() public {
        _fundTimedAndAccept();
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof");

        vm.warp(vm.getBlockTimestamp() + 30 days);
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.DeliveryPending.selector);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
    }

    /// Slash is proportional to the UNDELIVERED fraction: with milestone 1 of
    /// 2 released, going late on the rest costs half the reserve, not all.
    function test_V2B_ReclaimSlashProportionalToUndelivered() public {
        _fundTimedAndAccept();

        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "m1");
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0);

        vm.warp(vm.getBlockTimestamp() + 30 days);
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));

        // Half the 250 reserve slashes; the seller keeps the delivered half.
        assertEq(vault.activeStakeOf(seller), 400e18 - 125e18, "half-late, half-slashed");
        // Buyer recovers the undelivered half of the funded amount + 125 slash.
        assertEq(usdc.balanceOf(buyer), 1000e18 - FUNDED + (FUNDED / 2) + 125e18, "buyer half refund");
    }

    /// Open-ended deals (deadline 0) have no timeout reclaim, by consent.
    function test_V2B_OpenEndedDealHasNoReclaim() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);

        vm.warp(vm.getBlockTimestamp() + 3650 days);
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.NoDeadline.selector);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
    }

    /// Buyer-only extension pushes the reclaim out; the seller cannot extend
    /// their own deadline.
    function test_V2B_ExtendDeadlineBuyerOnly() public {
        _fundTimedAndAccept();
        uint64 original = escrow.getEscrow(JOB_ID).deliveryDeadline;

        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotBuyer.selector);
        escrow.extendDeadline(JOB_ID, original + 20 days);

        vm.prank(buyer);
        escrow.extendDeadline(JOB_ID, original + 20 days);

        // Old deadline + grace passes: still not reclaimable.
        vm.warp(uint256(original) + 2 days);
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.DeadlineNotPassed.selector);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));
    }

    // ========================= GAP 2 flipped ==========================

    /// FIX 2. The buyer disputes at the claim buzzer and the arbiter never
    /// rules. After the dispute timeout either party lapses the dispute back
    /// to Accepted, the frozen time extends the deadline (clock-pause), the
    /// seller re-marks delivery, and claims. A dispute delays settlement but
    /// can never trap it.
    function test_V2B_DisputeLapsesAndSellerClaims() public {
        _fundTimedAndAccept();
        uint64 originalDeadline = escrow.getEscrow(JOB_ID).deliveryDeadline;

        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof-1");

        // One second before the claim unlocks, the buyer disputes.
        vm.warp(vm.getBlockTimestamp() + 5 days - 1);
        vm.prank(buyer);
        escrow.dispute(JOB_ID, "spite dispute at the buzzer");

        // Too early to lapse.
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.DisputeStillFresh.selector);
        escrow.lapseDispute(JOB_ID);

        // Arbiter stays silent past the timeout; the seller lapses.
        vm.warp(vm.getBlockTimestamp() + 14 days);
        vm.prank(seller);
        escrow.lapseDispute(JOB_ID);

        KarwanEscrow.EscrowAccount memory e = escrow.getEscrow(JOB_ID);
        assertEq(uint8(e.state), uint8(KarwanEscrow.EscrowState.Accepted), "back to Accepted");
        assertEq(e.deliveryDeadline, originalDeadline + 14 days, "frozen time extends the deadline");

        // Delivery clock restarts; the seller claims both milestones.
        uint256 sellerStart = usdc.balanceOf(seller);
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof-1-again");
        vm.warp(vm.getBlockTimestamp() + 5 days + 1);
        vm.prank(seller);
        escrow.claimMilestone(JOB_ID, 0);
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof-2");
        vm.warp(vm.getBlockTimestamp() + 5 days + 1);
        vm.prank(seller);
        escrow.claimMilestone(JOB_ID, 1);

        assertEq(usdc.balanceOf(seller) - sellerStart, SELLER_NET, "seller paid in full");
        assertEq(vault.activeStakeOf(seller), 400e18, "reservation released");
    }

    // ======================== Mutual cancel ==========================

    /// Two-tx consented exit replaces the broken post-accept refund: the
    /// buyer proposes a 60/40 split, the seller accepts, the reservation
    /// releases in full (no-fault), the deal settles.
    function test_V2B_MutualCancelHandshake() public {
        _fundTimedAndAccept();

        vm.prank(buyer);
        escrow.proposeCancel(JOB_ID, 6000, address(0));
        vm.prank(seller);
        escrow.acceptCancel(JOB_ID, 6000, address(0));

        // Seller 60% of net: 297.75. Buyer: 40% of net + 40% of fee = 198.5 + 3.
        assertEq(usdc.balanceOf(seller), 600e18 + 297.75e18, "seller split");
        assertEq(usdc.balanceOf(buyer), 1000e18 - FUNDED + 198.5e18 + 3e18, "buyer split");
        assertEq(usdc.balanceOf(treasury), 4.5e18, "treasury keeps its share of the fee");
        assertEq(vault.activeStakeOf(seller), 400e18, "no-fault: reservation released, no slash");
        assertEq(
            uint8(escrow.getEscrow(JOB_ID).state), uint8(KarwanEscrow.EscrowState.Settled), "settled"
        );
    }

    /// The acceptance must match the proposed split (no bps front-running),
    /// and the proposer's own side cannot accept its own proposal.
    function test_V2B_MutualCancelConsentIsStrict() public {
        _fundTimedAndAccept();

        vm.prank(buyer);
        escrow.proposeCancel(JOB_ID, 6000, address(0));

        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.CancelMismatch.selector);
        escrow.acceptCancel(JOB_ID, 9000, address(0));

        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.NotParty.selector);
        escrow.acceptCancel(JOB_ID, 6000, address(0));

        // Withdraw kills the proposal.
        vm.prank(buyer);
        escrow.withdrawCancel(JOB_ID);
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NoCancelProposal.selector);
        escrow.acceptCancel(JOB_ID, 6000, address(0));
    }

    /// Mutual cancel also settles a live dispute without the arbiter.
    function test_V2B_MutualCancelSettlesDispute() public {
        _fundTimedAndAccept();
        vm.prank(buyer);
        escrow.dispute(JOB_ID, "disagreement");

        vm.prank(seller);
        escrow.proposeCancel(JOB_ID, 5000, address(0));
        vm.prank(buyer);
        escrow.acceptCancel(JOB_ID, 5000, address(0));

        assertEq(
            uint8(escrow.getEscrow(JOB_ID).state), uint8(KarwanEscrow.EscrowState.Settled), "settled"
        );
        assertEq(vault.activeStakeOf(seller), 400e18, "reservation released");
    }

    // ======================= Identity standing ========================

    /// The platform-death drill: the deal's on-chain parties are custodial
    /// agent wallets, but the humans' identity wallets (bound in the vault
    /// via the consented approveAgent/registerOwner handshake) can drive the
    /// whole lifecycle and route payouts to keys they actually control.
    function test_V2B_IdentityWalletsSurvivePlatformDeath() public {
        address buyerAgent = makeAddr("buyerAgent");
        address sellerAgent = makeAddr("sellerAgent");
        address buyerHuman = makeAddr("buyerHuman");
        address sellerHuman = makeAddr("sellerHuman");

        vm.prank(buyerHuman);
        vault.approveAgent(buyerAgent);
        vm.prank(buyerAgent);
        vault.registerOwner(buyerHuman);
        vm.prank(sellerHuman);
        vault.approveAgent(sellerAgent);
        vm.prank(sellerAgent);
        vault.registerOwner(sellerHuman);

        // The seller's stake sits on their identity wallet.
        usdc.mint(sellerHuman, 400e18);
        vm.startPrank(sellerHuman);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(400e18);
        vm.stopPrank();

        // The platform funds via the buyer agent, then "dies".
        usdc.mint(buyerAgent, FUNDED);
        vm.startPrank(buyerAgent);
        usdc.approve(address(escrow), type(uint256).max);
        escrow.fundEscrow(
            JOB_ID, sellerAgent, 500e18, _twoMilestones(50, 50), RESERVATION_BPS, _timing(30 days, 0, 1 days)
        );
        vm.stopPrank();

        // Every remaining step runs on the humans' own keys.
        vm.prank(sellerHuman);
        escrow.acceptEscrow(JOB_ID);
        vm.prank(sellerHuman);
        escrow.markDelivered(JOB_ID, "proof-1");
        vm.prank(buyerHuman);
        escrow.releaseProgress(JOB_ID, 0);
        vm.prank(sellerHuman);
        escrow.markDelivered(JOB_ID, "proof-2");
        vm.warp(vm.getBlockTimestamp() + 5 days + 1);
        vm.prank(sellerHuman);
        escrow.claimMilestone(JOB_ID, 1, sellerHuman);

        // The claimed milestone landed on the human's key, not the dead SCA.
        assertEq(usdc.balanceOf(sellerHuman), SELLER_NET / 2, "final milestone paid to the human");
        // The buyer-released milestone went to the stored agent wallet.
        assertEq(usdc.balanceOf(sellerAgent), SELLER_NET / 2, "released milestone paid to the agent");
        assertEq(vault.activeStakeOf(sellerHuman), 400e18, "reservation released");
    }

    /// Payees are locked to the two consented wallets of the same human.
    function test_V2B_PayeeCannotRedirect() public {
        _fundTimedAndAccept();
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof");
        vm.warp(vm.getBlockTimestamp() + 5 days + 1);

        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.InvalidPayee.selector);
        escrow.claimMilestone(JOB_ID, 0, makeAddr("attacker"));
    }

    /// A user's buyer agent funding their own seller agent resolves to the
    /// same identity and is rejected: no self-deal reputation farming.
    function test_V2B_SelfDealBlockedAtIdentityLevel() public {
        address human = makeAddr("human");
        address agentA = makeAddr("agentA");
        address agentB = makeAddr("agentB");
        vm.startPrank(human);
        vault.approveAgent(agentA);
        vault.approveAgent(agentB);
        vm.stopPrank();
        vm.prank(agentA);
        vault.registerOwner(human);
        vm.prank(agentB);
        vault.registerOwner(human);

        usdc.mint(agentA, FUNDED);
        vm.startPrank(agentA);
        usdc.approve(address(escrow), type(uint256).max);
        vm.expectRevert(KarwanEscrow.InvalidSeller.selector);
        escrow.fundEscrow(JOB_ID, agentB, 500e18, _twoMilestones(50, 50), 0);
        vm.stopPrank();
    }

    // ========================= Timing bounds ==========================

    /// Per-deal windows are consented but bounded: below the network floor or
    /// with an impossible deadline the fund reverts.
    function test_V2B_TimingBoundsEnforced() public {
        vm.startPrank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidTiming.selector);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _twoMilestones(50, 50), 0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 30, reclaimGrace: 0})
        );

        vm.expectRevert(KarwanEscrow.InvalidTiming.selector);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _twoMilestones(50, 50), 0,
            KarwanEscrow.Timing({deliveryDeadline: uint64(vm.getBlockTimestamp()), reviewWindow: 0, reclaimGrace: 0})
        );
        vm.stopPrank();
    }

    /// A 4-minute demo clock is legitimate: consented at accept, the whole
    /// lifecycle (deliver -> silence -> claim) runs in minutes on testnet.
    function test_V2B_DemoSpeedClockWorks() public {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS,
            KarwanEscrow.Timing({deliveryDeadline: uint64(vm.getBlockTimestamp()) + 1 hours, reviewWindow: 240, reclaimGrace: 60})
        );
        vm.startPrank(seller);
        escrow.acceptEscrow(JOB_ID);
        escrow.markDelivered(JOB_ID, "proof-1");
        vm.warp(vm.getBlockTimestamp() + 241);
        escrow.claimMilestone(JOB_ID, 0);
        vm.stopPrank();

        assertEq(usdc.balanceOf(seller), 600e18 + SELLER_NET / 2, "demo-speed claim landed");
    }

    /// 5-way milestone splits now fund (the live 2-to-5 UI vs MAX_MILESTONES=4
    /// mismatch found in the settlement audit).
    function test_V2B_FiveMilestonesFund() public {
        uint8[] memory pcts = new uint8[](5);
        pcts[0] = 20; pcts[1] = 20; pcts[2] = 20; pcts[3] = 20; pcts[4] = 20;
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, pcts, 0);
        assertEq(escrow.getEscrow(JOB_ID).milestonePcts.length, 5, "five milestones stored");
    }
}
