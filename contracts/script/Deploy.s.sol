// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        // Platform fee in basis points (150 = 1.5%), split evenly buyer/seller.
        uint16 feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(150)));
        // Fee collector. Defaults to the broadcaster if KARWAN_TREASURY_ADDR is unset.
        address treasury = vm.envOr("KARWAN_TREASURY_ADDR", msg.sender);

        vm.startBroadcast();

        KarwanJobBoard board = new KarwanJobBoard();
        KarwanEscrow escrow = new KarwanEscrow(usdc, feeBps, treasury);
        KarwanReputation rep = new KarwanReputation();

        vm.stopBroadcast();

        console.log("KarwanJobBoard:   ", address(board));
        console.log("KarwanEscrow:     ", address(escrow));
        console.log("KarwanReputation: ", address(rep));
        console.log("Escrow feeBps:    ", feeBps);
        console.log("Escrow treasury:  ", treasury);
    }
}
