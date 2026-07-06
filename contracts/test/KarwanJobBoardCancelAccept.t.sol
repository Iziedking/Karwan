// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";

/// @title KarwanJobBoard — cancelAccept (un-wedge an accepted-but-unfunded job)
/// @notice Exploit-first gates for the recovery path. acceptBid and the escrow's
///         separate fund call are two transactions; when the fund fails (a short
///         buyer agent), the job is left Accepted with an empty escrow and a
///         re-accept reverts JobNotOpen, stranding the deal forever. cancelAccept
///         returns such a job to Posted so the match can be retried. The first
///         test reproduces the wedge and proves recovery; the rest lock the
///         access, state, and window guards.
contract KarwanJobBoardCancelAcceptTest is Test {
    KarwanJobBoard board;
    address buyer = makeAddr("buyer");
    address sellerA = makeAddr("sellerA");
    address sellerB = makeAddr("sellerB");
    address stranger = makeAddr("stranger");
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

    function _bid(address seller, uint256 price) internal {
        vm.prank(seller);
        board.submitBid(jobId, price, uint64(block.timestamp + 10 days));
    }

    function _accept(address seller) internal {
        vm.prank(buyer);
        board.acceptBid(jobId, seller);
    }

    function _state() internal view returns (KarwanJobBoard.JobState s) {
        (,,,, s,,,) = board.jobs(jobId);
    }

    function _acceptedSeller() internal view returns (address a) {
        (,,,,, a,,) = board.jobs(jobId);
    }

    // =============== the wedge, reproduced and recovered ================

    /// The exact strand: a bid is accepted (Accepted), the off-chain fund then
    /// fails, and a naive re-accept reverts JobNotOpen. cancelAccept reopens the
    /// job so the retry funds cleanly.
    function test_CancelAccept_ReopensWedgedAcceptForRetry() public {
        _post();
        _bid(sellerA, 450e18);
        _accept(sellerA);
        assertEq(uint256(_state()), uint256(KarwanJobBoard.JobState.Accepted));

        // Fund failed off chain. Without cancelAccept, a re-accept is dead:
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.acceptBid(jobId, sellerA);

        // Recover: un-accept back to Posted.
        vm.expectEmit(true, false, false, false);
        emit KarwanJobBoard.AcceptCancelled(jobId);
        vm.prank(buyer);
        board.cancelAccept(jobId);
        assertEq(uint256(_state()), uint256(KarwanJobBoard.JobState.Posted));

        // The retry now succeeds.
        _accept(sellerA);
        assertEq(uint256(_state()), uint256(KarwanJobBoard.JobState.Accepted));
        assertEq(_acceptedSeller(), sellerA);
    }

    function test_CancelAccept_ClearsAcceptedSeller() public {
        _post();
        _bid(sellerA, 450e18);
        _accept(sellerA);
        assertEq(_acceptedSeller(), sellerA);

        vm.prank(buyer);
        board.cancelAccept(jobId);
        assertEq(_acceptedSeller(), address(0));
    }

    /// After reopening, the buyer may match a different seller (the first one's
    /// fund failed, so try another). The escrow's own AlreadyFunded guard, not
    /// this record, is what prevents any double funding.
    function test_CancelAccept_AllowsReAcceptDifferentSeller() public {
        _post();
        _bid(sellerA, 450e18);
        _bid(sellerB, 460e18);
        _accept(sellerA);

        vm.prank(buyer);
        board.cancelAccept(jobId);

        _accept(sellerB);
        assertEq(_acceptedSeller(), sellerB);
    }

    // ============================ guards ================================

    function test_CancelAccept_RevertsForNonBuyer() public {
        _post();
        _bid(sellerA, 450e18);
        _accept(sellerA);
        vm.prank(stranger);
        vm.expectRevert(KarwanJobBoard.NotJobBuyer.selector);
        board.cancelAccept(jobId);
    }

    /// A seller cannot reopen a match the buyer accepted.
    function test_CancelAccept_RevertsForSeller() public {
        _post();
        _bid(sellerA, 450e18);
        _accept(sellerA);
        vm.prank(sellerA);
        vm.expectRevert(KarwanJobBoard.NotJobBuyer.selector);
        board.cancelAccept(jobId);
    }

    function test_CancelAccept_RevertsOnPostedJob() public {
        _post();
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.cancelAccept(jobId);
    }

    function test_CancelAccept_RevertsOnUnknownJob() public {
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.JobNotOpen.selector);
        board.cancelAccept(keccak256("nope"));
    }

    /// Past the match window, reopening is closed: expireJob is the only path,
    /// so a late accept can never be revived after the window shuts.
    function test_CancelAccept_RevertsAfterWindowClosed() public {
        _post();
        _bid(sellerA, 450e18);
        _accept(sellerA);
        vm.warp(deadline + 1);
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.MatchWindowClosed.selector);
        board.cancelAccept(jobId);
    }
}
