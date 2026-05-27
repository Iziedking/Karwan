// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanJobBoard} from "../src/KarwanJobBoard.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanVault} from "../src/KarwanVault.sol";

/// Full v2.D deploy. Wires the four staking-insurance contracts in the order
/// that the chicken-and-egg constructor dependencies dictate:
///
///   1. KarwanVault(usdc)                                — needs nothing
///   2. KarwanReputation()                                — needs nothing (escrow bound later)
///   3. KarwanEscrow(usdc, feeBps, treasury, vault, rep, reservationBps)
///   4. vault.setEscrow(escrow)                           — one-shot wiring
///   5. rep.setEscrow(escrow)                             — one-shot wiring
///   6. KarwanJobBoard()                                  — independent
///
/// After this script, the env should be set to:
///   KARWAN_VAULT_ADDR       = <new vault>
///   KARWAN_VAULT_LEGACY_ADDR= 0x92b1223921944024f6615A604a2bDA6eF1fEe922   (the old vault, for dual-read migration)
///   KARWAN_ESCROW_ADDR      = <new escrow>
///   KARWAN_REPUTATION_ADDR  = <new reputation>
///   KARWAN_JOBBOARD_ADDR    = <new job board>
contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        // Platform fee in basis points (150 = 1.5%), split evenly buyer/seller.
        uint16 feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(150)));
        // Insurance reservation in basis points (5000 = 50% of deal value).
        // Captured in env so the operator can dial without editing the script.
        uint16 reservationBps = uint16(vm.envOr("KARWAN_RESERVATION_BPS", uint256(5000)));
        // Fee collector. Defaults to the broadcaster if KARWAN_TREASURY_ADDR is unset.
        address treasury = vm.envOr("KARWAN_TREASURY_ADDR", msg.sender);

        vm.startBroadcast();

        KarwanJobBoard board = new KarwanJobBoard();
        KarwanVault vault = new KarwanVault(usdc);
        KarwanReputation rep = new KarwanReputation();
        KarwanEscrow escrow = new KarwanEscrow(
            usdc,
            feeBps,
            treasury,
            address(vault),
            address(rep),
            reservationBps
        );

        // One-shot wiring. After this both setters refuse further calls.
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));

        vm.stopBroadcast();

        console.log("KarwanJobBoard:    ", address(board));
        console.log("KarwanVault:       ", address(vault));
        console.log("KarwanReputation:  ", address(rep));
        console.log("KarwanEscrow:      ", address(escrow));
        console.log("Escrow feeBps:     ", feeBps);
        console.log("Escrow reserveBps: ", reservationBps);
        console.log("Escrow treasury:   ", treasury);
    }
}
