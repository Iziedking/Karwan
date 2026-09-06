// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEvidenceRegistry} from "../src/KarwanEvidenceRegistry.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Deploys the immutable, non-custodial CRE evidence receiver.
/// @dev Without Foundry's --broadcast flag this script is a simulation only.
///      The owner must first confirm CRE_FORWARDER_ADDR with the authenticated
///      tenant-scoped `cre workflow supported-chains --output json` command.
contract DeployEvidenceRegistry is Script {
    function run() external returns (KarwanEvidenceRegistry registry) {
        string memory workflowName = vm.envString("CRE_WORKFLOW_NAME");
        EvidenceRegistryDeploymentConfig.Config memory config =
            EvidenceRegistryDeploymentConfig.Config({
                forwarder: vm.envAddress("CRE_FORWARDER_ADDR"),
                workflowOwner: vm.envAddress("CRE_WORKFLOW_OWNER"),
                workflowId: bytes32(0),
                workflowName: EvidenceRegistryDeploymentConfig.encodeWorkflowName(workflowName),
                chainId: block.chainid,
                workflowBinder: vm.envAddress("EVIDENCE_REGISTRY_BINDER_ADDR")
            });
        EvidenceRegistryDeploymentConfig.validateDeployment(config);

        vm.startBroadcast();
        registry = new KarwanEvidenceRegistry(
            config.forwarder,
            config.workflowOwner,
            config.workflowName,
            config.chainId,
            config.workflowBinder
        );
        vm.stopBroadcast();

        _verify(registry, config);
        console.log("KarwanEvidenceRegistry:", address(registry));
        console.log("CRE production forwarder:", config.forwarder);
        console.log("CRE workflow owner:", config.workflowOwner);
        console.logBytes32(config.workflowId);
        console.logBytes10(config.workflowName);
        console.log("Expected chain ID:", config.chainId);
        console.log("One-time workflow binder:", config.workflowBinder);
        console.log("Ongoing custody/admin roles: none");
    }

    function _verify(
        KarwanEvidenceRegistry registry,
        EvidenceRegistryDeploymentConfig.Config memory config
    ) private view {
        require(address(registry).code.length > 0, "registry has no bytecode");
        require(registry.forwarder() == config.forwarder, "forwarder mismatch");
        require(registry.workflowOwner() == config.workflowOwner, "workflow owner mismatch");
        require(registry.expectedWorkflowId() == bytes32(0), "workflow ID already bound");
        require(registry.expectedWorkflowName() == config.workflowName, "workflow name mismatch");
        require(registry.expectedChainId() == config.chainId, "chain ID mismatch");
        require(registry.workflowBinder() == config.workflowBinder, "workflow binder mismatch");
    }
}
