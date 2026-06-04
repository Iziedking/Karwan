// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanYieldDistributor} from "../src/KarwanYieldDistributor.sol";

/// Deploys KarwanYieldDistributor — the per-address USDC claim contract for
/// staker yield. Runs AFTER Circle confirms USYC whitelisting on Treasury v3
/// and the live Vault, so the protocol has a real USYC yield source to
/// distribute from.
///
/// Constructor wires:
///   - USDC (Arc Testnet default 0x3600...)
///   - operator — the cron signer that will call bulkCredit daily. Defaults
///     to msg.sender, but pass YIELD_OPERATOR_ADDR explicitly if the cron
///     should run from a different key than the deployer (recommended for
///     production: hot operator + cold owner).
///
/// Owner becomes msg.sender. Owner can later rotate operator via
/// setOperator() without redeploying.
///
/// Sequence after this script:
///   1. Copy the printed distributor address into .env as
///      KARWAN_YIELD_DISTRIBUTOR_ADDR.
///   2. Restart backend so routes pick up the new address.
///   3. Build the daily distribution cron (see karwan_usyc_followups §4).
///      Cron signer's address must match the operator set here.
///   4. First bulkCredit run: operator approves the distributor for the day's
///      total USDC, then calls bulkCredit(stakers, amounts). Verify yield
///      shows on StakeCard for at least one test address.
///
/// Verify-on-Arcscan after broadcast (constructor args are USDC + operator).
contract DeployYieldDistributor is Script {
    function run() external {
        address usdc = vm.envOr(
            "USDC_ADDR",
            address(0x3600000000000000000000000000000000000000)
        );
        address operator = vm.envOr("YIELD_OPERATOR_ADDR", msg.sender);

        require(usdc != address(0), "USDC addr unset");
        require(operator != address(0), "operator addr unset");

        vm.startBroadcast();
        KarwanYieldDistributor distributor = new KarwanYieldDistributor(usdc, operator);
        vm.stopBroadcast();

        console.log("KarwanYieldDistributor:", address(distributor));
        console.log("  USDC:                 ", usdc);
        console.log("  Operator:             ", operator);
        console.log("  Owner:                ", msg.sender);
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Set KARWAN_YIELD_DISTRIBUTOR_ADDR =", address(distributor));
        console.log("  2. Restart backend.");
        console.log("  3. Operator approves distributor for daily yield total,");
        console.log("     then calls bulkCredit(stakers, amounts).");
        console.log("  4. Verify first distribution on a test wallet.");
    }
}
