// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {JobProps} from "./JobProps.sol";

/// @notice Foundry's run of the Jobs property set.
contract JobInvariantTest is Test {
    JobProps internal p;

    function setUp() public {
        p = new JobProps();
        targetContract(address(p));
    }

    function invariant_books_balance() public view {
        assertTrue(p.property_books_balance());
    }

    function invariant_every_job_holds_exactly_its_money() public view {
        assertTrue(p.property_every_job_holds_exactly_its_money());
    }

    function invariant_the_evaluator_and_outsiders_are_never_paid() public view {
        assertTrue(p.property_the_evaluator_and_outsiders_are_never_paid());
    }

    function invariant_exits_never_revert() public view {
        assertTrue(p.property_exits_never_revert());
    }
}
