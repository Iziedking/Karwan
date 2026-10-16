// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";

/// @notice The stake vault's property set, one contract for three fuzzers.
///         Foundry runs it from `StakeVaultInvariant.t.sol`; Medusa and
///         Echidna target it directly.
contract StakeVaultProps is SuiteFixture {
    address[3] public stakers;
    uint256[3] internal keys;
    uint64[3] public ids;
    address public beneficiary = makeAddr("beneficiary");
    address public stranger = makeAddr("stranger");
    bytes32[] public refs;

    constructor() {
        _deploySuite();
        for (uint256 i; i < 3; ++i) {
            (stakers[i], keys[i]) = makeAddrAndKey(string(abi.encodePacked("staker", _digit(i))));
            vm.prank(stakers[i]);
            ids[i] = identity.register();
            usdc.mint(stakers[i], 1_000_000e6);
            vm.prank(stakers[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    // ------------------------------ Properties ----------------------------

    function property_the_vault_holds_exactly_its_stake_and_owed_balances() public view returns (bool) {
        uint256 active;
        for (uint256 i; i < 3; ++i) active += vault.stakeOf(ids[i], address(usdc)).active;
        return usdc.balanceOf(address(vault)) == active + vault.owedTotal(address(usdc));
    }

    function property_reserved_and_cooling_stake_never_exceeds_the_stake() public view returns (bool) {
        for (uint256 i; i < 3; ++i) {
            KarwanStakeVault.Stake memory k = vault.stakeOf(ids[i], address(usdc));
            if (uint256(k.reserved) + k.cooling > k.active) return false;
        }
        return true;
    }

    function property_reservations_add_up_to_what_is_reserved() public view returns (bool) {
        uint256 sum;
        for (uint256 i; i < refs.length; ++i) {
            KarwanStakeVault.Reservation memory r = vault.reservationOf(address(family), refs[i]);
            if (r.active) sum += r.amount;
        }
        uint256 reserved;
        for (uint256 i; i < 3; ++i) reserved += vault.stakeOf(ids[i], address(usdc)).reserved;
        return sum == reserved;
    }

    function property_nobody_but_the_beneficiary_is_paid_by_a_slash() public view returns (bool) {
        return usdc.balanceOf(stranger) == 0;
    }

    // ------------------------------- Actions ------------------------------

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
        bytes32 d = vault.reserveDigest(address(family), ref, address(usdc), a, beneficiary, expiresAt, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i], d);
        vm.prank(address(family));
        try vault.reserve(ref, stakers[i], address(usdc), a, beneficiary, expiresAt, deadline, abi.encodePacked(r, s, v)) {
            refs.push(ref);
        } catch {}
    }

    function slash(uint256 seed, uint256 amount) external {
        if (refs.length == 0) return;
        vm.prank(address(family));
        try vault.slash(refs[seed % refs.length], bound(amount, 0, 10_000e6)) {} catch {}
    }

    function release(uint256 seed) external {
        if (refs.length == 0) return;
        vm.prank(address(family));
        vault.release(refs[seed % refs.length]);
    }

    function extend(uint256 seed, uint256 by) external {
        if (refs.length == 0) return;
        vm.prank(address(family));
        try vault.extend(refs[seed % refs.length], uint64(block.timestamp + bound(by, 1 days, 60 days))) {} catch {}
    }

    function releaseStale(uint256 seed) external {
        if (refs.length == 0) return;
        vm.prank(stranger);
        try vault.releaseStale(address(family), refs[seed % refs.length]) {} catch {}
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
