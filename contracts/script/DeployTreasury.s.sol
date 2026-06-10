// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";

/// @notice Deploys KarwanTreasury. TELLER, USYC, and ORACLE point at the real
///         Hashnote / Circle USYC Teller, token, and Chainlink-style oracle on
///         Arc. When the oracle is unset it defaults to the Teller address.
contract DeployTreasury is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        address teller = vm.envAddress("USYC_TELLER_ADDR");
        address usyc = vm.envOr("USYC_TOKEN_ADDR", teller);
        address oracle = vm.envOr("USYC_ORACLE_ADDR", teller);
        // Defaults to the broadcaster when unset; set explicitly for an automation wallet.
        address keeper = vm.envOr("TREASURY_KEEPER_ADDR", msg.sender);
        // USDC kept liquid (6 decimals). Default 0 = sweep everything.
        uint256 idleThreshold = vm.envOr("TREASURY_IDLE_THRESHOLD", uint256(0));

        vm.startBroadcast();
        KarwanTreasury treasury =
            new KarwanTreasury(usdc, teller, usyc, oracle, keeper, idleThreshold);
        vm.stopBroadcast();

        console.log("KarwanTreasury:   ", address(treasury));
        console.log("Treasury USDC:    ", usdc);
        console.log("Treasury teller:  ", teller);
        console.log("Treasury usyc:    ", usyc);
        console.log("Treasury oracle:  ", oracle);
        console.log("Treasury keeper:  ", keeper);
        console.log("Idle threshold:   ", idleThreshold);
    }
}
