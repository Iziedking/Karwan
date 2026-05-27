// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

/// @notice DEPRECATED. After v2.D the vault binds the escrow via a one-shot
///         setEscrow, and the escrow needs the vault in its constructor.
///         Deploying the vault alone leaves it in an unwired state where
///         no escrow can ever bind to it. Use Deploy.s.sol for the full
///         vault + reputation + escrow + jobBoard bundle.
contract DeployVault is Script {
    function run() external pure {
        revert("DeployVault standalone is deprecated; use Deploy.s.sol for the v2.D bundle.");
    }
}
