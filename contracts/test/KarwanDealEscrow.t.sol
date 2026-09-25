// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanDealEscrow} from "../src/KarwanDealEscrow.sol";
import {DealTerms, Deal, DealState} from "../src/KarwanDealTypes.sol";
import {KarwanStakeVault} from "../src/KarwanStakeVault.sol";
import {KarwanYieldPool} from "../src/KarwanYieldPool.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {PoolTeller, PoolOracle, PoolToken} from "./KarwanYieldPool.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// USDC with Arc's blocklist behaviour: a transfer to or from a blocked address reverts.
contract BlockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    mapping(address => bool) public blocked;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function setBlocked(address a, bool b) external { blocked[a] = b; }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(!blocked[msg.sender] && !blocked[to], "blocklisted");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(!blocked[from] && !blocked[to], "blocklisted");
        if (allowance[from][msg.sender] < type(uint256).max) allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract DealEscrowBase is Test {
    BlockUSDC usdc;
    KarwanDealEscrow escrow;
    KarwanStakeVault vault;
    KarwanReputation rep;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("fee-treasury");
    address engine = makeAddr("dispute-engine");
    address reviewSafe = makeAddr("review-safe-1of4");
    address seniorSafe = makeAddr("senior-safe-2of4");
    address guardianKey = makeAddr("guardian");
    address stranger = makeAddr("stranger");

    uint64 constant REVIEW = 1 days;
    uint64 constant APPEAL = 3 days;
    uint64 constant SLA = 5 days;
    uint64 constant TIMEOUT = 14 days;

    function setUp() public virtual {
        usdc = new BlockUSDC();
        vault = new KarwanStakeVault(address(usdc), address(this));
        rep = new KarwanReputation();
        escrow = new KarwanDealEscrow(
            address(usdc),
            address(vault),
            address(this),
            KarwanDealEscrow.Bounds({
                maxReservationBps: 10_000,
                minReview: 60,
                maxReview: 180 days,
                maxHorizon: 730 days,
                disputeTimeout: TIMEOUT,
                appealWindow: APPEAL,
                autoRulingSla: SLA
            })
        );
        vault.setConsumer(address(escrow), true);
        rep.setEscrow(address(escrow));
        escrow.setReputation(address(rep));
        escrow.setRoles(treasury, engine, reviewSafe, seniorSafe);
        escrow.setFeeBps(150);
        escrow.setGuardian(guardianKey);

        usdc.mint(buyer, 1_000_000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _terms() internal view returns (DealTerms memory t) {
        t.seller = seller;
        t.amount = 1_000e6;
        t.pcts[0] = 50;
        t.pcts[1] = 50;
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = uint32(REVIEW);
        t.maxExtensions = 1;
        t.extensionSecs = 1 days;
        t.silentLongstop = 10 days;
        t.agreementHash = keccak256("agreement");
    }

    function _open(DealTerms memory t) internal returns (bytes32 id) {
        vm.prank(buyer);
        id = escrow.fund(keccak256(abi.encode(t, block.timestamp)), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(t.seller);
        escrow.accept(id, h);
    }

    function _deliver(bytes32 id) internal {
        vm.prank(seller);
        escrow.markDelivered(id, keccak256("proof"));
    }

    function _state(bytes32 id) internal view returns (DealState) {
        return escrow.getDeal(id).state;
    }
}

contract KarwanDealEscrowTest is DealEscrowBase {
    // ---------------------------- consent ------------------------------

    function test_HappyPathPaysExactlyWhatWasFunded() public {
        DealTerms memory t = _terms();
        bytes32 id = _open(t);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(uint8(_state(id)), uint8(DealState.Settled));
        // fee 1.5%: buyer paid 7.5, seller gives 7.5
        assertEq(usdc.balanceOf(seller), 992.5e6);
        assertEq(usdc.balanceOf(treasury), 15e6);
        assertEq(usdc.balanceOf(address(escrow)), 0, "nothing left behind");
        assertEq(buyerBefore - usdc.balanceOf(buyer), 0, "funding happened before");
        assertEq(escrow.outstanding(), 0);
    }

    function test_E7_SellerMustAcceptTheExactTermsFunded() public {
        DealTerms memory t = _terms();
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256("s"), t);
        DealTerms memory other = _terms();
        other.reviewWindow = uint32(2 days);
        bytes32 wrong = escrow.termsHashOf(other);
        vm.prank(seller);
        vm.expectRevert(KarwanDealEscrow.HashMismatch.selector);
        escrow.accept(id, wrong);
    }

    function test_E6_DealIdsCannotBeTakenFirst() public {
        DealTerms memory t = _terms();
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256("s"), t);
        assertEq(id, escrow.dealIdFor(buyer, keccak256("s")));
        usdc.mint(stranger, 10_000e6);
        vm.startPrank(stranger);
        usdc.approve(address(escrow), type(uint256).max);
        bytes32 other = escrow.fund(keccak256("s"), t);
        vm.stopPrank();
        assertTrue(other != id, "same salt, different buyer, different deal");
    }

    /// MN-03: ids from different escrow deployments, or the same address on another
    /// chain, meet in shared records such as Reputation. They must never collide.
    function test_MN03_DealIdsAreScopedToThisEscrowAndChain() public {
        bytes32 salt = keccak256("s");
        KarwanDealEscrow twin = new KarwanDealEscrow(
            address(usdc),
            address(vault),
            address(this),
            KarwanDealEscrow.Bounds({
                maxReservationBps: 10_000,
                minReview: 60,
                maxReview: 180 days,
                maxHorizon: 730 days,
                disputeTimeout: TIMEOUT,
                appealWindow: APPEAL,
                autoRulingSla: SLA
            })
        );
        bytes32 here = escrow.dealIdFor(buyer, salt);
        assertTrue(here != twin.dealIdFor(buyer, salt), "another escrow, same buyer and salt");

        vm.chainId(5042);
        assertTrue(here != escrow.dealIdFor(buyer, salt), "same escrow address on another chain");
    }

    function test_BuyerCancelsADealTheSellerNeverAccepted() public {
        DealTerms memory t = _terms();
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256("s"), t);
        vm.prank(buyer);
        escrow.cancelUnaccepted(id);
        assertEq(usdc.balanceOf(buyer), before, "full refund including fee share");
    }

    // ----------------------------- clocks ------------------------------

    function test_E3_SellerCannotClaimBeforeTheAgreedReview() public {
        bytes32 id = _open(_terms());
        _deliver(id);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.claim(id, address(0));
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(escrow.getDeal(id).paid, 1);
    }

    function test_FinalByBuyerNeedsTheSilenceLongstop() public {
        DealTerms memory t = _terms();
        t.pcts[0] = 100;
        t.pcts[1] = 0;
        t.finalRelease = 1;
        bytes32 id = _open(t);
        _deliver(id);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.claim(id, address(0));
        vm.warp(block.timestamp + 10 days);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(uint8(_state(id)), uint8(DealState.Settled), "buyer silence cannot trap the seller");
    }

    function test_MoreTimeMovesTheSellersClock() public {
        bytes32 id = _open(_terms());
        _deliver(id);
        vm.prank(buyer);
        escrow.requestMoreTime(id);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.claim(id, address(0));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("Exhausted()"));
        escrow.requestMoreTime(id);
    }

    function test_GuardianHoldDelaysTheSellerNeverTheBuyer() public {
        bytes32 id = _open(_terms());
        _deliver(id);
        vm.prank(guardianKey);
        escrow.hold(id, keccak256("suspicious"));
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        vm.expectRevert();
        escrow.claim(id, address(0));
        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.getDeal(id).paid, 1, "buyer can always pay");
    }

    // ------------------------ delivery checks --------------------------

    function _checked() internal view returns (DealTerms memory t) {
        t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 2 days;
        t.checkPolicy = keccak256("github-delivery-v2");
    }

    function test_CheckPassStartsTheReview() public {
        bytes32 id = _open(_checked());
        _deliver(id);
        assertEq(escrow.getDeal(id).reviewStartAt, 0, "no review before the check");
        vm.prank(guardianKey);
        escrow.attestCheck(id, 1, true, keccak256("evidence"));
        assertEq(escrow.getDeal(id).reviewEnd, block.timestamp + REVIEW);
    }

    function test_MismatchStartsNothingAndSellerCannotClaimUntilSilence() public {
        bytes32 id = _open(_checked());
        _deliver(id);
        vm.prank(guardianKey);
        escrow.attestCheck(id, 1, false, keccak256("mismatch"));
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.claim(id, address(0));
    }

    function test_StaleRevisionAttestationRejected() public {
        bytes32 id = _open(_checked());
        _deliver(id);
        _deliver(id);
        vm.prank(guardianKey);
        vm.expectRevert(abi.encodeWithSignature("HashMismatch()"));
        escrow.attestCheck(id, 1, true, keccak256("old"));
    }

    function test_BuyerReviewingThemselvesWaivesTheCheck() public {
        bytes32 id = _open(_checked());
        _deliver(id);
        vm.prank(buyer);
        escrow.startReview(id);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(escrow.getDeal(id).paid, 1);
    }

    function test_OnlyTheGuardianAttests() public {
        bytes32 id = _open(_checked());
        _deliver(id);
        vm.prank(stranger);
        vm.expectRevert();
        escrow.attestCheck(id, 1, true, bytes32(0));
    }

    // ------------------------------ goods ------------------------------

    function test_GoodsReviewStartsOnArrivalOrLongstop() public {
        DealTerms memory t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 5 days;
        bytes32 id = _open(t);
        _deliver(id);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.claim(id, address(0));
        vm.warp(block.timestamp + 5 days);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(escrow.getDeal(id).paid, 1, "arrival never confirmed: longstop starts the review");
    }

    // ----------------------------- disputes ----------------------------

    function test_E1_LapsedDisputeCannotClawBackAnOnTimeDelivery() public {
        DealTerms memory t = _terms();
        bytes32 id = _open(t);
        vm.warp(t.deliveryDeadline - 1 hours);
        _deliver(id);
        vm.warp(block.timestamp + REVIEW - 1 minutes);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("late dispute"));
        vm.warp(block.timestamp + TIMEOUT);
        vm.prank(buyer);
        escrow.lapseDispute(id);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("NotAllowed()"));
        escrow.reclaim(id, address(0));
        vm.warp(block.timestamp + REVIEW);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(escrow.getDeal(id).paid, 1, "on-time seller is paid");
    }

    function test_E2_LateMarkIsWipedSoTheBuyerCanReclaim() public {
        DealTerms memory t = _terms();
        bytes32 id = _open(t);
        vm.warp(t.deliveryDeadline + 1);
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.warp(block.timestamp + TIMEOUT);
        vm.prank(buyer);
        escrow.lapseDispute(id);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Late()"));
        escrow.markDelivered(id, bytes32(0));
        vm.prank(buyer);
        escrow.reclaim(id, address(0));
        assertEq(uint8(_state(id)), uint8(DealState.Reclaimed));
    }

    function test_E4_OneDisputePerSidePerMilestone() public {
        bytes32 id = _open(_terms());
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.warp(block.timestamp + TIMEOUT);
        vm.prank(buyer);
        escrow.lapseDispute(id);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("Exhausted()"));
        escrow.dispute(id, bytes32(0));
        vm.prank(seller);
        escrow.dispute(id, bytes32(0));
    }

    function test_E11_AutomaticRulingWaitsForTheAppealWindow() public {
        bytes32 id = _open(_terms());
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.prank(engine);
        escrow.proposeRuling(id, 3_000, keccak256("reason"));
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.executeRuling(id);
        vm.warp(block.timestamp + APPEAL);
        vm.prank(stranger);
        escrow.executeRuling(id);
        assertEq(uint8(_state(id)), uint8(DealState.Split));
        assertEq(usdc.balanceOf(stranger), 0, "executing a ruling pays nobody but the parties");
    }

    function test_AppealSendsItToAdminReviewAndOnlyReviewRules() public {
        bytes32 id = _open(_terms());
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.prank(engine);
        escrow.proposeRuling(id, 9_000, bytes32(0));
        vm.prank(buyer);
        escrow.escalate(id);
        vm.warp(block.timestamp + APPEAL);
        vm.expectRevert(abi.encodeWithSignature("BadState()"));
        escrow.executeRuling(id);
        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSignature("BadState()"));
        escrow.proposeRuling(id, 9_000, bytes32(0));
        vm.prank(reviewSafe);
        escrow.rule(id, 2_000, keccak256("reviewed"));
        assertEq(uint8(_state(id)), uint8(DealState.Split));
    }

    function test_AppealAfterTheWindowIsTooLate() public {
        bytes32 id = _open(_terms());
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.prank(engine);
        escrow.proposeRuling(id, 9_000, bytes32(0));
        vm.warp(block.timestamp + APPEAL);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("Late()"));
        escrow.escalate(id);
    }

    function test_SilentEngineLetsAPartyEscalateAfterTheSla() public {
        bytes32 id = _open(_terms());
        vm.prank(seller);
        escrow.dispute(id, bytes32(0));
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSignature("Early()"));
        escrow.escalate(id);
        vm.warp(block.timestamp + SLA);
        vm.prank(seller);
        escrow.escalate(id);
        assertTrue(escrow.getDeal(id).escalated);
    }

    function test_E12_LargeDealsNeedTheSeniorSafe() public {
        escrow.setCaps(0, 0, 500e6);
        DealTerms memory t = _checked();
        t.finalRelease = 1;
        bytes32 id = _open(t);
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.prank(engine);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        vm.expectRevert(abi.encodeWithSignature("BadCaller()"));
        escrow.rule(id, 5_000, bytes32(0));
        vm.prank(seniorSafe);
        escrow.rule(id, 5_000, bytes32(0));
        assertEq(uint8(_state(id)), uint8(DealState.Split));
    }

    function test_ReviewTierIsFixedAtFunding() public {
        escrow.setCaps(0, 0, 500e6);
        DealTerms memory t = _checked();
        t.finalRelease = 1;
        bytes32 id = _open(t);
        escrow.setCaps(0, 0, 0);
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.prank(engine);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        vm.expectRevert(abi.encodeWithSignature("BadCaller()"));
        escrow.rule(id, 5_000, bytes32(0));
    }

    function test_NoDealBeforeTheFeeTreasuryIsSet() public {
        KarwanDealEscrow fresh = new KarwanDealEscrow(
            address(usdc),
            address(vault),
            address(this),
            KarwanDealEscrow.Bounds({
                maxReservationBps: 10_000,
                minReview: 60,
                maxReview: 180 days,
                maxHorizon: 730 days,
                disputeTimeout: TIMEOUT,
                appealWindow: APPEAL,
                autoRulingSla: SLA
            })
        );
        vm.startPrank(buyer);
        usdc.approve(address(fresh), type(uint256).max);
        vm.expectRevert(abi.encodeWithSignature("Zero()"));
        fresh.fund(keccak256("s"), _terms());
        vm.stopPrank();
    }

    function test_HighValueTermsMustBeCheckedAndBuyerFinal() public {
        escrow.setCaps(0, 0, 500e6);
        DealTerms memory t = _terms();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("BadTerms()"));
        escrow.fund(keccak256("s"), t);
    }

    function test_AdminCannotRuleAnUnescalatedDispute() public {
        bytes32 id = _open(_terms());
        vm.prank(buyer);
        escrow.dispute(id, bytes32(0));
        vm.prank(reviewSafe);
        vm.expectRevert(abi.encodeWithSignature("BadState()"));
        escrow.rule(id, 10_000, bytes32(0));
    }

    function test_MutualSplitSettles() public {
        bytes32 id = _open(_terms());
        vm.prank(seller);
        escrow.proposeSplit(id, 4_000);
        vm.prank(buyer);
        escrow.acceptSplit(id, 4_000);
        assertEq(uint8(_state(id)), uint8(DealState.Split));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ------------------------------ pause ------------------------------

    function test_E13_PauseStopsNewDealsNeverExits() public {
        bytes32 id = _open(_terms());
        _deliver(id);
        vm.prank(guardianKey);
        escrow.pauseNewDeals();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("Paused()"));
        escrow.fund(keccak256("new"), _terms());
        vm.prank(buyer);
        escrow.release(id);
        vm.prank(guardianKey);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", guardianKey));
        escrow.resumeNewDeals();
    }

    // ------------------------- blocked recipient -----------------------

    function test_E5_BlocklistedSellerDoesNotFreezeTheDeal() public {
        bytes32 id = _open(_terms());
        usdc.setBlocked(seller, true);
        vm.prank(buyer);
        escrow.proposeSplit(id, 5_000);
        vm.prank(seller);
        escrow.acceptSplit(id, 5_000);
        assertEq(uint8(_state(id)), uint8(DealState.Split), "split completed");
        assertGt(escrow.owed(seller), 0, "seller share credited");
        vm.prank(seller);
        vm.expectRevert();
        escrow.withdrawOwed();
        usdc.setBlocked(seller, false);
        vm.prank(seller);
        escrow.withdrawOwed();
        assertEq(escrow.owed(seller), 0);
    }

    // ----------------------------- deposit -----------------------------

    function test_DepositReturnsToTheBuyerWithoutPenalty() public {
        DealTerms memory t = _terms();
        t.pcts[0] = 100;
        t.pcts[1] = 0;
        t.silenceOutcome = 1;
        t.reservationBps = 5_000;
        _stake(seller, 1_000e6);
        bytes32 id = _open(t);
        vm.warp(t.deliveryDeadline + t.reclaimGrace + 1);
        vm.prank(buyer);
        escrow.reclaim(id, address(0));
        (uint256 s,, uint256 f) = rep.scores(seller);
        assertEq(f, 0, "no failure recorded for a deposit ending normally");
        assertEq(s, 0);
        assertEq(vault.freeStakeOf(seller), 1_000e6, "no slash");
    }

    function test_DepositClaimByTheSellerStillNeedsTheReview() public {
        DealTerms memory t = _terms();
        t.pcts[0] = 100;
        t.pcts[1] = 0;
        t.silenceOutcome = 1;
        bytes32 id = _open(t);
        _deliver(id);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("NotAllowed()"));
        escrow.reclaim(id, address(0));
    }

    // ------------------------------ stake ------------------------------

    function _stake(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.stake(amount);
        vm.stopPrank();
    }

    function test_MissedDeadlineSlashesUndeliveredShare() public {
        DealTerms memory t = _terms();
        t.reservationBps = 5_000;
        _stake(seller, 1_000e6);
        bytes32 id = _open(t);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        vm.warp(t.deliveryDeadline + t.reclaimGrace + 1);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.reclaim(id, address(0));
        assertEq(usdc.balanceOf(buyer) - before, 496.25e6 + 7.5e6 + 250e6, "unpaid principal, unspent fee, and the slashed half of the reserve");
        (,, uint256 f) = rep.scores(seller);
        assertEq(f, 1);
    }

    // ---------------------------- rounding -----------------------------

    function test_E8_OddAmountsAndThreeMilestonesConserveExactly() public {
        DealTerms memory t = _terms();
        t.amount = 1_000_000_007;
        t.pcts[0] = 33;
        t.pcts[1] = 33;
        t.pcts[2] = 34;
        bytes32 id = _open(t);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(buyer);
            escrow.release(id);
        }
        assertEq(usdc.balanceOf(address(escrow)), 0, "no dust left");
        assertEq(escrow.outstanding(), 0);
    }
}

contract KarwanDealEscrowYieldTest is DealEscrowBase {
    KarwanYieldPool pool;
    PoolTeller teller;
    PoolOracle oracle;
    PoolToken usyc;

    function setUp() public override {
        super.setUp();
        usyc = new PoolToken();
        pool = new KarwanYieldPool(address(usdc), 8, address(this));
        pool.setClient(address(escrow), true);
        escrow.setPool(address(pool));
    }

    function test_LargeLongDealsParkAndComeBackOnPayout() public {
        DealTerms memory t = _terms();
        t.amount = 10_000e6;
        bytes32 id = _open(t);
        escrow.parkIdle();
        assertEq(escrow.parked(), 10_000e6);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), 4_962.5e6, "paid from the pool");
    }

    function test_ShortDealsNeverPark() public {
        DealTerms memory t = _terms();
        t.deliveryDeadline = uint64(block.timestamp + 1 days);
        t.amount = 10_000e6;
        _open(t);
        escrow.parkIdle();
        assertEq(escrow.parked(), 0);
    }

    function test_PoolTroubleCreditsInsteadOfBlockingTheExit() public {
        BlockUSDC u = usdc;
        DealTerms memory t = _terms();
        t.amount = 10_000e6;
        bytes32 id = _open(t);
        escrow.parkIdle();
        // pool cannot pay: its USDC is frozen for the moment
        u.setBlocked(address(pool), true);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.getDeal(id).paid, 1, "the milestone still settled");
        assertGt(escrow.owed(seller), 0, "the seller is credited");
        u.setBlocked(address(pool), false);
        vm.prank(seller);
        escrow.withdrawOwed();
        assertEq(usdc.balanceOf(seller), 4_962.5e6);
    }
}

/// Random operations across several deals; money must always balance and
/// never reach a stranger.
contract DealEscrowHandler is Test {
    KarwanDealEscrow public escrow;
    BlockUSDC public usdc;
    address public buyer;
    address public seller;
    address public engine;
    address public reviewSafe;
    bytes32[] public ids;

    constructor(KarwanDealEscrow e, BlockUSDC u, address b, address s, address eng, address rs) {
        escrow = e;
        usdc = u;
        buyer = b;
        seller = s;
        engine = eng;
        reviewSafe = rs;
    }

    function open(uint256 amount, uint8 p0) external {
        amount = bound(amount, 1, 50_000e6);
        p0 = uint8(bound(p0, 1, 100));
        DealTerms memory t;
        t.seller = seller;
        t.amount = uint128(amount);
        t.pcts[0] = p0;
        if (p0 < 100) t.pcts[1] = 100 - p0;
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 1 days;
        t.silentLongstop = 5 days;
        t.agreementHash = keccak256("a");
        usdc.mint(buyer, amount * 2);
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256(abi.encode(ids.length)), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        ids.push(id);
    }

    function _pick(uint256 i) internal view returns (bytes32) {
        return ids[i % ids.length];
    }

    function deliver(uint256 i) external {
        if (ids.length == 0) return;
        vm.prank(seller);
        try escrow.markDelivered(_pick(i), bytes32(0)) {} catch {}
    }

    function release(uint256 i) external {
        if (ids.length == 0) return;
        vm.prank(buyer);
        try escrow.release(_pick(i)) {} catch {}
    }

    function claim(uint256 i) external {
        if (ids.length == 0) return;
        vm.prank(seller);
        try escrow.claim(_pick(i), address(0)) {} catch {}
    }

    function reclaim(uint256 i) external {
        if (ids.length == 0) return;
        vm.prank(buyer);
        try escrow.reclaim(_pick(i), address(0)) {} catch {}
    }

    function disputeAndRule(uint256 i, uint16 bps, bool byBuyer) external {
        if (ids.length == 0) return;
        bytes32 id = _pick(i);
        vm.prank(byBuyer ? buyer : seller);
        try escrow.dispute(id, bytes32(0)) {} catch {}
        vm.prank(engine);
        try escrow.proposeRuling(id, uint16(bound(bps, 0, 10_000)), bytes32(0)) {} catch {}
    }

    function executeRuling(uint256 i) external {
        if (ids.length == 0) return;
        try escrow.executeRuling(_pick(i)) {} catch {}
    }

    function lapse(uint256 i) external {
        if (ids.length == 0) return;
        vm.prank(buyer);
        try escrow.lapseDispute(_pick(i)) {} catch {}
    }

    function block_(bool b) external { usdc.setBlocked(seller, b); }

    function withdrawOwed() external {
        vm.prank(seller);
        try escrow.withdrawOwed() {} catch {}
        vm.prank(buyer);
        try escrow.withdrawOwed() {} catch {}
    }

    function warp(uint256 secs) external { vm.warp(block.timestamp + bound(secs, 0, 4 days)); }
}

contract KarwanDealEscrowInvariantTest is DealEscrowBase {
    DealEscrowHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new DealEscrowHandler(escrow, usdc, buyer, seller, engine, reviewSafe);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        targetContract(address(handler));
    }

    /// Every unit the escrow holds is owed to a live deal or to a credited payee.
    function invariant_BooksBalance() public view {
        assertEq(usdc.balanceOf(address(escrow)) + escrow.parked(), escrow.outstanding() + escrow.owedTotal());
    }

    /// Nothing ever reaches an address outside the deal.
    function invariant_NoStrangerPaid() public view {
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(address(handler)), 0);
        assertEq(usdc.balanceOf(engine), 0);
        assertEq(usdc.balanceOf(reviewSafe), 0);
    }
}

/// The escrow handler plus yield: parking, pool rebalancing into a Teller that
/// can refuse or pause, and payouts that must unpark.
contract DealEscrowYieldHandler is DealEscrowHandler {
    KarwanYieldPool public pool;
    PoolTeller public teller;

    constructor(KarwanDealEscrow e, BlockUSDC u, address b, address s, address eng, address rs, KarwanYieldPool p, PoolTeller t)
        DealEscrowHandler(e, u, b, s, eng, rs)
    {
        pool = p;
        teller = t;
    }

    function park() external { escrow.parkIdle(); }

    function rebalance() external { pool.rebalance(); }

    function tellerTrouble(bool refuseDeposit, bool refuseRedeem) external { teller.setRefuse(refuseDeposit, refuseRedeem); }
}

contract KarwanSuiteYieldInvariantTest is DealEscrowBase {
    DealEscrowYieldHandler handler;
    KarwanYieldPool pool;

    function setUp() public override {
        super.setUp();
        pool = new KarwanYieldPool(address(usdc), 8, address(this));
        PoolToken usyc = new PoolToken();
        // the Teller mints and burns USDC on this token set, so it must be the escrow's USDC
        PoolTeller teller = new PoolTeller(PoolToken(address(usdc)), usyc);
        PoolOracle oracle = new PoolOracle();
        pool.setClient(address(escrow), true);
        pool.setTeller(address(teller), address(usyc), address(oracle));
        pool.setBuffer(1_000, 0);
        escrow.setPool(address(pool));
        escrow.setYieldPolicy(1, 0);
        handler = new DealEscrowYieldHandler(escrow, usdc, buyer, seller, engine, reviewSafe, pool, teller);
        targetContract(address(handler));
    }

    function invariant_EscrowBooksBalanceWithYield() public view {
        assertEq(usdc.balanceOf(address(escrow)) + escrow.parked(), escrow.outstanding() + escrow.owedTotal());
    }

    function invariant_PoolAgreesWithEscrow() public view {
        assertEq(pool.principalOf(address(escrow)), escrow.parked());
    }

    function invariant_NoStrangerPaidWithYield() public view {
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(address(handler)), 0);
    }
}
