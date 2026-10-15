// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";

/// Arc enforces 24,576 bytes; every suite contract keeps 2,048 of headroom.
contract CreAdapterSizeTest is CreFixture {
    function setUp() public {
        _deployCre();
    }

    function test_adapter_fits_with_headroom() public view {
        assertLe(address(adapter).code.length, 24_576 - 2_048);
    }
}
