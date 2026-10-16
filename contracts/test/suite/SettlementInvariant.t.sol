// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SettlementProps} from "./SettlementProps.sol";

/// @notice Foundry's run of the settlement base property set.
contract SettlementInvariantTest is Test {
    SettlementProps internal p;

    function setUp() public {
        p = new SettlementProps();
        targetContract(address(p));
    }

    function invariant_books_balance_per_asset() public view {
        assertTrue(p.property_books_balance_per_asset());
    }

    function invariant_held_is_the_sum_of_deal_balances_per_asset() public view {
        assertTrue(p.property_held_is_the_sum_of_deal_balances_per_asset());
    }

    function invariant_no_stranger_is_ever_paid() public view {
        assertTrue(p.property_no_stranger_is_ever_paid());
    }

    function invariant_fees_within_rate_per_asset() public view {
        assertTrue(p.property_fees_within_rate_per_asset());
    }

    function invariant_assignee_never_gets_more_than_assigned() public view {
        assertTrue(p.property_assignee_never_gets_more_than_assigned());
    }

    function invariant_exits_never_revert_paused_blocked_held_or_assigned() public view {
        assertTrue(p.property_exits_never_revert_paused_blocked_held_or_assigned());
    }
}
