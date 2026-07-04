// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";

/// @title KarwanJobBoard v2b — match-accept window + expireJob
/// @notice Exploit-first gates for the on-chain match window: a job that misses
///         its accept deadline funds nobody and reaches a terminal Expired
///         state permissionlessly. Mirrors DEAL_TIMING_V2 decision #4 (expireJob
///         on-chain) and the "miss the window -> nothing funded" goal.
contract KarwanJobBoardExpiryTest is Test {
    KarwanJobBoard board;
    address buyer = makeAddr("buyer");
    address sellerA = makeAddr("sellerA");
    address keeper = makeAddr("keeper");
    bytes32 constant SALT = keccak256("job-1");
    bytes32 jobId;
    uint64 deadline;

    function setUp() public {
        board = new KarwanJobBoard();
        jobId = keccak256(abi.encode(buyer, SALT));
        deadline = uint64(block.timestamp + 7 days);
    }

    function _post() internal {
        vm.prank(buyer);
        board.postJob(SALT, 500e18, deadline, "hash");
    }

    function _state() internal view returns (KarwanJobBoard.JobState s) {
        (,,,, s,,,) = board.jobs(jobId);
    }

    // ========================= expireJob happy path =====================

    function test_ExpireJob_MovesPostedToExpiredAfterDeadline() public {
        _post();
        vm.warp(deadline + 1);
        vm.expectEmit(true, false, false, false);
        emit KarwanJobBoard.JobExpired(jobId);
        // Permissionless: a keeper who is neither buyer nor seller can clean up.
        vm.prank(keeper);
        board.expireJob(jobId);
        assertEq(uint256(_state()), uint256(KarwanJobBoard.JobState.Expired));
    }

    function test_ExpireJob_AtExactDeadlineSucceeds() public {
        _post();
        vm.warp(deadline); // boundary: window closed at exactly the deadline
        board.expireJob(jobId);
        assertEq(uint256(_state()), uint256(KarwanJobBoard.JobState.Expired));
    }

    // ============================ guards ================================

    function test_ExpireJob_RevertsBeforeDeadline() public {
        _post();
        vm.warp(deadline - 1);
        vm.expectRevert(KarwanJobBoard.MatchWindowOpen.selector);
        board.expireJob(jobId);
    }

    function test_ExpireJob_RevertsOnUnknownJob() public {
        vm.warp(deadline + 1);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.expireJob(keccak256("nope"));
    }

    function test_ExpireJob_NotReExpirable() public {
        _post();
        vm.warp(deadline + 1);
        board.expireJob(jobId);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.expireJob(jobId);
    }

    // =============== the core "nothing funded" invariant ================

    /// A bid can outlive the job's match window. After the window closes, even a
    /// still-valid bid cannot be accepted — the match window is authoritative,
    /// so a late accept can't slip through before an expireJob call.
    function test_AcceptBid_RevertsAfterMatchWindow_EvenWithValidBid() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 450e18, uint64(block.timestamp + 10 days)); // outlives the job window

        vm.warp(deadline + 1 days); // past job window, bid still valid
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.MatchWindowClosed.selector);
        board.acceptBid(jobId, sellerA);
    }

    function test_AcceptBid_AtExactDeadlineReverts() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 450e18, uint64(block.timestamp + 10 days));
        vm.warp(deadline); // boundary consistency with expireJob
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.MatchWindowClosed.selector);
        board.acceptBid(jobId, sellerA);
    }

    /// Once expired, every downstream mutation is dead: no bid, no accept.
    function test_ExpiredJob_BlocksBidAndAccept() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 450e18, uint64(block.timestamp + 10 days));
        vm.warp(deadline + 1);
        board.expireJob(jobId);

        vm.prank(sellerA);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.submitBid(jobId, 400e18, uint64(block.timestamp + 5 days));

        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.acceptBid(jobId, sellerA);
    }

    /// A job accepted in-window is not expirable (it left Posted).
    function test_ExpireJob_RevertsOnAcceptedJob() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 450e18, uint64(block.timestamp + 5 days));
        vm.prank(buyer);
        board.acceptBid(jobId, sellerA);

        vm.warp(deadline + 1);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.expireJob(jobId);
    }
}
