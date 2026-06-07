// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";

/// Redeploys KarwanTreasury with the corrected USYC price-oracle interface.
///
/// Why v4 supersedes v3 (the 2026-06-04 deploy at 0xc76111...):
///   - v3 used IPriceOracle.latestAnswer() at PRICE_SCALE = 1e8. The on-chain
///     Hashnote oracle proxy on Arc Testnet (0x52b56c76...) does NOT implement
///     latestAnswer(); the call reverted with no data, regardless of
///     entitlement state. totalReserves() therefore reverted on every call,
///     even pre-whitelist.
///   - v4 reads latestRoundData() and scales by 1e18, matching the real feed
///     (verified empirically 2026-06-04: roundId=54, answer=1116277611710661072,
///     i.e. $1.116 USD/USYC at 18 decimals).
///
/// Everything else is unchanged: constructor args, ownership model, keeper
/// rotation, deposit/sweep/redeem semantics. Same source file, just two
/// places patched.
///
/// Sequence:
///   1. forge build (to confirm clean compile of the patched source).
///   2. Run this script with the deployer keystore.
///   3. Copy the printed address into .env as KARWAN_TREASURY_USYC_ADDR
///      (frontend + admin route variable; the name stays even though the
///      contract is now v4 — no rename required).
///   4. Email Circle customer support with the new contract address for
///      USYC entitlement whitelisting. Reuse the existing thread; mention
///      v3 is being replaced because of the oracle-interface bug.
///   5. After Circle confirms, totalReserves() will return clean numbers
///      and the /admin/treasury v3 card will show full data.
///
/// Verified Arc Testnet USYC addresses (Arc docs + on-chain probe 2026-06-04):
///   Teller:       0x9fdF14c5B14173D74C08Af27AebFf39240dC105A
///   USYC token:   0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
///   Oracle:       0x52b56c7642E71dc54714d879127d97cd0B3D4581 (proxy,
///                 implementation 0x61ec0f00c29e4ec8fde4f39508b001d9f0fbac17)
///   Entitlements: 0xcc205224862c7641930c87679e98999d23c26113
contract DeployTreasuryV4 is Script {
    address constant ARC_TESTNET_USYC_TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;
    address constant ARC_TESTNET_USYC_TOKEN  = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address constant ARC_TESTNET_USYC_ORACLE = 0x52b56c7642E71dc54714d879127d97cd0B3D4581;

    function run() external {
        address usdc = vm.envOr(
            "USDC_ADDR",
            address(0x3600000000000000000000000000000000000000)
        );

        address teller = vm.envOr("USYC_TELLER_ADDR", ARC_TESTNET_USYC_TELLER);
        address usycToken = vm.envOr("USYC_TOKEN_ADDR", ARC_TESTNET_USYC_TOKEN);
        address usycOracle = vm.envOr("USYC_ORACLE_ADDR", ARC_TESTNET_USYC_ORACLE);

        address keeper = vm.envOr("TREASURY_KEEPER_ADDR", msg.sender);
        uint256 idleThreshold = vm.envOr(
            "TREASURY_IDLE_THRESHOLD",
            uint256(10_000_000)
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

        console.log("KarwanTreasury v4 (real USYC, fixed oracle):", address(treasury));
        console.log("  USDC:                        ", usdc);
        console.log("  Teller:                      ", teller);
        console.log("  USYC token:                  ", usycToken);
        console.log("  Oracle:                      ", usycOracle);
        console.log("  Keeper:                      ", keeper);
        console.log("  Idle threshold (USDC, 6d):   ", idleThreshold);
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Set KARWAN_TREASURY_USYC_ADDR =", address(treasury));
        console.log("     (renamed from KARWAN_TREASURY_V3_ADDR; old name still resolved as fallback.)");
        console.log("  2. Email Circle support to whitelist this address; mention v3 is");
        console.log("     replaced because totalReserves() reverted on its oracle path.");
        console.log("  3. Once whitelisted, refresh /admin/treasury -- the v3 card shows full data.");
    }
}
