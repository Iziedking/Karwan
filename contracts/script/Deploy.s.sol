// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));

        vm.startBroadcast();

        KarwanJobBoard board = new KarwanJobBoard();
        KarwanEscrow escrow = new KarwanEscrow(usdc);
        KarwanReputation rep = new KarwanReputation();

        vm.stopBroadcast();

        console.log("KarwanJobBoard:   ", address(board));
        console.log("KarwanEscrow:     ", address(escrow));
        console.log("KarwanReputation: ", address(rep));
    }
}
