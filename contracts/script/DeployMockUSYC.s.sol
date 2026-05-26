// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MockUSYC} from "../src/MockUSYC.sol";

/// @notice Deploys the testnet USYC stand-in. On mainnet this is replaced by the
///         real Hashnote / Circle USYC token, Teller, and oracle addresses.
contract DeployMockUSYC is Script {
    function run() external {
        address usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        // Annual yield in basis points the mock ramps its price by. 500 = 5%.
        uint256 apyBps = vm.envOr("USYC_APY_BPS", uint256(500));

        vm.startBroadcast();
        MockUSYC usyc = new MockUSYC(usdc, apyBps);
        vm.stopBroadcast();

        console.log("MockUSYC:         ", address(usyc));
        console.log("USYC USDC:        ", usdc);
        console.log("USYC apyBps:      ", apyBps);
    }
}
