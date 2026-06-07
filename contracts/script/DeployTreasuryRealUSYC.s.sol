// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";

/// Redeploys ONLY KarwanTreasury, wired to real Arc Testnet USYC contracts.
/// Triggered by Circle confirming USYC entitlement on 2026-06-04: deployer is
/// allowlisted and contract whitelisting is available on request.
///
/// Why just Treasury:
///   - KarwanTreasury has `teller` and `usyc` as immutable storage. The only
///     way to point them at real Hashnote USYC is a new deployment.
///   - KarwanVault has setTeller(address,address) as a mutable operator-gated
///     setter (KarwanVault.sol:229). NO vault redeploy needed; just call
///     setTeller from the operator key after Circle whitelists the existing
///     vault address.
///   - KarwanEscrow's treasury slot is immutable, so this script does NOT
///     re-wire escrow. The existing escrow keeps routing fees to the OLD
///     treasury. A periodic admin operation drains old treasury USDC into
///     this new treasury via treasury.deposit(amount), which then sweeps to
///     real USYC. Avoids a cascading legacy-escrow generation.
///
/// Sequence after this script runs:
///   1. Copy the printed treasury address into .env as KARWAN_TREASURY_USYC_ADDR.
///   2. Email Circle customer support (the ticket from 2026-06-03) with TWO
///      addresses for whitelisting:
///        - The existing KarwanVault (Gen 4)
///        - The new KarwanTreasury printed below.
///   3. When Circle confirms, call from the operator key:
///        vault.setTeller(realTeller, realUSYC)
///      Treasury already has the real addresses baked in via constructor.
///   4. Flip backend USYC_*_ADDR env vars to the four real Arc Testnet
///      addresses, restart backend.
///   5. Test with a small treasury.deposit + sweepToUSYC; should land cleanly
///      on real Hashnote infra.
///
/// Verified Arc Testnet USYC addresses (developers.circle.com/tokenized/usyc):
///   Teller:       0x9fdF14c5B14173D74C08Af27AebFf39240dC105A
///   USYC token:   0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
///   Oracle:       0x52b56c7642E71dc54714d879127d97cd0B3D4581
///   Entitlements: 0xcc205224862c7641930c87679e98999d23c26113
contract DeployTreasuryRealUSYC is Script {
    // Sentinel addresses; the script requires these to be passed via env so
    // a typo here can't silently deploy against the wrong USYC.
    address constant ARC_TESTNET_USYC_TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;
    address constant ARC_TESTNET_USYC_TOKEN  = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address constant ARC_TESTNET_USYC_ORACLE = 0x52b56c7642E71dc54714d879127d97cd0B3D4581;

    function run() external {
        address usdc = vm.envOr(
            "USDC_ADDR",
            address(0x3600000000000000000000000000000000000000)
        );

        // Allow env override for safety (e.g. when running against a forked
        // mainnet later), but default to the verified Arc Testnet addresses
        // so a clean run picks the right targets without manual config.
        address teller = vm.envOr("USYC_TELLER_ADDR", ARC_TESTNET_USYC_TELLER);
        address usycToken = vm.envOr("USYC_TOKEN_ADDR", ARC_TESTNET_USYC_TOKEN);
        address usycOracle = vm.envOr("USYC_ORACLE_ADDR", ARC_TESTNET_USYC_ORACLE);

        address keeper = vm.envOr("TREASURY_KEEPER_ADDR", msg.sender);
        uint256 idleThreshold = vm.envOr(
            "TREASURY_IDLE_THRESHOLD",
            uint256(10_000_000) // 10 USDC (6 decimals) before sweep fires
        );

        require(teller != address(0), "teller addr unset");
        require(usycToken != address(0), "usyc token addr unset");
        require(usycOracle != address(0), "usyc oracle addr unset");

        vm.startBroadcast();

        KarwanTreasury treasury = new KarwanTreasury(
            usdc,
            teller,
            usycToken,
            usycOracle,
            keeper,
            idleThreshold
        );

        vm.stopBroadcast();

        console.log("KarwanTreasury v3 (real USYC):", address(treasury));
        console.log("  USDC:                        ", usdc);
        console.log("  Teller:                      ", teller);
        console.log("  USYC token:                  ", usycToken);
        console.log("  Oracle:                      ", usycOracle);
        console.log("  Keeper:                      ", keeper);
        console.log("  Idle threshold (USDC, 6d):   ", idleThreshold);
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Set KARWAN_TREASURY_USYC_ADDR =", address(treasury));
        console.log("  2. Email Circle customer support with this address");
        console.log("     AND the existing KarwanVault address for USYC whitelisting.");
        console.log("  3. After Circle confirms: call vault.setTeller(teller, usyc)");
        console.log("     from the operator key.");
    }
}
