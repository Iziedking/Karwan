// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

/// @notice DEPRECATED. After the v2.D redeploy KarwanEscrow takes a vault +
///         reputation address in its constructor, and both of those bind to
///         the escrow via one-shot setEscrow setters. That means you can't
///         deploy a new escrow alone — the previously bound vault + rep
///         refuse to re-bind, leaving the new escrow unable to call them.
///
///         To rotate escrow, use Deploy.s.sol which deploys the whole
///         vault + reputation + escrow + jobBoard bundle in one
///         transaction. Then point the backend at the new addresses.
contract DeployEscrow is Script {
    function run() external pure {
        revert("DeployEscrow standalone is deprecated; use Deploy.s.sol for the v2.D bundle.");
    }
}
