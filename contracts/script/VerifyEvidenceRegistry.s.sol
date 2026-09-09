// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IReceiver, IERC165} from "../src/interfaces/IReceiver.sol";
import {KarwanEvidenceRegistry} from "../src/KarwanEvidenceRegistry.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Read-only verification of a deployed Arc Testnet evidence registry.
/// @dev This script never starts a broadcast and cannot submit a transaction.
contract VerifyEvidenceRegistry is Script {
    function run() external view returns (bool) {
        address registryAddress = vm.envAddress("KARWAN_EVIDENCE_REGISTRY_ADDR");
        string memory workflowName = vm.envString("CRE_WORKFLOW_NAME");
        EvidenceRegistryDeploymentConfig.Config memory config =
            EvidenceRegistryDeploymentConfig.Config({
                forwarder: vm.envAddress("CRE_FORWARDER_ADDR"),
                workflowOwner: vm.envAddress("CRE_WORKFLOW_OWNER"),
                workflowId: vm.envBytes32("CRE_WORKFLOW_ID"),
                workflowName: EvidenceRegistryDeploymentConfig.encodeWorkflowName(workflowName),
                chainId: block.chainid,
                workflowBinder: vm.envAddress("EVIDENCE_REGISTRY_BINDER_ADDR")
            });
        EvidenceRegistryDeploymentConfig.validateBound(config);
        require(registryAddress != address(0), "zero registry address");
        require(registryAddress.code.length > 0, "registry has no bytecode");

        KarwanEvidenceRegistry registry = KarwanEvidenceRegistry(payable(registryAddress));
        require(registry.forwarder() == config.forwarder, "forwarder mismatch");
        require(registry.workflowOwner() == config.workflowOwner, "workflow owner mismatch");
        require(registry.expectedWorkflowId() == config.workflowId, "workflow ID mismatch");
        require(registry.expectedWorkflowName() == config.workflowName, "workflow name mismatch");
        require(registry.expectedChainId() == config.chainId, "chain ID mismatch");
        require(registry.workflowBinder() == config.workflowBinder, "workflow binder mismatch");
        require(registry.supportsInterface(type(IReceiver).interfaceId), "IReceiver unsupported");
        require(registry.supportsInterface(type(IERC165).interfaceId), "ERC165 unsupported");
        console.log("Verified KarwanEvidenceRegistry:", registryAddress);
        console.log("Native balance (forced funds possible):", registryAddress.balance);
        console.log("Verification mode: read-only");
        console.log("Ongoing custody/admin roles: none");
        return true;
    }
}
