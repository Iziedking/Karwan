// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanCreFees} from "../src/suite/KarwanCreFees.sol";
import {EvidenceRegistryDeploymentConfig} from "./EvidenceRegistryDeploymentConfig.sol";

/// @notice Deploys the contract that holds CRE dry-run fees for the adapter.
/// @dev Deploy after DeployCreAdapter; bind kind 4 (DRY) to the karwan-check
///      workflow with BindCreWorkflow. The asset and the price are fixed here.
contract DeployCreFees is Script {
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    /// 0.25 USDC, six decimals: the x402 dry-run price.
    uint256 public constant PRICE = 250_000;

    error WrongChain(uint256 chainId);
    error AdapterHasNoCode(address adapter);

    function run() external returns (KarwanCreFees) {
        return deploy(vm.envAddress("CRE_ADAPTER_ADDR"), vm.envAddress("CRE_FEES_PAYEE_ADDR"));
    }

    function deploy(address adapter, address payee) public returns (KarwanCreFees fees) {
        if (block.chainid != EvidenceRegistryDeploymentConfig.ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (adapter.code.length == 0) revert AdapterHasNoCode(adapter);

        vm.startBroadcast();
        fees = new KarwanCreFees(ARC_USDC, adapter, payee, PRICE);
        vm.stopBroadcast();

        require(fees.adapter() == adapter, "adapter mismatch");
        require(fees.payee() == payee, "payee mismatch");
        console.log("KarwanCreFees:", address(fees));
        console.log("Payee:", payee);
        console.log("Next: BindCreWorkflow kind 4 (DRY) to the karwan-check workflow, then set CRE_FEES_ADDR");
    }
}
