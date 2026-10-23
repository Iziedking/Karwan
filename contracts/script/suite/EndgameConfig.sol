// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @notice Everything a deploy of the suite needs to know: the Safes that
///         govern it, the beta values it opens with, and who may check
///         deliveries and issue facts.
struct EndgameConfig {
    address usdc;
    uint256 minDelay;
    address ownerSafe;
    address guardianSafe;
    address reviewSafe;
    address seniorSafe;
    address feeRecipient;
    address autoArbiter;
    uint16 feeBps;
    uint128 highValue;
    uint128 perDealCap;
    uint128 totalCap;
    uint64 minReview;
    uint64 maxReview;
    uint64 maxHorizon;
    address[] checkers;
    uint8 checkerThreshold;
    address[] issuers;
}

library EndgameConfigLib {
    /// @notice Reads a config file; a config with any Safe, the fee recipient
    ///         or USDC still unset, a delay below the timelock's floor, or caps
    ///         the hub would refuse never gets as far as a deploy.
    function load(Vm vm, string memory path) internal view returns (EndgameConfig memory c) {
        string memory j = vm.readFile(path);
        c.usdc = vm.parseJsonAddress(j, ".usdc");
        c.minDelay = vm.parseJsonUint(j, ".minDelay");
        c.ownerSafe = vm.parseJsonAddress(j, ".ownerSafe");
        c.guardianSafe = vm.parseJsonAddress(j, ".guardianSafe");
        c.reviewSafe = vm.parseJsonAddress(j, ".reviewSafe");
        c.seniorSafe = vm.parseJsonAddress(j, ".seniorSafe");
        c.feeRecipient = vm.parseJsonAddress(j, ".feeRecipient");
        c.autoArbiter = vm.parseJsonAddress(j, ".autoArbiter");
        c.feeBps = uint16(_upTo(vm, j, "feeBps", type(uint16).max));
        c.highValue = uint128(_upTo(vm, j, "highValue", type(uint128).max));
        c.perDealCap = uint128(_upTo(vm, j, "perDealCap", type(uint128).max));
        c.totalCap = uint128(_upTo(vm, j, "totalCap", type(uint128).max));
        c.minReview = uint64(_upTo(vm, j, "minReview", type(uint64).max));
        c.maxReview = uint64(_upTo(vm, j, "maxReview", type(uint64).max));
        c.maxHorizon = uint64(_upTo(vm, j, "maxHorizon", type(uint64).max));
        c.checkers = vm.parseJsonAddressArray(j, ".checkers");
        c.checkerThreshold = uint8(_upTo(vm, j, "checkerThreshold", type(uint8).max));
        c.issuers = vm.parseJsonAddressArray(j, ".issuers");
        require(c.usdc != address(0), "config: usdc unset");
        require(c.ownerSafe != address(0) && c.guardianSafe != address(0), "config: owner or guardian Safe unset");
        require(c.reviewSafe != address(0) && c.seniorSafe != address(0), "config: reviewer Safes unset");
        require(c.feeRecipient != address(0), "config: fee recipient unset");
        require(c.minDelay >= 24 hours, "config: delay below the 24-hour floor");
        require(c.perDealCap <= c.totalCap, "config: per-deal cap above the total");
    }

    /// @dev A value wider than its field is refused rather than wrapped.
    function _upTo(Vm vm, string memory j, string memory key, uint256 max) private pure returns (uint256 v) {
        v = vm.parseJsonUint(j, string.concat(".", key));
        require(v <= max, string.concat("config: ", key, " out of range"));
    }
}
