// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanVault} from "../src/KarwanVault.sol";

contract DeployVault is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));

        vm.startBroadcast();
        KarwanVault vault = new KarwanVault(usdc);
        vm.stopBroadcast();

        console.log("KarwanVault:      ", address(vault));
        console.log("Vault USDC:       ", usdc);
    }
}
