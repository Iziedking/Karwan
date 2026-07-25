// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanPOFinancing} from "../src/KarwanPOFinancing.sol";
import {KarwanVault} from "../src/KarwanVault.sol";

/// @title PO Financing deploy and verify
/// @notice KarwanPOFinancing holds its escrow, vault and registry references as
///         immutables, so it cannot follow an escrow migration. It has to be
///         redeployed against the live bundle every time the escrow changes.
///
///         The v2 cutover found the previous deployment still bound to the
///         superseded escrow, which would have left PO financing pointing at a
///         contract nobody uses. This script exists so that failure mode cannot
///         recur silently: before deploying it asserts that the three addresses
///         it was handed genuinely reference each other on chain, and after
///         deploying it reads every immutable back.
///
///         Unlike the primary escrow, PO financing is not an implicit vault
///         consumer. Without the setConsumer call below, every reserve() it
///         attempts reverts NotConsumer.
contract DeployPOFinancing is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        address registry = vm.envAddress("KARWAN_INVOICE_REGISTRY_ADDR");
        address escrow = vm.envAddress("KARWAN_ESCROW_ADDR");
        address vault = vm.envAddress("KARWAN_VAULT_ADDR");

        require(usdc.code.length > 0, "USDC_ADDR has no code");
        require(registry.code.length > 0, "KARWAN_INVOICE_REGISTRY_ADDR has no code");
        require(escrow.code.length > 0, "KARWAN_ESCROW_ADDR has no code");
        require(vault.code.length > 0, "KARWAN_VAULT_ADDR has no code");

        // The addresses must belong to the same generation. Deploying against a
        // half-migrated set is how the stale binding happened the first time.
        require(KarwanVault(vault).escrow() == escrow, "vault does not point at this escrow");
        require(
            KarwanVault(vault).operator() == msg.sender,
            "sender is not vault operator, setConsumer would revert"
        );

        vm.startBroadcast();

        KarwanPOFinancing po = new KarwanPOFinancing(usdc, registry, escrow, vault);
        KarwanVault(vault).setConsumer(address(po), true);

        vm.stopBroadcast();

        require(address(po.escrow()) == escrow, "po.escrow");
        require(address(po.vault()) == vault, "po.vault");
        require(address(po.registry()) == registry, "po.registry");
        require(address(po.usdc()) == usdc, "po.usdc");
        require(po.owner() == msg.sender, "po.owner");
        require(KarwanVault(vault).authorizedConsumers(address(po)), "vault.authorizedConsumers");

        console.log("KARWAN_PO_FINANCING_ADDR", address(po));
        console.log("authorized as vault consumer, bound to escrow", escrow);
    }
}
