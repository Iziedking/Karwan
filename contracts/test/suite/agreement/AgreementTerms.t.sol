// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementTermsLib} from "../../../src/suite/agreement/AgreementTermsLib.sol";

contract AgreementTermsTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function _refused(AgreementTerms memory t) internal {
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("t"), t);
    }

    function test_default_terms_fund() public {
        _fund(_terms(), bytes32("ok"));
    }

    function test_twelve_tranches_fund() public {
        AgreementTerms memory t = _terms();
        for (uint256 i; i < 12; ++i) t.trancheBps[i] = i < 11 ? 800 : 1_200;
        _fund(t, bytes32("twelve"));
        assertEq(escrow.getDeal(escrow.dealIdFor(buyer, bytes32("twelve"))).count, 12);
    }

    function test_tranches_must_sum_to_the_whole_without_gaps() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 9_999;
        _refused(t);
        t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[2] = 5_000;
        _refused(t);
    }

    function test_price_and_seller_are_required() public {
        AgreementTerms memory t = _terms();
        t.amount = 0;
        _refused(t);
    }

    function test_accept_by_must_be_ahead() public {
        AgreementTerms memory t = _terms();
        t.acceptBy = uint64(block.timestamp);
        _refused(t);
    }

    function test_review_window_within_bounds() public {
        AgreementTerms memory t = _terms();
        t.reviewWindow = 59 minutes;
        _refused(t);
        t.reviewWindow = 31 days;
        _refused(t);
    }

    function test_review_on_arrival_or_check_needs_a_longstop() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        _refused(t);
    }

    function test_check_needs_a_verifier_and_a_policy_and_only_checks_have_one() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 2 days;
        _refused(t);
        t = _terms();
        t.verifier = makeAddr("verifier");
        _refused(t);
    }

    function test_unregistered_verifier_is_refused() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 2 days;
        t.verifier = makeAddr("unregistered");
        t.checkPolicy = keccak256("policy");
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("v"), t);
    }

    function test_extensions_bounded() public {
        AgreementTerms memory t = _terms();
        t.extensionSecs = 4 days;
        _refused(t);
        t = _terms();
        t.maxExtensions = 4;
        _refused(t);
    }

    function test_silence_longstop_covers_review_and_extensions() public {
        AgreementTerms memory t = _terms();
        t.silentLongstop = 4 days;
        _refused(t);
    }

    function test_deadline_must_be_ahead() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = uint64(block.timestamp);
        _refused(t);
    }

    function test_agreement_hash_required_and_partial_below_whole() public {
        AgreementTerms memory t = _terms();
        t.agreementHash = bytes32(0);
        _refused(t);
        t = _terms();
        t.partialBps = 10_000;
        _refused(t);
    }

    function test_high_value_needs_buyer_final_release_and_a_check() public {
        hub.setAsset(address(usdc), true, 50e6);
        _refused(_terms());
    }

    function test_every_deal_needs_a_deadline() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = 0;
        _refused(t);
        t.silenceOutcome = 1;
        _refused(t);
    }

    function test_deadline_comes_after_the_accept_deadline() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = t.acceptBy;
        _refused(t);
    }

    function test_silence_longstop_covers_the_start_longstop_too() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 10 days;
        _refused(t);
    }
}
