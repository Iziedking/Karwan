// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

contract AgreementCodeSplitTest is AgreementFixture {
    /// Codes are 32 random bytes carried in a QR code or link, never a short
    /// number: the code's hash is public, so a short code can be guessed.
    bytes32 internal constant CODE = keccak256("random 32-byte handover code");

    function setUp() public {
        _deployAgreement();
    }

    function _codeTerms(bytes32 salt) internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.codeHash = keccak256(abi.encode(escrow.dealIdFor(buyer, salt), CODE));
    }

    function test_the_right_code_pays_the_seller() public {
        bytes32 id = _fundAccepted(_codeTerms(bytes32("p")), bytes32("p"));
        vm.prank(seller);
        escrow.submitCode(id, CODE);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_a_courier_with_the_code_pays_the_seller() public {
        bytes32 id = _fundAccepted(_codeTerms(bytes32("p")), bytes32("p"));
        vm.prank(stranger);
        escrow.submitCode(id, CODE);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_a_wrong_code_pays_nothing() public {
        bytes32 id = _fundAccepted(_codeTerms(bytes32("p")), bytes32("p"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.submitCode(id, bytes32("guess"));
    }

    function test_a_code_is_used_once() public {
        AgreementTerms memory t = _codeTerms(bytes32("p"));
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        bytes32 id = _fundAccepted(t, bytes32("p"));
        vm.startPrank(seller);
        escrow.submitCode(id, CODE);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.submitCode(id, CODE);
        vm.stopPrank();
    }

    function test_deals_without_a_code_refuse_one() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("p"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.submitCode(id, CODE);
    }

    function test_a_hold_stops_the_code_payment() public {
        bytes32 id = _fundAccepted(_codeTerms(bytes32("p")), bytes32("p"));
        vm.prank(guardian);
        escrow.hold(id, bytes32("fraud"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.OnHold.selector);
        escrow.submitCode(id, CODE);
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
}
