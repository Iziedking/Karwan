// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/console.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";

contract SuiteSizesTest is SuiteFixture {
    uint256 internal constant ARC_LIMIT = 24_576;
    uint256 internal constant HEADROOM = 2_048;

    function setUp() public {
        _deploySuite();
    }

    function test_every_contract_keeps_two_kilobytes_of_headroom() public {
        KarwanTimelock tl = new KarwanTimelock(48 hours, makeAddr("o"), makeAddr("g"));
        _check("KarwanTimelock", address(tl));
        _check("KarwanHub", address(hub));
        _check("KarwanIdentityRegistry", address(identity));
        _check("KarwanRecord", address(record));
        _check("TestFamily (settlement base)", address(family));
    }

    function _check(string memory name, address a) internal view {
        uint256 n = a.code.length;
        console.log(name, n);
        assertLe(n, ARC_LIMIT - HEADROOM, name);
    }
}
