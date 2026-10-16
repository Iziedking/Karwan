// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {YieldProps} from "./YieldProps.sol";

/// @notice Foundry's run of the yield pool property set.
contract YieldInvariantTest is Test {
    YieldProps internal p;

    function setUp() public {
        p = new YieldProps();
        targetContract(address(p));
    }

    function invariant_family_books_balance_with_parked_money() public view {
        assertTrue(p.property_family_books_balance_with_parked_money());
    }

    function invariant_the_pool_knows_exactly_what_the_family_parked() public view {
        assertTrue(p.property_the_pool_knows_exactly_what_the_family_parked());
    }

    function invariant_the_pool_covers_what_families_parked() public view {
        assertTrue(p.property_the_pool_covers_what_families_parked());
    }

    function invariant_exits_never_revert() public view {
        assertTrue(p.property_exits_never_revert());
    }

    function invariant_only_parties_and_the_fee_recipient_are_paid() public view {
        assertTrue(p.property_only_parties_and_the_fee_recipient_are_paid());
    }
}
