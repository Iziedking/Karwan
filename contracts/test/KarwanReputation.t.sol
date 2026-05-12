// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

contract KarwanReputationTest is Test {
    KarwanReputation rep;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");

    function setUp() public {
        rep = new KarwanReputation();
    }

    function test_BuyerRatesSeller_Success() public {
        bytes32 jobId = keccak256("job-1");
        vm.prank(buyer);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
        (uint256 success,,) = rep.scores(seller);
        assertEq(success, 1);
        assertEq(rep.getReputationScore(seller), 10000);
    }

    function test_NeutralScoreForUnknownParty() public view {
        assertEq(rep.getReputationScore(seller), 5000);
    }

    function test_AntiSelfDealing_RevertsIfNotParty() public {
        bytes32 jobId = keccak256("job-1");
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(KarwanReputation.NotParty.selector);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
    }

    function test_DuplicateRecord_Reverts() public {
        bytes32 jobId = keccak256("job-1");
        vm.startPrank(buyer);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
        vm.expectRevert(KarwanReputation.AlreadyRecorded.selector);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
        vm.stopPrank();
    }
}
