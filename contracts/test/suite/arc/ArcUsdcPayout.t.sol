// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {TestFamily} from "../mocks/TestFamily.sol";

/// @notice Runs only against Arc Foundry forking Arc testnet
///         (`forge-remote.sh --arc`), where USDC is Arc's own system token, a
///         native balance is its USDC balance, and the blocklist is real.
contract ArcUsdcPayoutTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    KarwanHub internal hub;
    TestFamily internal family;
    address internal payer = makeAddr("arcPayer");
    address internal payee = makeAddr("arcPayee");

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        hub = new KarwanHub(address(this));
        KarwanIdentityRegistry identity = new KarwanIdentityRegistry(address(hub));
        KarwanRecord record = new KarwanRecord(address(hub));
        hub.wire(address(identity), address(record), makeAddr("stakeVault"));
        family = new TestFamily(address(hub));
        hub.setFeeRecipient(makeAddr("fee"));
        hub.setGuardian(makeAddr("guardian"));
        hub.setReviewers(makeAddr("review"), makeAddr("senior"));
        hub.setAsset(address(USDC), true, 5_000e6);
        hub.registerFamily(address(family), 100);
        hub.setCaps(address(family), address(USDC), 1_000e6, 10_000e6);
        vm.deal(payer, 100 ether);
        assertEq(USDC.balanceOf(payer), 100e6);
        vm.prank(payer);
        USDC.approve(address(family), type(uint256).max);
    }

    function _deal(bytes32 id, address to) internal {
        address[] memory p = new address[](1);
        p[0] = to;
        vm.startPrank(payer);
        family.open(id, address(USDC), p, uint64(block.timestamp + 30 days));
        family.fund(id, 10e6);
        vm.stopPrank();
    }

    function test_payout_arrives_through_arc_usdc() public {
        _deal(bytes32("arc-ok"), payee);
        family.pay(bytes32("arc-ok"), payee, 10e6);
        assertEq(USDC.balanceOf(payee), 10e6);
    }

    function test_payout_to_a_blocklisted_address_becomes_owed() public {
        _deal(bytes32("arc-blocked"), BLOCKED);
        family.pay(bytes32("arc-blocked"), BLOCKED, 10e6);
        assertEq(family.owed(address(USDC), BLOCKED), 10e6);
        assertEq(USDC.balanceOf(address(family)), 10e6);
        assertEq(family.held(address(USDC)) + family.owedTotal(address(USDC)), 10e6);
    }

    function test_native_value_is_refused() public {
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        (bool ok,) = address(family).call{value: 1}("");
        assertFalse(ok);
    }
}
