// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanCheckVerifier} from "../src/suite/KarwanCheckVerifier.sol";
import {KarwanHub} from "../src/suite/KarwanHub.sol";
import {KarwanCreAdapter} from "../src/suite/KarwanCreAdapter.sol";

/// @notice Deploys the two check verifiers deals can name at funding:
///         V-K, Karwan's checker alone, while CRE_ENABLED is off; and V-CRE|K,
///         the CRE adapter or Karwan's checker, while it is on. Prints the
///         three calls the owner Safe schedules on the timelock; sends none.
contract DeployCheckVerifiers is Script {
    function run() external returns (KarwanCheckVerifier, KarwanCheckVerifier, bytes[3] memory) {
        return deploy(
            vm.envAddress("CRE_ADAPTER_ADDR"), vm.envAddress("KARWAN_CHECKER_ADDR"), vm.envAddress("KARWAN_HUB_ADDR")
        );
    }

    function deploy(address adapter, address checker, address hub)
        public
        returns (KarwanCheckVerifier vK, KarwanCheckVerifier vCK, bytes[3] memory calls)
    {
        require(adapter.code.length > 0, "adapter has no bytecode");
        require(address(KarwanCreAdapter(adapter).hub()) == hub, "adapter is wired to another hub");
        require(checker != address(0) && checker != adapter, "bad checker");

        address[] memory k = new address[](1);
        k[0] = checker;
        address[] memory ck = new address[](2);
        (ck[0], ck[1]) = adapter < checker ? (adapter, checker) : (checker, adapter);

        vm.startBroadcast();
        vK = new KarwanCheckVerifier(k, 1);
        vCK = new KarwanCheckVerifier(ck, 1);
        vm.stopBroadcast();

        calls[0] = abi.encodeCall(KarwanHub.setVerifier, (address(vK), true));
        calls[1] = abi.encodeCall(KarwanHub.setVerifier, (address(vCK), true));
        calls[2] = abi.encodeCall(KarwanHub.setIssuer, (adapter, true));
        console.log("V-K (Karwan checker):", address(vK));
        console.log("V-CRE|K (adapter or Karwan checker):", address(vCK));
        console.log("Timelock target, value 0, for each call below:", hub);
        for (uint256 i; i < 3; ++i) {
            console.logBytes(calls[i]);
        }
    }
}
