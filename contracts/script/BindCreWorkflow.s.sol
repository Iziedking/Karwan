// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanCreAdapter} from "../src/suite/KarwanCreAdapter.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Binds a CRE workflow to one report kind on the adapter. Run after
///         the workflow is deployed, because its id depends on its final
///         config. In production the binder is the timelock, so this prints the
///         call for the owner Safe to schedule; with CRE_REHEARSAL=1 it binds
///         directly. CRE_KIND: 1 check, 2 fact, 3 keep.
contract BindCreWorkflow is Script {
    function run() external {
        uint8 kind = uint8(vm.envUint("CRE_KIND"));
        bytes32 workflowId = vm.envBytes32("CRE_WORKFLOW_ID");
        string memory name = vm.envString("CRE_WORKFLOW_NAME");
        if (vm.envOr("CRE_REHEARSAL", false)) {
            rehearse(KarwanCreAdapter(vm.envAddress("CRE_ADAPTER_ADDR")), kind, workflowId, name, address(0));
        } else {
            console.log("Timelock target, value 0:", vm.envAddress("CRE_ADAPTER_ADDR"));
            console.logBytes(bindCall(kind, workflowId, name));
        }
    }

    function bindCall(uint8 kind, bytes32 workflowId, string memory workflowName) public pure returns (bytes memory) {
        return abi.encodeCall(
            KarwanCreAdapter.bindWorkflow, (kind, workflowId, EvidenceRegistryDeploymentConfig.encodeWorkflowName(workflowName))
        );
    }

    /// @param sender The binder to broadcast as, or zero for Foundry's sender.
    function rehearse(KarwanCreAdapter adapter, uint8 kind, bytes32 workflowId, string memory workflowName, address sender)
        public
    {
        bytes10 name = EvidenceRegistryDeploymentConfig.encodeWorkflowName(workflowName);
        if (sender == address(0)) vm.startBroadcast();
        else vm.startBroadcast(sender);
        adapter.bindWorkflow(kind, workflowId, name);
        vm.stopBroadcast();
        (bytes32 id, bytes10 storedName) = adapter.bindingOf(kind);
        require(id == workflowId && storedName == name, "binding mismatch");
        console.log("Bound kind", kind, "on", address(adapter));
    }
}
