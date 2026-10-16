// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TimeProps} from "./TimeProps.sol";

/// @notice Foundry's run of the Time property set.
contract TimeInvariantTest is Test {
    TimeProps internal p;

    function setUp() public {
        p = new TimeProps();
        targetContract(address(p));
    }

    function invariant_books_balance() public view {
        assertTrue(p.property_books_balance());
    }

    function invariant_an_engagement_holds_exactly_its_open_cycles_and_carry() public view {
        assertTrue(p.property_an_engagement_holds_exactly_its_open_cycles_and_carry());
    }

    function invariant_a_cycle_never_pays_more_than_its_budget_or_its_hours() public view {
        assertTrue(p.property_a_cycle_never_pays_more_than_its_budget_or_its_hours());
    }

    function invariant_exits_never_revert() public view {
        assertTrue(p.property_exits_never_revert());
    }

    function invariant_nobody_outside_the_engagement_is_paid() public view {
        assertTrue(p.property_nobody_outside_the_engagement_is_paid());
    }
}
