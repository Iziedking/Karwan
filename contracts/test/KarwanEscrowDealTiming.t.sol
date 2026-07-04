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

/// @title Escrow v2b deal-timing — seller-appeal two-step, capped at 3
/// @notice Exploit-first gates for DEAL_TIMING_V2 decision #1 (block at the cap,
///         explicit dispute, no auto-dispute) and invariant I2 (appeal bound:
///         extensionCount is monotone, never exceeds MAX_EXTENSIONS, and every
///         increment is a buyer approval of a standing seller request).
contract KarwanEscrowDealTimingTest is Test {
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
    uint16 constant MAX_RESERVATION_BPS = 10000;

    uint64 baseDeadline;

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
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        baseDeadline = uint64(block.timestamp) + 10 days;
    }

    function _pcts() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50;
        p[1] = 50;
    }

    /// Casual (no-stake) deal with a live delivery clock, seller accepted.
    function _fundAndAccept() internal {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _pcts(), 0,
            KarwanEscrow.Timing({deliveryDeadline: baseDeadline, reviewWindow: 0, reclaimGrace: 1 days})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    function _dd() internal view returns (uint64) {
        return escrow.getEscrow(JOB_ID).deliveryDeadline;
    }

    function _extCount() internal view returns (uint8) {
        return escrow.getEscrow(JOB_ID).extensionCount;
    }

    // ===================== two-step happy path ==========================

    function test_Request_RecordsPending_DoesNotMoveClock() public {
        _fundAndAccept();
        uint64 want = baseDeadline + 2 days;
        vm.expectEmit(true, false, false, true);
        emit KarwanEscrow.ExtensionRequested(JOB_ID, want);
        vm.prank(seller);
        escrow.requestExtension(JOB_ID, want);
        assertEq(_dd(), baseDeadline, "live clock unchanged until approval");
        assertEq(escrow.getEscrow(JOB_ID).pendingDeadline, want, "pending recorded");
        assertEq(_extCount(), 0, "no approval yet");
    }

    function test_Approve_AppliesAndCounts() public {
        _fundAndAccept();
        uint64 want = baseDeadline + 2 days;
        vm.prank(seller);
        escrow.requestExtension(JOB_ID, want);

        vm.expectEmit(true, false, false, true);
        emit KarwanEscrow.DeadlineExtended(JOB_ID, want);
        vm.prank(buyer);
        escrow.approveExtension(JOB_ID);

        assertEq(_dd(), want, "clock moved on approval");
        assertEq(_extCount(), 1, "one approved extension");
        assertEq(escrow.getEscrow(JOB_ID).pendingDeadline, 0, "pending cleared");
    }

    // ========================= access control ===========================

    function test_Request_OnlySeller() public {
        _fundAndAccept();
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.NotSeller.selector);
        escrow.requestExtension(JOB_ID, baseDeadline + 1 days);
    }

    function test_Approve_OnlyBuyer() public {
        _fundAndAccept();
        vm.prank(seller);
        escrow.requestExtension(JOB_ID, baseDeadline + 1 days);
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotBuyer.selector);
        escrow.approveExtension(JOB_ID);
    }

    function test_Approve_NoPendingReverts() public {
        _fundAndAccept();
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.NoPendingExtension.selector);
        escrow.approveExtension(JOB_ID);
    }

    function test_Request_RequiresLiveDeadline() public {
        // Open-ended deal (deliveryDeadline == 0): no clock to extend.
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _pcts(), 0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 0, reclaimGrace: 0})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NoDeadline.selector);
        escrow.requestExtension(JOB_ID, baseDeadline);
    }

    // ==================== forward-only / horizon ========================

    function test_Request_ForwardOnly() public {
        _fundAndAccept();
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.InvalidTiming.selector);
        escrow.requestExtension(JOB_ID, baseDeadline); // not strictly greater
    }

    function test_Request_HorizonBounded() public {
        _fundAndAccept();
        uint64 tooFar = uint64(block.timestamp) + 731 days; // maxDeadlineHorizon default 730d
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.InvalidTiming.selector);
        escrow.requestExtension(JOB_ID, tooFar);
    }

    /// The buyer can push the clock past a stale pending request via a direct
    /// extend; approving the now-stale request must re-validate forward-only and
    /// revert rather than move the clock backward.
    function test_Approve_RevalidatesAgainstInterveningExtend() public {
        _fundAndAccept();
        vm.prank(seller);
        escrow.requestExtension(JOB_ID, baseDeadline + 2 days);
        vm.prank(buyer);
        escrow.extendDeadline(JOB_ID, baseDeadline + 5 days); // now past the pending
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidTiming.selector);
        escrow.approveExtension(JOB_ID);
    }

    // =============== I2 + decision #1: cap and block =====================

    /// The appeal bound: three approved extensions max; the 4th REQUEST is
    /// blocked (no auto-dispute), and the deal stays Accepted.
    function test_Cap_BlocksFourthRequest_NoAutoDispute() public {
        _fundAndAccept();
        for (uint256 i = 1; i <= 3; i++) {
            uint64 want = baseDeadline + uint64(i) * 1 days;
            vm.prank(seller);
            escrow.requestExtension(JOB_ID, want);
            vm.prank(buyer);
            escrow.approveExtension(JOB_ID);
        }
        assertEq(_extCount(), 3, "capped at three approvals");

        // 4th request is blocked, and the deal is NOT auto-disputed.
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.ExtensionsExhausted.selector);
        escrow.requestExtension(JOB_ID, baseDeadline + 4 days);
        assertEq(uint256(escrow.getEscrow(JOB_ID).state), uint256(KarwanEscrow.EscrowState.Accepted), "still Accepted");
    }

    /// Even a standing pending request cannot be approved past the cap.
    function test_Cap_BlocksApprovalPastThree() public {
        _fundAndAccept();
        for (uint256 i = 1; i <= 3; i++) {
            vm.prank(seller);
            escrow.requestExtension(JOB_ID, baseDeadline + uint64(i) * 1 days);
            vm.prank(buyer);
            escrow.approveExtension(JOB_ID);
        }
        // A request at the cap already reverts, so there can be no 4th approval.
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.ExtensionsExhausted.selector);
        escrow.requestExtension(JOB_ID, baseDeadline + 9 days);
        assertEq(_extCount(), 3, "count never exceeds MAX_EXTENSIONS");
    }

    /// Decision #1: after the appeal is exhausted, the seller's recourse is an
    /// explicit dispute, which is reachable and the arbiter can award the seller.
    function test_Cap_ThenDisputeIsReachable() public {
        _fundAndAccept();
        for (uint256 i = 1; i <= 3; i++) {
            vm.prank(seller);
            escrow.requestExtension(JOB_ID, baseDeadline + uint64(i) * 1 days);
            vm.prank(buyer);
            escrow.approveExtension(JOB_ID);
        }
        vm.prank(seller);
        escrow.dispute(JOB_ID, "appeal exhausted");
        assertEq(uint256(escrow.getEscrow(JOB_ID).state), uint256(KarwanEscrow.EscrowState.Disputed));

        vm.prank(arbiter);
        escrow.resolve(JOB_ID, 10000, keccak256("for the seller"));
        // 500 deal at 1.5% fee: sellerNet = 500 - (7.5/2) = 496.25; a full
        // seller-favoured ruling pays the entire remaining sellerNet.
        assertEq(usdc.balanceOf(seller), 496.25e18, "seller paid out");
    }

    // ============ buyer-direct extend stays uncapped ====================

    /// The MAX_EXTENSIONS cap governs seller appeals only; the buyer may keep
    /// voluntarily extending (it only favours the seller) without touching the
    /// appeal counter.
    function test_BuyerDirectExtend_Uncapped_DoesNotConsumeAppealSlots() public {
        _fundAndAccept();
        for (uint256 i = 1; i <= 5; i++) {
            vm.prank(buyer);
            escrow.extendDeadline(JOB_ID, baseDeadline + uint64(i) * 1 days);
        }
        assertEq(_dd(), baseDeadline + 5 days, "buyer extended freely");
        assertEq(_extCount(), 0, "buyer generosity never consumes the seller-appeal cap");

        // And the seller can still appeal afterwards, up to the cap.
        vm.prank(seller);
        escrow.requestExtension(JOB_ID, baseDeadline + 6 days);
        vm.prank(buyer);
        escrow.approveExtension(JOB_ID);
        assertEq(_extCount(), 1);
    }

    function test_ExtendDeadline_StillBuyerOnly() public {
        _fundAndAccept();
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotBuyer.selector);
        escrow.extendDeadline(JOB_ID, baseDeadline + 1 days);
    }
}
