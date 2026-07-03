// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";

contract KarwanJobBoardTest is Test {
    KarwanJobBoard board;
    address buyer = makeAddr("buyer");
    address sellerA = makeAddr("sellerA");
    address sellerB = makeAddr("sellerB");
    bytes32 constant JOB_ID = keccak256("job-1");

    function setUp() public {
        board = new KarwanJobBoard();
    }

    function test_PostJob_EmitsAndStores() public {
        vm.prank(buyer);
        vm.expectEmit(true, true, false, true);
        emit KarwanJobBoard.JobPosted(JOB_ID, buyer, 500e18, uint64(block.timestamp + 7 days), "hash");
        board.postJob(JOB_ID, 500e18, uint64(block.timestamp + 7 days), "hash");
    }

    function test_PostJob_RevertsOnDuplicate() public {
        vm.startPrank(buyer);
        board.postJob(JOB_ID, 500e18, uint64(block.timestamp + 7 days), "hash");
        vm.expectRevert(KarwanJobBoard.JobAlreadyExists.selector);
        board.postJob(JOB_ID, 600e18, uint64(block.timestamp + 7 days), "hash");
        vm.stopPrank();
    }

    function test_SubmitBid_Works() public {
        vm.prank(buyer);
        board.postJob(JOB_ID, 500e18, uint64(block.timestamp + 7 days), "hash");
        vm.prank(sellerA);
        board.submitBid(JOB_ID, 450e18, uint64(block.timestamp + 5 days));
        (address s, uint256 p,, bool exists) = board.bids(JOB_ID, sellerA);
        assertEq(s, sellerA);
        assertEq(p, 450e18);
        assertTrue(exists);
    }

    function test_CounterAndAccept_FullNegotiation() public {
        vm.prank(buyer);
        board.postJob(JOB_ID, 500e18, uint64(block.timestamp + 7 days), "hash");

        vm.prank(sellerA);
        board.submitBid(JOB_ID, 480e18, uint64(block.timestamp + 5 days));

        vm.prank(buyer);
        board.counterOffer(JOB_ID, sellerA, 420e18, uint64(block.timestamp + 5 days));

        vm.prank(sellerA);
        board.respondToCounter(JOB_ID, true, 0, 0);

        vm.prank(buyer);
        board.acceptBid(JOB_ID, sellerA);

        (,,,, KarwanJobBoard.JobState state, address acceptedSeller, uint256 acceptedPrice,) =
            board.jobs(JOB_ID);
        assertEq(uint256(state), uint256(KarwanJobBoard.JobState.Accepted));
        assertEq(acceptedSeller, sellerA);
        assertEq(acceptedPrice, 420e18);
    }

    // Audit L-2: a counter with a past (or zero) deadline is rejected at source.
    function test_CounterOffer_RejectsPastDeadline() public {
        vm.prank(buyer);
        board.postJob(JOB_ID, 500e18, uint64(block.timestamp + 7 days), "hash");
        vm.prank(sellerA);
        board.submitBid(JOB_ID, 480e18, uint64(block.timestamp + 5 days));

        vm.warp(block.timestamp + 1 days);
        vm.prank(buyer);
        vm.expectRevert(KarwanJobBoard.InvalidCounter.selector);
        board.counterOffer(JOB_ID, sellerA, 420e18, uint64(block.timestamp - 1));
    }

    function test_RespondToCounter_RejectsPastReCounter() public {
        vm.prank(buyer);
        board.postJob(JOB_ID, 500e18, uint64(block.timestamp + 7 days), "hash");
        vm.prank(sellerA);
        board.submitBid(JOB_ID, 480e18, uint64(block.timestamp + 5 days));
        vm.prank(buyer);
        board.counterOffer(JOB_ID, sellerA, 420e18, uint64(block.timestamp + 5 days));

        vm.prank(sellerA);
        vm.expectRevert(KarwanJobBoard.InvalidCounter.selector);
        board.respondToCounter(JOB_ID, false, 430e18, uint64(block.timestamp - 1));
    }
}
