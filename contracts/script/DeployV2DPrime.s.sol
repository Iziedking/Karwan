// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanVault} from "../src/KarwanVault.sol";

/// v2.D-prime redeploy. Adds the agentOwner mapping to KarwanVault so
/// acceptEscrow can resolve seller agents to their stake-owning identity
/// wallets. Since escrow's vault is constructor-immutable and reputation's
/// setEscrow is one-shot, all three contracts must redeploy together.
///
/// JobBoard is NOT redeployed. Its address stays unchanged so any code paths
/// still pointing at it keep working.
///
/// After this script:
///   - KARWAN_VAULT_LEGACY_ADDR_2       = previous KARWAN_VAULT_ADDR
///   - KARWAN_ESCROW_LEGACY_ADDR_2      = previous KARWAN_ESCROW_ADDR
///   - LEGACY_WINDOW_CLOSES_AT_2        = today + 30 days
///   - KARWAN_VAULT_ADDR                = <new vault from console.log>
///   - KARWAN_REPUTATION_ADDR           = <new reputation from console.log>
///   - KARWAN_ESCROW_ADDR               = <new escrow from console.log>
///   - KARWAN_VAULT_DEPLOY_BLOCK        = <broadcast block>
contract DeployV2DPrime is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        uint16 feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(150)));
        uint16 reservationBps = uint16(vm.envOr("KARWAN_RESERVATION_BPS", uint256(5000)));
        address treasury = vm.envOr("KARWAN_TREASURY_ADDR", msg.sender);

        vm.startBroadcast();

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

        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));

        vm.stopBroadcast();

        console.log("KarwanVault:       ", address(vault));
        console.log("KarwanReputation:  ", address(rep));
        console.log("KarwanEscrow:      ", address(escrow));
        console.log("Escrow feeBps:     ", feeBps);
        console.log("Escrow reserveBps: ", reservationBps);
        console.log("Escrow treasury:   ", treasury);
    }
}
