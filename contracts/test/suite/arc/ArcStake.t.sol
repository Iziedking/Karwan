// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../../../src/suite/KarwanStakeVault.sol";
import {TestFamily} from "../mocks/TestFamily.sol";

/// @notice Stake on Arc's own USDC, against Arc Foundry forking Arc testnet
///         (`forge-remote.sh --arc`): a slash to a blocklisted beneficiary
///         waits as an owed balance and never strands the stake.
contract ArcStakeTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    KarwanHub internal hub;
    KarwanStakeVault internal vault;
    TestFamily internal family;
    address internal staker;
    uint256 internal stakerKey;
    uint64 internal stakerId;

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        hub = new KarwanHub(address(this));
        KarwanIdentityRegistry identity = new KarwanIdentityRegistry(address(hub));
        KarwanRecord record = new KarwanRecord(address(hub));
        vault = new KarwanStakeVault(address(hub));
        hub.wire(address(identity), address(record), address(vault));
        hub.setAsset(address(USDC), true, 5_000e6);
        family = new TestFamily(address(hub));
        hub.registerFamily(address(family), 100);
        (staker, stakerKey) = makeAddrAndKey("arcStaker");
        vm.prank(staker);
        stakerId = identity.register();
        vm.deal(staker, 1_000 ether);
        vm.startPrank(staker);
        USDC.approve(address(vault), type(uint256).max);
        vault.stake(address(USDC), 100e6);
        vm.stopPrank();
    }

    function test_a_slash_to_a_blocklisted_beneficiary_is_owed_on_arc() public {
        bytes32 ref = bytes32("arc-stake");
        uint64 expiresAt = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = vault.reserveDigest(address(family), ref, address(USDC), 40e6, BLOCKED, expiresAt, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(stakerKey, d);
        vm.startPrank(address(family));
        vault.reserve(ref, staker, address(USDC), 40e6, BLOCKED, expiresAt, deadline, abi.encodePacked(r, s, v));
        vault.slash(ref, 40e6);
        vm.stopPrank();
        assertEq(vault.owed(address(USDC), BLOCKED), 40e6);
        assertEq(USDC.balanceOf(address(vault)), 100e6);
        assertEq(vault.stakeOf(stakerId, address(USDC)).active, 60e6);
    }
}
