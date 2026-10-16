// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgreementProps} from "./AgreementProps.sol";

/// @notice Foundry's run of the Agreement property set.
contract AgreementInvariantTest is Test {
    AgreementProps internal p;

    function setUp() public {
        p = new AgreementProps();
        targetContract(address(p));
    }

    function invariant_books_balance() public view {
        assertTrue(p.property_books_balance());
    }

    function invariant_ended_deals_hold_nothing_and_open_deals_hold_their_books() public view {
        assertTrue(p.property_ended_deals_hold_nothing_and_open_deals_hold_their_books());
    }

    function invariant_nobody_outside_the_deal_is_paid() public view {
        assertTrue(p.property_nobody_outside_the_deal_is_paid());
    }

    function invariant_fee_never_above_one_percent_of_funding() public view {
        assertTrue(p.property_fee_never_above_one_percent_of_funding());
    }

    function invariant_buyer_release_always_works_on_a_live_deal() public view {
        assertTrue(p.property_buyer_release_always_works_on_a_live_deal());
    }
}
