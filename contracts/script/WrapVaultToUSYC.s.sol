// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IKarwanVault {
    function wrap(uint256 usdcAmount) external;
    function operator() external view returns (address);
}

/// @notice Operator op, NOT a deploy. Routes idle staked USDC in KarwanVault
///         into USYC for yield, through the already-wired Teller. Broadcast by
///         the vault operator.
///
///         Keep a USDC liquidity buffer for withdrawals, claims, and slashes:
///         do NOT wrap the full balance. WRAP_USDC_AMOUNT is 6-decimal USDC
///         (e.g. 2000000000 = 2000 USDC). Reverse it any time with unwrap.
contract WrapVaultToUSYC is Script {
    function run() external {
        address vault = vm.envAddress("KARWAN_VAULT_ADDR");
        uint256 amount = vm.envUint("WRAP_USDC_AMOUNT");

        vm.startBroadcast();
        IKarwanVault(vault).wrap(amount);
        vm.stopBroadcast();

        console.log("Vault:        ", vault);
        console.log("Wrapped USDC: ", amount);
    }
}
