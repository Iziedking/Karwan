// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StakeVaultProps} from "./StakeVaultProps.sol";

/// @notice Foundry's run of the stake vault property set.
contract StakeVaultInvariantTest is Test {
    StakeVaultProps internal p;

    function setUp() public {
        p = new StakeVaultProps();
        targetContract(address(p));
    }

    function invariant_the_vault_holds_exactly_its_stake_and_owed_balances() public view {
        assertTrue(p.property_the_vault_holds_exactly_its_stake_and_owed_balances());
    }

    function invariant_reserved_and_cooling_stake_never_exceeds_the_stake() public view {
        assertTrue(p.property_reserved_and_cooling_stake_never_exceeds_the_stake());
    }

    function invariant_reservations_add_up_to_what_is_reserved() public view {
        assertTrue(p.property_reservations_add_up_to_what_is_reserved());
    }

    function invariant_nobody_but_the_beneficiary_is_paid_by_a_slash() public view {
        assertTrue(p.property_nobody_but_the_beneficiary_is_paid_by_a_slash());
    }
}
