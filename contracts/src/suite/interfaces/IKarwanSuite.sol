// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IKarwanHub {
    struct OpeningConfig {
        bool open;
        uint16 feeBps;
        address feeRecipient;
        uint128 perDealCap;
        uint128 highValue;
        address reviewSafe;
        address seniorSafe;
        address autoArbiter;
    }

    function openingConfig(address family, address asset) external view returns (OpeningConfig memory);
    function totalCapOf(address family, address asset) external view returns (uint128);
    function isFamily(address family) external view returns (bool);
    function isVerifier(address verifier) external view returns (bool);
    function isIssuer(address issuer) external view returns (bool);
    function guardian() external view returns (address);
    function identity() external view returns (address);
    function record() external view returns (address);
    function stakeVault() external view returns (address);
}

interface IKarwanIdentity {
    function identityOf(address wallet) external view returns (uint64);
    function isAgent(address wallet) external view returns (bool);
    function identityCount() external view returns (uint64);
    function useAgentAllowance(address wallet, uint256 amount) external;
}

interface IKarwanRecord {
    function recordOutcome(bytes32 dealKey, uint64 subject, uint8 role, uint8 outcome, uint8 band, uint16 detail)
        external;
}

/// @notice Deal outcome codes written to the record. `detail` carries the
///         payee's share in basis points for rulings and splits.
library Outcome {
    uint8 internal constant COMPLETED = 1;
    uint8 internal constant FAILED = 2;
    uint8 internal constant RULED = 3;
    uint8 internal constant SPLIT = 4;
    uint8 internal constant DEPOSIT_RETURNED = 5;
    uint8 internal constant CANCELLED = 6;
    uint8 internal constant LONGSTOP = 7;
    uint8 internal constant MAX = 7;
}
