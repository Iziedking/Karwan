// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

contract AgreementSplitTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function test_both_sides_agree_any_split() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("s"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 2_500);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.acceptSplit(id, 2_500);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.acceptSplit(id, 2_600);
        uint256 before = usdc.balanceOf(buyer);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(escrow), id, sellerId, 1, Outcome.SPLIT, 1, 2_500);
        vm.prank(seller);
        escrow.acceptSplit(id, 2_500);
        uint256 net = PRICE - 0.5e6;
        assertEq(usdc.balanceOf(seller), (net * 2_500) / 10_000);
        assertEq(usdc.balanceOf(feeSafe), 0.25e6);
        assertEq(usdc.balanceOf(buyer), before + PRICE + 0.5e6 - (net * 2_500) / 10_000 - 0.25e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Split));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_strangers_cannot_propose_or_accept() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("s"));
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.proposeSplit(id, 5_000);
        vm.prank(seller);
        escrow.proposeSplit(id, 5_000);
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.acceptSplit(id, 5_000);
    }

    function test_split_after_a_partial_payment_covers_only_what_is_left() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 4_000;
        t.trancheBps[1] = 6_000;
        bytes32 id = _fundAccepted(t, bytes32("s"));
        vm.prank(buyer);
        escrow.release(id);
        vm.prank(seller);
        escrow.proposeSplit(id, 10_000);
        vm.prank(buyer);
        escrow.acceptSplit(id, 10_000);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_a_split_above_the_whole_is_refused() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("s"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadAmount.selector);
        escrow.proposeSplit(id, 10_001);
        assertFalse(escrow.splitOf(id).active);
    }
}
