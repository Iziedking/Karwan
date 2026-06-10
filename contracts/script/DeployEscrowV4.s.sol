// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanVault} from "../src/KarwanVault.sol";

/// @notice EscrowV4 redeploy. Binds the whitelisted USYC Treasury V4
///         (deployed 2026-06-04, whitelisted by Circle 2026-06-06) into
///         the escrow's immutable `treasury` slot. After this script runs,
///         every milestone fee from the new escrow lands directly in the
///         real-USYC treasury, so platform yield compounds without the
///         drain-from-old-to-v4 admin workflow.
///
/// Why this is a three-contract bundle, not a standalone escrow:
///   KarwanEscrow's `vault`, `treasury`, and `reputation` slots are immutable.
///   KarwanVault.setEscrow and KarwanReputation.setEscrow are one-shot.
///   The current vault + reputation are already bound to the v2.E escrow,
///   so a brand-new escrow alone cannot wire itself up. The bundle below
///   deploys a fresh vault and reputation alongside the new escrow, points
///   the escrow at the existing whitelisted treasury, and binds the two
///   one-shot setters in the same transaction.
///
/// KarwanJobBoard stays put. Bridge / identity registry / treasury / yield
/// distributor are all unaffected. The new escrow's treasury slot resolves to
/// the real Hashnote USYC path through V4.
///
/// After this script, rotate env vars on the VPS:
///   KARWAN_ESCROW_LEGACY_ADDR_4        = previous KARWAN_ESCROW_ADDR      (Gen 4)
///   KARWAN_VAULT_LEGACY_ADDR_4         = previous KARWAN_VAULT_ADDR       (Gen 4)
///   KARWAN_REPUTATION_LEGACY_ADDR_4    = previous KARWAN_REPUTATION_ADDR  (Gen 4)
///   KARWAN_VAULT_LEGACY_DEPLOY_BLOCK_4 = previous KARWAN_VAULT_DEPLOY_BLOCK
///   LEGACY_WINDOW_CLOSES_AT_4          = today plus 30 days (so users on
///                                        old contracts have a fixed
///                                        unwind horizon)
///   KARWAN_ESCROW_ADDR                 = <new escrow from console>
///   KARWAN_VAULT_ADDR                  = <new vault from console>
///   KARWAN_REPUTATION_ADDR             = <new reputation from console>
///   KARWAN_VAULT_DEPLOY_BLOCK          = <block number this script broadcasts>
///   KARWAN_TREASURY_ADDR               = stays as the V4 Treasury address
///                                        (0x9d95E4810E7C8B815F1Fb1Ec02C19085f8C76573).
///                                        Also set KARWAN_TREASURY_CONTRACT_ADDR
///                                        to this same value if not already,
///                                        so the admin console renders one card.
///
/// Operator follow-ups after env rotation:
///   1. Run the agent owner backfill so the new vault recognises every
///      identity wallet whose agent staked on the previous vault.
///   2. Restart the backend container and confirm the migration banner
///      surfaces the new legacy addresses on the home page.
///   3. Email Circle support to whitelist the new vault on Hashnote's
///      entitlements (role 0). Until that lands, the new vault stays on
///      the same idle-stake USYC path as the current vault: nothing.
///
/// Env vars consumed:
///   USDC_ADDR                  defaults to Arc Testnet USDC (0x3600...)
///   KARWAN_TREASURY_USYC_ADDR    the whitelisted Treasury V4 address. Required.
///                              (The slot name stayed V3 even though the
///                              contract is V4. Same address in the env.)
///   KARWAN_FEE_BPS             defaults to 150 (1.5%)
///   KARWAN_MAX_RESERVATION_BPS defaults to 10000 (100% cap on per-deal
///                              insurance reservation)
contract DeployEscrowV4 is Script {
    function run() external {
        // --- env reads ---------------------------------------------------
        address usdc = vm.envOr(
            "USDC_ADDR",
            address(0x3600000000000000000000000000000000000000)
        );
        // The whitelisted USYC Treasury lives in KARWAN_TREASURY_USYC_ADDR.
        // Renamed from KARWAN_TREASURY_V3_ADDR on 2026-06-06 so the key name
        // tracks what the contract does rather than which generation it was.
        address treasury = vm.envAddress("KARWAN_TREASURY_USYC_ADDR");
        uint16 feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(150)));
        uint16 maxReservationBps =
            uint16(vm.envOr("KARWAN_MAX_RESERVATION_BPS", uint256(10000)));

        require(treasury != address(0), "KARWAN_TREASURY_USYC_ADDR unset");
        require(usdc != address(0), "USDC_ADDR resolved to zero");

        // --- deploy ------------------------------------------------------
        vm.startBroadcast();

        (
            address repAddr,
            address vaultAddr,
            address escrowAddr
        ) = _deployBundle(usdc, treasury, feeBps, maxReservationBps);

        vm.stopBroadcast();

        // --- log ---------------------------------------------------------
        console.log("EscrowV4 bundle (treasury reused: real USYC, whitelisted)");
        console.log("  KarwanReputation: ", repAddr);
        console.log("  KarwanVault:      ", vaultAddr);
        console.log("  KarwanEscrow:     ", escrowAddr);
        console.log("  Treasury (V4):    ", treasury);
        console.log("  USDC:             ", usdc);
        console.log("  feeBps:           ", feeBps);
        console.log("  maxReservationBps:", maxReservationBps);
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Move previous KARWAN_*_ADDR values into KARWAN_*_LEGACY_ADDR_4");
        console.log("     and the matching LEGACY_DEPLOY_BLOCK_4 so /legacy keeps");
        console.log("     resolving any open deals or active stakes from Gen 4.");
        console.log("  2. Set KARWAN_ESCROW_ADDR, KARWAN_VAULT_ADDR, KARWAN_REPUTATION_ADDR");
        console.log("     to the addresses logged above. Set KARWAN_VAULT_DEPLOY_BLOCK");
        console.log("     to the block number this script broadcast against.");
        console.log("  3. KARWAN_TREASURY_ADDR stays as the V4 address (already whitelisted).");
        console.log("     Mirror it into KARWAN_TREASURY_CONTRACT_ADDR if not already; the");
        console.log("     admin Treasury console collapses to a single card when both match.");
        console.log("  4. Restart backend, run the agent-owner backfill against the new");
        console.log("     vault, and email Circle to whitelist the new vault for USYC.");
    }

    function _deployBundle(
        address usdc,
        address treasury,
        uint16 feeBps,
        uint16 maxReservationBps
    )
        internal
        returns (address repAddr, address vaultAddr, address escrowAddr)
    {
        KarwanReputation rep = new KarwanReputation();
        KarwanVault vault = new KarwanVault(usdc);
        KarwanEscrow escrow = new KarwanEscrow(
            usdc,
            feeBps,
            treasury,
            address(vault),
            address(rep),
            maxReservationBps
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        return (address(rep), address(vault), address(escrow));
    }
}
