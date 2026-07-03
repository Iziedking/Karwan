// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";

contract KarwanJobBoardTest is Test {
    KarwanJobBoard board;
    address buyer = makeAddr("buyer");
    address sellerA = makeAddr("sellerA");
    address sellerB = makeAddr("sellerB");
    // v2 (L-1): postJob takes a SALT; the jobId is derived keccak256(poster,salt).
    bytes32 constant SALT = keccak256("job-1");
    bytes32 jobId;

    function setUp() public {
        board = new KarwanJobBoard();
        jobId = keccak256(abi.encode(buyer, SALT));
    }

    function _post() internal {
        vm.prank(buyer);
        board.postJob(SALT, 500e18, uint64(block.timestamp + 7 days), "hash");
    }

    function test_PostJob_DerivesNamespacedId_EmitsAndStores() public {
        vm.prank(buyer);
        vm.expectEmit(true, true, false, true);
        emit KarwanJobBoard.JobPosted(jobId, buyer, 500e18, uint64(block.timestamp + 7 days), "hash");
        bytes32 returned = board.postJob(SALT, 500e18, uint64(block.timestamp + 7 days), "hash");
        assertEq(returned, jobId, "returns the derived id");
        assertEq(board.deriveJobId(buyer, SALT), jobId, "helper matches");
    }

    /// L-1: the same salt from a DIFFERENT poster yields a different jobId, so
    /// one buyer can never squat or collide with another's job.
    function test_PostJob_SaltIsNamespacedPerPoster() public {
        _post(); // buyer posts with SALT
        // sellerB (a different address) posting the SAME salt lands a distinct
        // jobId and does not collide.
        vm.prank(sellerB);
        bytes32 other = board.postJob(SALT, 100e18, uint64(block.timestamp + 7 days), "hash");
        assertTrue(other != jobId, "same salt, different poster -> different id");
        assertEq(other, keccak256(abi.encode(sellerB, SALT)));
    }

    function test_PostJob_RevertsOnDuplicate() public {
        _post();
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.JobAlreadyExists.selector);
        board.postJob(SALT, 600e18, uint64(block.timestamp + 7 days), "hash");
    }

    function test_SubmitBid_Works() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 450e18, uint64(block.timestamp + 5 days));
        (address s, uint256 p,, bool exists) = board.bids(jobId, sellerA);
        assertEq(s, sellerA);
        assertEq(p, 450e18);
        assertTrue(exists);
    }

    function test_CounterAndAccept_FullNegotiation() public {
        _post();

        vm.prank(sellerA);
        board.submitBid(jobId, 480e18, uint64(block.timestamp + 5 days));

        vm.prank(buyer);
        board.counterOffer(jobId, sellerA, 420e18, uint64(block.timestamp + 5 days));

        vm.prank(sellerA);
        board.respondToCounter(jobId, true, 0, 0);

        vm.prank(buyer);
        board.acceptBid(jobId, sellerA);

        (,,,, KarwanJobBoard.JobState state, address acceptedSeller, uint256 acceptedPrice,) =
            board.jobs(jobId);
        assertEq(uint256(state), uint256(KarwanJobBoard.JobState.Accepted));
        assertEq(acceptedSeller, sellerA);
        assertEq(acceptedPrice, 420e18);
    }

    // Audit L-2: a counter with a past (or zero) deadline is rejected at source.
    function test_CounterOffer_RejectsPastDeadline() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 480e18, uint64(block.timestamp + 5 days));

        vm.warp(block.timestamp + 1 days);
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.InvalidCounter.selector);
        board.counterOffer(jobId, sellerA, 420e18, uint64(block.timestamp - 1));
    }

    function test_RespondToCounter_RejectsPastReCounter() public {
        _post();
        vm.prank(sellerA);
        board.submitBid(jobId, 480e18, uint64(block.timestamp + 5 days));
        vm.prank(buyer);
        board.counterOffer(jobId, sellerA, 420e18, uint64(block.timestamp + 5 days));

        vm.prank(sellerA);
        vm.expectRevert(KarwanJobBoard.InvalidCounter.selector);
        board.respondToCounter(jobId, false, 430e18, uint64(block.timestamp - 1));
    }
}
