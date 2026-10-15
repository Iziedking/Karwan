// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanCreAdapter} from "../src/suite/KarwanCreAdapter.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Deploys the CRE adapter: the one contract CRE workflows act through.
/// @dev Without --broadcast this is a simulation. The simulation forwarder is
///      allowed only with CRE_REHEARSAL=1, for a fork or a throwaway testnet run.
///      The fact kinds and keeper calls are fixed here, not read from the
///      environment, so a deployment cannot widen them by a typo.
contract DeployCreAdapter is Script {
    error WrongChain(uint256 chainId);
    error SimulationForwarderOutsideRehearsal(address forwarder);
    error UnknownForwarder(address forwarder);
    error BinderMustBeTheTimelock(address binder);

    function run() external returns (KarwanCreAdapter) {
        return deploy(
            vm.envAddress("CRE_FORWARDER_ADDR"),
            vm.envAddress("CRE_WORKFLOW_OWNER"),
            vm.envAddress("KARWAN_HUB_ADDR"),
            vm.envAddress("CRE_ADAPTER_BINDER_ADDR"),
            vm.envOr("CRE_REHEARSAL", false)
        );
    }

    function deploy(address forwarder, address workflowOwner, address hub, address binder, bool rehearsal)
        public
        returns (KarwanCreAdapter adapter)
    {
        if (block.chainid != EvidenceRegistryDeploymentConfig.ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (forwarder == EvidenceRegistryDeploymentConfig.ARC_TESTNET_MOCK_FORWARDER) {
            if (!rehearsal) revert SimulationForwarderOutsideRehearsal(forwarder);
        } else if (forwarder != EvidenceRegistryDeploymentConfig.ARC_TESTNET_KEYSTONE_FORWARDER) {
            revert UnknownForwarder(forwarder);
        }
        // The binder can rebind a workflow, so outside a rehearsal it must be
        // the timelock, never a key.
        if (!rehearsal && binder.code.length == 0) revert BinderMustBeTheTimelock(binder);

        vm.startBroadcast();
        adapter = new KarwanCreAdapter(forwarder, workflowOwner, hub, binder, factKinds(), keepSelectors());
        vm.stopBroadcast();

        require(adapter.forwarder() == forwarder, "forwarder mismatch");
        require(adapter.workflowOwner() == workflowOwner, "workflow owner mismatch");
        require(address(adapter.hub()) == hub, "hub mismatch");
        require(adapter.binder() == binder, "binder mismatch");
        console.log("KarwanCreAdapter:", address(adapter));
        console.log("Forwarder:", forwarder);
        console.log("Rehearsal:", rehearsal);
        console.log("Next: DeployCheckVerifiers, then the timelock calls it prints, then BindCreWorkflow per kind");
    }

    function factKinds() public pure returns (bytes32[] memory k) {
        k = new bytes32[](1);
        k[0] = keccak256("karwan.fact.github_work.v1");
    }

    /// The timeouts the Agreement, Time and Jobs families let anyone trigger.
    function keepSelectors() public pure returns (bytes4[] memory s) {
        string[15] memory sigs = [
            "claim(bytes32)",
            "reclaim(bytes32)",
            "cancelMissed(bytes32)",
            "executeRuling(bytes32)",
            "applyFallback(bytes32)",
            "retryRecord(bytes32,uint8)",
            "settle(bytes32,uint16)",
            "close(bytes32)",
            "executeRuling(bytes32,uint16)",
            "applyFallback(bytes32,uint16)",
            "release(uint256)",
            "confirmRejection(uint256)",
            "claimRefund(uint256)",
            "executeRuling(uint256)",
            "applyFallback(uint256)"
        ];
        s = new bytes4[](15);
        for (uint256 i; i < 15; ++i) {
            s[i] = bytes4(keccak256(bytes(sigs[i])));
        }
    }
}
