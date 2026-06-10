// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";

/// v2.E bundle redeploy. Four contracts in one window:
///   - KarwanReputation  (adds recordPenalty + one-shot securityAgentSigner)
///   - KarwanVault       (adds resolveOwner + entitlement-agnostic yield)
///   - KarwanTreasury    (rewritten with ERC-4626 Teller + yield-agnostic)
///   - KarwanEscrow      (per-deal reservationBps, identity-keyed reputation)
///
/// All five must redeploy together because:
///   - Escrow's vault, treasury, and reputation slots are immutable.
///   - Vault and Reputation's setEscrow is one-shot.
///   - Treasury holds the USDC-from-fees stream, so changing the fee target
///     means a new escrow.
///
/// JobBoard stays put. CCTP / bridge / identity registry are unaffected.
///
/// After this script, rotate env vars:
///   KARWAN_ESCROW_LEGACY_ADDR_3        = previous KARWAN_ESCROW_ADDR (v2.D)
///   KARWAN_VAULT_LEGACY_ADDR_3         = previous KARWAN_VAULT_ADDR  (v2.D)
///   KARWAN_REPUTATION_LEGACY_ADDR_3    = previous KARWAN_REPUTATION_ADDR
///   LEGACY_WINDOW_CLOSES_AT_3          = today + 30 days
///   KARWAN_ESCROW_ADDR                 = <new escrow from console.log>
///   KARWAN_VAULT_ADDR                  = <new vault from console.log>
///   KARWAN_REPUTATION_ADDR             = <new reputation from console.log>
///   KARWAN_TREASURY_ADDR               = <new treasury from console.log>
///   USYC_TELLER_ADDR / USYC_TOKEN_ADDR / USYC_ORACLE_ADDR
///                                      = real Hashnote / Circle USYC
///                                        addresses on Arc.
contract DeployV2E is Script {
    function run() external {
        // --- env reads ---------------------------------------------------
        address usdc = vm.envOr(
            "USDC_ADDR",
            address(0x3600000000000000000000000000000000000000)
        );
        uint16 feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(150)));
        uint16 maxReservationBps =
            uint16(vm.envOr("KARWAN_MAX_RESERVATION_BPS", uint256(10000)));

        // USYC endpoints: the real Hashnote / Circle USYC Teller, token, and
        // oracle on Arc. Required; the bundle wires them into the treasury and
        // the vault yield path.
        address usycTeller = vm.envOr("USYC_TELLER_ADDR", address(0));
        address usycToken = vm.envOr("USYC_TOKEN_ADDR", address(0));
        address usycOracle = vm.envOr("USYC_ORACLE_ADDR", address(0));

        // Treasury knobs.
        address treasuryKeeper = vm.envOr("TREASURY_KEEPER_ADDR", msg.sender);
        uint256 treasuryIdleThreshold =
            vm.envOr("TREASURY_IDLE_THRESHOLD", uint256(10_000_000)); // 10 USDC

        // --- deploy ------------------------------------------------------
        vm.startBroadcast();

        require(usycTeller != address(0), "USYC_TELLER_ADDR unset");
        require(usycToken != address(0), "USYC_TOKEN_ADDR unset");
        require(usycOracle != address(0), "USYC_ORACLE_ADDR unset");

        // Deploy in a scoped block so locals from setup don't pile up on
        // the stack during the escrow's 6-arg constructor (stack-too-deep
        // on solc 0.8.24 otherwise).
        (
            address repAddr,
            address vaultAddr,
            address treasuryAddr,
            address escrowAddr
        ) = _deployBundle(
            usdc,
            feeBps,
            maxReservationBps,
            usycTeller,
            usycToken,
            usycOracle,
            treasuryKeeper,
            treasuryIdleThreshold
        );

        vm.stopBroadcast();

        // --- log ---------------------------------------------------------
        console.log("KarwanReputation:  ", repAddr);
        console.log("KarwanVault:       ", vaultAddr);
        console.log("KarwanTreasury:    ", treasuryAddr);
        console.log("KarwanEscrow:      ", escrowAddr);
        console.log("USYC Teller:       ", usycTeller);
        console.log("USYC Token:        ", usycToken);
        console.log("USYC Oracle:       ", usycOracle);
        console.log("Escrow feeBps:     ", feeBps);
        console.log("Escrow max bps:    ", maxReservationBps);
        console.log("Treasury keeper:   ", treasuryKeeper);
        console.log("Treasury idleUsdc: ", treasuryIdleThreshold);
    }

    struct BundleConfig {
        address usdc;
        uint16 feeBps;
        uint16 maxReservationBps;
        address usycTeller;
        address usycToken;
        address usycOracle;
        address treasuryKeeper;
        uint256 treasuryIdleThreshold;
    }

    function _deployBundle(
        address usdc,
        uint16 feeBps,
        uint16 maxReservationBps,
        address usycTeller,
        address usycToken,
        address usycOracle,
        address treasuryKeeper,
        uint256 treasuryIdleThreshold
    )
        internal
        returns (address repAddr, address vaultAddr, address treasuryAddr, address escrowAddr)
    {
        BundleConfig memory cfg = BundleConfig({
            usdc: usdc,
            feeBps: feeBps,
            maxReservationBps: maxReservationBps,
            usycTeller: usycTeller,
            usycToken: usycToken,
            usycOracle: usycOracle,
            treasuryKeeper: treasuryKeeper,
            treasuryIdleThreshold: treasuryIdleThreshold
        });
        KarwanReputation rep = new KarwanReputation();
        KarwanVault vault = new KarwanVault(cfg.usdc);
        KarwanTreasury treasury = new KarwanTreasury(
            cfg.usdc,
            cfg.usycTeller,
            cfg.usycToken,
            cfg.usycOracle,
            cfg.treasuryKeeper,
            cfg.treasuryIdleThreshold
        );
        KarwanEscrow escrow = new KarwanEscrow(
            cfg.usdc,
            cfg.feeBps,
            address(treasury),
            address(vault),
            address(rep),
            cfg.maxReservationBps
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        return (address(rep), address(vault), address(treasury), address(escrow));
    }
}
