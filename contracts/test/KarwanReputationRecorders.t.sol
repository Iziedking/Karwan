// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

/// @notice Reputation is long-lived; escrow versions come and go. Old deals
///         settle on the old escrow while new deals open on the new one, so
///         both must be able to record, and nobody else.
contract KarwanReputationRecordersTest is Test {
    KarwanReputation rep;
    address escrowV1 = makeAddr("escrow-v1");
    address escrowV2 = makeAddr("escrow-v2");
    address stranger = makeAddr("stranger");
    address b = makeAddr("b");
    address s = makeAddr("s");

    function setUp() public {
        rep = new KarwanReputation();
        rep.setEscrow(escrowV1);
    }

    function test_R2_AnAddedEscrowVersionRecordsAlongsideTheOld() public {
        rep.setRecorder(escrowV2, true);
        vm.prank(escrowV1);
        rep.recordCompletion(keccak256("old"), b, s, KarwanReputation.Outcome.Success, 100e6);
        vm.prank(escrowV2);
        rep.recordCompletion(keccak256("new"), b, s, KarwanReputation.Outcome.Success, 100e6);
        (uint256 success,,) = rep.scores(s);
        assertEq(success, 2);
    }

    function test_R2_StrangersAndRemovedRecordersCannotWrite() public {
        vm.prank(stranger);
        vm.expectRevert(KarwanReputation.NotEscrow.selector);
        rep.recordCompletion(keccak256("x"), b, s, KarwanReputation.Outcome.Success, 100e6);

        rep.setRecorder(escrowV2, true);
        rep.setRecorder(escrowV2, false);
        vm.prank(escrowV2);
        vm.expectRevert(KarwanReputation.NotEscrow.selector);
        rep.recordResolution(keccak256("y"), b, s, 5_000, 100e6);
    }

    function test_R2_OnlyTheOwnerManagesRecorders() public {
        vm.prank(stranger);
        vm.expectRevert(KarwanReputation.NotOwner.selector);
        rep.setRecorder(stranger, true);
    }
}
