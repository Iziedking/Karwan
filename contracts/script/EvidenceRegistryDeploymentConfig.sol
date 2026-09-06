// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared, pure validation for Arc Testnet evidence-registry scripts.
/// @dev The production forwarder is intentionally pinned. If the tenant-scoped
///      CRE directory reports a different address, review and update this code
///      before deploying instead of bypassing the check at the command line.
library EvidenceRegistryDeploymentConfig {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant ARC_TESTNET_KEYSTONE_FORWARDER =
        0x76c9cf548b4179F8901cda1f8623568b58215E62;
    address internal constant ARC_TESTNET_MOCK_FORWARDER =
        0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1;

    bytes16 private constant HEX_SYMBOLS = "0123456789abcdef";

    struct Config {
        address forwarder;
        address workflowOwner;
        bytes32 workflowId;
        bytes10 workflowName;
        uint256 chainId;
        address workflowBinder;
    }

    error InvalidDeploymentChain(uint256 actual, uint256 expected);
    error InvalidProductionForwarder(address actual, address expected);
    error SimulationForwarderForbidden(address forwarder);
    error ZeroWorkflowOwner();
    error ZeroWorkflowId();
    error ZeroWorkflowBinder();
    error EmptyWorkflowName();
    error ZeroEncodedWorkflowName();

    function validateDeployment(Config memory config) internal pure {
        if (config.chainId != ARC_TESTNET_CHAIN_ID) {
            revert InvalidDeploymentChain(config.chainId, ARC_TESTNET_CHAIN_ID);
        }
        if (config.forwarder == ARC_TESTNET_MOCK_FORWARDER) {
            revert SimulationForwarderForbidden(config.forwarder);
        }
        if (config.forwarder != ARC_TESTNET_KEYSTONE_FORWARDER) {
            revert InvalidProductionForwarder(config.forwarder, ARC_TESTNET_KEYSTONE_FORWARDER);
        }
        if (config.workflowOwner == address(0)) revert ZeroWorkflowOwner();
        if (config.workflowName == bytes10(0)) revert ZeroEncodedWorkflowName();
        if (config.workflowBinder == address(0)) revert ZeroWorkflowBinder();
    }

    function validateBound(Config memory config) internal pure {
        validateDeployment(config);
        if (config.workflowId == bytes32(0)) revert ZeroWorkflowId();
    }

    /// @notice Encode a plaintext CRE workflow name exactly as the CRE engine.
    /// @dev SHA-256 the name, hex-encode the digest, then use the first ten
    ///      lowercase ASCII hex characters as bytes10.
    function encodeWorkflowName(string memory workflowName)
        internal
        pure
        returns (bytes10 encoded)
    {
        if (bytes(workflowName).length == 0) revert EmptyWorkflowName();

        bytes32 digest = sha256(bytes(workflowName));
        bytes memory firstTenHexCharacters = new bytes(10);
        for (uint256 i = 0; i < 5; ++i) {
            uint8 value = uint8(digest[i]);
            firstTenHexCharacters[i * 2] = HEX_SYMBOLS[value >> 4];
            firstTenHexCharacters[i * 2 + 1] = HEX_SYMBOLS[value & 0x0f];
        }

        assembly {
            encoded := mload(add(firstTenHexCharacters, 32))
        }
        if (encoded == bytes10(0)) revert ZeroEncodedWorkflowName();
    }
}
