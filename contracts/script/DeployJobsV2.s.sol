// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanJobEscrow} from "../src/suite/KarwanJobEscrow.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Deploys the second job escrow (view 88): contests whose prize goes
///         to the earliest valid entries when nobody is picked. It holds no
///         money until the hub registers it through the timelock
///         (scripts/ops/jobs-v2-timelock-batch.mjs). The first job escrow
///         keeps running its open contests on the old rule.
contract DeployJobsV2 is Script {
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    error WrongChain(uint256 chainId);
    error HubHasNoCode(address hub);

    function run() external returns (KarwanJobEscrow) {
        return deploy(vm.envAddress("KARWAN_HUB_ADDR"));
    }

    function deploy(address hub) public returns (KarwanJobEscrow jobs) {
        if (block.chainid != EvidenceRegistryDeploymentConfig.ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (hub.code.length == 0) revert HubHasNoCode(hub);

        vm.startBroadcast();
        jobs = new KarwanJobEscrow(hub, ARC_USDC);
        vm.stopBroadcast();

        require(address(jobs.hub()) == hub, "hub mismatch");
        require(jobs.asset() == ARC_USDC, "asset mismatch");
        console.log("KarwanJobEscrow v2:", address(jobs));
        console.log("Next: node scripts/ops/jobs-v2-timelock-batch.mjs", address(jobs));
    }
}
