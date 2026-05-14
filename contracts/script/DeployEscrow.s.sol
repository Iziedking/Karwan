// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";

/// @notice Redeploys only KarwanEscrow (e.g. after the platform-fee change).
///         JobBoard and Reputation are untouched; keep their existing addresses.
contract DeployEscrow is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        uint16 feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(150)));
        address treasury = vm.envOr("KARWAN_TREASURY_ADDR", msg.sender);

        vm.startBroadcast();
        KarwanEscrow escrow = new KarwanEscrow(usdc, feeBps, treasury);
        vm.stopBroadcast();

        console.log("KarwanEscrow:    ", address(escrow));
        console.log("Escrow feeBps:   ", feeBps);
        console.log("Escrow treasury: ", treasury);
    }
}
