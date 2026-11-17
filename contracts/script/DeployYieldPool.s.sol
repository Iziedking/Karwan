// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanYieldPool} from "../src/suite/KarwanYieldPool.sol";
import {IKarwanHub} from "../src/suite/interfaces/IKarwanSuite.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Deploys the USDC yield pool: the one address that holds USYC for
///         every family, and the one address Circle allowlists. The deployer
///         keeps no power over it; the hub's owner, the timelock, sets its
///         Teller, and the hub points at it once
///         (scripts/ops/yield-pool-timelock-batch.mjs).
contract DeployYieldPool is Script {
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    error WrongChain(uint256 chainId);
    error HubHasNoCode(address hub);
    error PoolAlreadySet(address pool);

    function run() external returns (KarwanYieldPool) {
        return deploy(vm.envAddress("KARWAN_HUB_ADDR"), ARC_USDC);
    }

    function deploy(address hub, address usdc) public returns (KarwanYieldPool pool) {
        if (block.chainid != EvidenceRegistryDeploymentConfig.ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (hub.code.length == 0) revert HubHasNoCode(hub);
        address set = IKarwanHub(hub).yieldPoolOf(usdc);
        if (set != address(0)) revert PoolAlreadySet(set);

        vm.startBroadcast();
        pool = new KarwanYieldPool(hub, usdc);
        vm.stopBroadcast();

        require(pool.hub() == hub, "hub mismatch");
        require(pool.asset() == usdc, "asset mismatch");
        console.log("KarwanYieldPool (USDC):", address(pool));
        console.log("Next: node scripts/ops/yield-pool-timelock-batch.mjs", address(pool));
        console.log("Then: ask Circle Support to allowlist this address for USYC on Arc Testnet");
    }
}
