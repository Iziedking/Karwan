// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {BlocklistToken} from "./mocks/BlocklistToken.sol";

contract StakeVaultHandler is Test {
    KarwanStakeVault internal vault;
    BlocklistToken internal usdc;
    address internal family;
    address[3] public stakers;
    uint256[3] internal keys;
    uint64[3] public ids;
    address public beneficiary = makeAddr("beneficiary");
    address public stranger = makeAddr("stranger");
    bytes32[] public refs;

    constructor(KarwanStakeVault vault_, BlocklistToken usdc_, KarwanIdentityRegistry identity, address family_) {
        vault = vault_;
        usdc = usdc_;
        family = family_;
        for (uint256 i; i < 3; ++i) {
            (stakers[i], keys[i]) = makeAddrAndKey(string(abi.encodePacked("staker", vm.toString(i))));
            vm.prank(stakers[i]);
            ids[i] = identity.register();
            usdc.mint(stakers[i], 1_000_000e6);
            vm.prank(stakers[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    function refCount() external view returns (uint256) {
        return refs.length;
    }

    function stake(uint256 who, uint256 amount) external {
        vm.prank(stakers[who % 3]);
        try vault.stake(address(usdc), bound(amount, 1, 10_000e6)) {} catch {}
    }

    function requestWithdraw(uint256 who, uint256 amount) external {
        vm.prank(stakers[who % 3]);
        try vault.requestWithdraw(address(usdc), bound(amount, 1, 10_000e6)) {} catch {}
    }

    function cancelWithdraw(uint256 who) external {
        vm.prank(stakers[who % 3]);
        try vault.cancelWithdraw(address(usdc)) {} catch {}
    }

    function withdraw(uint256 who) external {
        vm.prank(stakers[who % 3]);
        try vault.withdraw(address(usdc)) {} catch {}
    }

    function reserve(uint256 who, uint256 amount) external {
        uint256 i = who % 3;
        uint128 a = uint128(bound(amount, 1, 5_000e6));
        bytes32 ref = keccak256(abi.encode(refs.length));
        uint64 expiresAt = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = vault.reserveDigest(family, ref, address(usdc), a, beneficiary, expiresAt, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i], d);
        vm.prank(family);
        try vault.reserve(ref, stakers[i], address(usdc), a, beneficiary, expiresAt, deadline, abi.encodePacked(r, s, v)) {
            refs.push(ref);
        } catch {}
    }

    function slash(uint256 seed, uint256 amount) external {
        if (refs.length == 0) return;
        vm.prank(family);
        try vault.slash(refs[seed % refs.length], bound(amount, 0, 10_000e6)) {} catch {}
    }

    function release(uint256 seed) external {
        if (refs.length == 0) return;
        vm.prank(family);
        vault.release(refs[seed % refs.length]);
    }

    function extend(uint256 seed, uint256 by) external {
        if (refs.length == 0) return;
        vm.prank(family);
        try vault.extend(refs[seed % refs.length], uint64(block.timestamp + bound(by, 1 days, 60 days))) {} catch {}
    }

    function releaseStale(uint256 seed) external {
        if (refs.length == 0) return;
        vm.prank(stranger);
        try vault.releaseStale(family, refs[seed % refs.length]) {} catch {}
    }

    function block_(bool on) external {
        usdc.setBlocked(beneficiary, on);
    }

    function withdrawOwed() external {
        vm.prank(beneficiary);
        try vault.withdrawOwed(address(usdc)) {} catch {}
    }

    function wait(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 hours, 10 days));
    }
}

contract StakeVaultInvariantTest is SuiteFixture {
    StakeVaultHandler internal handler;

    function setUp() public {
        _deploySuite();
        handler = new StakeVaultHandler(vault, usdc, identity, address(family));
        targetContract(address(handler));
    }

    function invariant_the_vault_holds_exactly_its_stake_and_owed_balances() public view {
        uint256 active;
        for (uint256 i; i < 3; ++i) active += vault.stakeOf(handler.ids(i), address(usdc)).active;
        assertEq(usdc.balanceOf(address(vault)), active + vault.owedTotal(address(usdc)));
    }

    function invariant_reserved_and_cooling_stake_never_exceeds_the_stake() public view {
        for (uint256 i; i < 3; ++i) {
            KarwanStakeVault.Stake memory k = vault.stakeOf(handler.ids(i), address(usdc));
            assertLe(uint256(k.reserved) + k.cooling, k.active);
        }
    }

    function invariant_reservations_add_up_to_what_is_reserved() public view {
        uint256 sum;
        for (uint256 i; i < handler.refCount(); ++i) {
            KarwanStakeVault.Reservation memory r = vault.reservationOf(address(family), handler.refs(i));
            if (r.active) sum += r.amount;
        }
        uint256 reserved;
        for (uint256 i; i < 3; ++i) reserved += vault.stakeOf(handler.ids(i), address(usdc)).reserved;
        assertEq(sum, reserved);
    }

    function invariant_nobody_but_the_beneficiary_is_paid_by_a_slash() public view {
        assertEq(usdc.balanceOf(handler.stranger()), 0);
    }
}
