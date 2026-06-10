// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";

/// @notice Deploys KarwanBusinessRegistry, the verified-business account gate.
///         OWNER holds the reviewer slot (defaults to the broadcaster; point at
///         a multisig for production). REVIEWER is the dedicated Karwan reviewer
///         wallet that signs approve / reject, never the deployer. Standalone:
///         no escrow binding, holds no funds, needs no Circle whitelist.
///
///         After deploy, set the backend + frontend env:
///           KARWAN_BUSINESS_REGISTRY_ADDR     = <printed address>
///           NEXT_PUBLIC_BUSINESS_REGISTRY_ADDR = <printed address>
///           BUSINESS_REVIEWER_WALLET_ID        = <Circle DCW id behind REVIEWER>
contract DeployBusinessRegistry is Script {
    function run() external {
        address owner = vm.envOr("BUSINESS_REGISTRY_OWNER", msg.sender);
        address reviewer = vm.envAddress("BUSINESS_REVIEWER_ADDR");

        vm.startBroadcast();
        KarwanBusinessRegistry registry = new KarwanBusinessRegistry(owner, reviewer);
        vm.stopBroadcast();

        console.log("KarwanBusinessRegistry:", address(registry));
        console.log("Registry owner:       ", owner);
        console.log("Registry reviewer:    ", reviewer);
    }
}
