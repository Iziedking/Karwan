// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEvidenceRegistry} from "../src/KarwanEvidenceRegistry.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Performs the receiver's only administrative action: bind the final
/// workflow ID. The configured authority has no power after this succeeds.
/// @dev Without Foundry's --broadcast flag this script is a simulation only.
contract BindEvidenceRegistryWorkflow is Script {
    function run() external {
        KarwanEvidenceRegistry registry =
            KarwanEvidenceRegistry(payable(vm.envAddress("KARWAN_EVIDENCE_REGISTRY_ADDR")));
        EvidenceRegistryDeploymentConfig.Config memory config = _readConfig();
        EvidenceRegistryDeploymentConfig.validateBound(config);

        require(address(registry).code.length > 0, "registry has no bytecode");
        require(registry.forwarder() == config.forwarder, "forwarder mismatch");
        require(registry.workflowOwner() == config.workflowOwner, "workflow owner mismatch");
        require(registry.expectedWorkflowId() == bytes32(0), "workflow ID already bound");
        require(registry.expectedWorkflowName() == config.workflowName, "workflow name mismatch");
        require(registry.expectedChainId() == config.chainId, "chain ID mismatch");
        require(registry.workflowBinder() == config.workflowBinder, "workflow binder mismatch");

        vm.startBroadcast();
        registry.bindWorkflowId(config.workflowId);
        vm.stopBroadcast();

        require(registry.expectedWorkflowId() == config.workflowId, "workflow ID bind failed");
        console.log("Bound KarwanEvidenceRegistry:", address(registry));
        console.logBytes32(config.workflowId);
        console.log("One-time binding consumed; no ongoing admin role");
    }

    function _readConfig() private view returns (EvidenceRegistryDeploymentConfig.Config memory) {
        return EvidenceRegistryDeploymentConfig.Config({
            forwarder: vm.envAddress("CRE_FORWARDER_ADDR"),
            workflowOwner: vm.envAddress("CRE_WORKFLOW_OWNER"),
            workflowId: vm.envBytes32("CRE_WORKFLOW_ID"),
            workflowName: EvidenceRegistryDeploymentConfig.encodeWorkflowName(
                vm.envString("CRE_WORKFLOW_NAME")
            ),
            chainId: block.chainid,
            workflowBinder: vm.envAddress("EVIDENCE_REGISTRY_BINDER_ADDR")
        });
    }
}
