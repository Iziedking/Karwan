// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanInvoiceRegistry} from "../src/KarwanInvoiceRegistry.sol";
import {KarwanPOFinancing} from "../src/KarwanPOFinancing.sol";

/// SME trade-finance bundle. Two new contracts, deployed once, never to
/// redeploy:
///
///   1. KarwanInvoiceRegistry — document anchors, factoring payee
///      redirection, PoD acceptance, attester allowlist. Reads
///      KarwanEscrow.getEscrow(jobId) for caller authorisation — no escrow
///      redeploy is needed.
///
///   2. KarwanPOFinancing — single-funder purchase-order financing.
///      Financier deposits USDC, contract holds custody until PoD anchors
///      on the registry, releases to seller, pulls repayUsdc from seller
///      on settlement via standard ERC20 approval. Reads the registry's
///      isPoDAccepted view and the escrow's getEscrow seller field.
///
/// Existing contracts are untouched:
///   - KarwanEscrow stays at KARWAN_ESCROW_ADDR
///   - KarwanVault, KarwanReputation, KarwanTreasury, KarwanYieldDistributor:
///     unchanged
///
/// After this script, set the following env vars on the backend:
///   KARWAN_INVOICE_REGISTRY_ADDR = <from console.log>
///   KARWAN_PO_FINANCING_ADDR     = <from console.log>
///
/// Optional overrides at deploy time:
///   USDC_ADDR              defaults to the Arc Testnet USDC precompile
///   KARWAN_ESCROW_ADDR     required — the live escrow this build wires to
///   SME_REGISTRY_OWNER     defaults to msg.sender; transferable on-chain
///                          via the registry's two-step ownership pattern
contract DeploySMEBundle is Script {
    function run() external {
        address usdc = vm.envOr(
            "USDC_ADDR",
            address(0x3600000000000000000000000000000000000000)
        );
        address escrowAddr = vm.envAddress("KARWAN_ESCROW_ADDR");
        address vaultAddr = vm.envAddress("KARWAN_VAULT_ADDR");
        address registryOwner = vm.envOr("SME_REGISTRY_OWNER", msg.sender);

        require(usdc != address(0), "USDC_ADDR unset");
        require(escrowAddr != address(0), "KARWAN_ESCROW_ADDR unset");
        require(vaultAddr != address(0), "KARWAN_VAULT_ADDR unset");
        require(registryOwner != address(0), "SME_REGISTRY_OWNER zero");

        vm.startBroadcast();

        // 1. KarwanInvoiceRegistry — owner-only attester allowlist + escrow
        //    pointer (v2: owner-settable, repointable).
        KarwanInvoiceRegistry registry = new KarwanInvoiceRegistry(registryOwner);

        // 2. KarwanPOFinancing — custody + factoring stake (v2 vault reserve).
        //    usdc, registry, escrow, vault are immutable at construction.
        KarwanPOFinancing po = new KarwanPOFinancing(usdc, address(registry), escrowAddr, vaultAddr);

        // 3. Bind the registry's escrow reference. Owner-settable in v2, so the
        //    registryOwner (not necessarily the deployer) must run this if it
        //    differs; here the deployer is the owner in the default path.
        registry.setEscrow(escrowAddr);
        // NOTE: after deploy, run vault.setConsumer(address(po)) so PO financing
        // can reserve seller stake as factoring collateral.

        vm.stopBroadcast();

        console.log("KarwanInvoiceRegistry:", address(registry));
        console.log("KarwanPOFinancing:    ", address(po));
        console.log("Registry owner:       ", registryOwner);
        console.log("Bound to escrow:      ", escrowAddr);
        console.log("USDC:                 ", usdc);
    }
}
