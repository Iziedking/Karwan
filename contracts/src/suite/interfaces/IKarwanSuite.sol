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
    function acceptsMoney(address family, address asset) external view returns (bool);
    function isFamily(address family) external view returns (bool);
    function assetAllowed(address asset) external view returns (bool);
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
    function outcomeRecorded(bytes32 key) external view returns (bool);
    function outcomeKey(address family, bytes32 dealKey, uint64 subject, uint8 role) external pure returns (bytes32);
}

interface IKarwanStakeVault {
    function reserve(
        bytes32 ref,
        address staker,
        address asset,
        uint128 amount,
        address beneficiary,
        uint64 expiresAt,
        uint256 deadline,
        bytes calldata sig
    ) external;
    function extend(bytes32 ref, uint64 expiresAt) external;
    function slash(bytes32 ref, uint256 amount) external returns (uint256 paid);
    function release(bytes32 ref) external;
    function expiryOf(address family, bytes32 ref) external view returns (uint64);
}

/// @notice What a family's deal still owes its seller, for financing it.
///         `financeable` is true only while the deal runs with the seller's
///         acceptance and all its money in.
struct Receivable {
    address asset;
    address seller;
    uint256 unpaid;
    uint64 horizon;
    bool open;
    bool financeable;
}

/// @notice A family whose receivables Trade finance can advance against.
interface IFinanceable {
    function receivableOf(bytes32 dealId) external view returns (Receivable memory);
    function assignmentOf(bytes32 dealId, address payee)
        external
        view
        returns (address assignee, uint128 amount, uint128 paid);
    function assignPayout(
        bytes32 dealId,
        address payee,
        address assignee,
        uint128 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external;
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
