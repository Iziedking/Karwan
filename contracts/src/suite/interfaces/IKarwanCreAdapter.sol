// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice What a CRE workflow can ask the adapter to do. Layouts are frozen:
///         workflows and the backend encode against them.
///
///         Report = abi.encode(uint8 kind, uint256 chainId, address adapter,
///                             uint64 issuedAt, bytes32 reportId, bytes body)
///         CHECK  = abi.encode(address verifier, address family, bytes32 dealId,
///                             uint32 revision, bool pass, bytes32 evidenceHash)
///         FACT   = abi.encode(uint8 op, address wallet, bytes32 factKind, uint8 level,
///                             bytes32 evidenceSeal, uint64 expiresAt, uint256 factId)
///         KEEP   = abi.encode(KeepCall[] calls)
interface IKarwanCreAdapter {
    struct KeepCall {
        address family;
        bytes4 selector;
        bytes args;
    }

    event WorkflowBound(uint8 indexed kind, bytes32 workflowId, bytes10 workflowName);
    event CheckApproved(
        address indexed verifier,
        address indexed family,
        bytes32 indexed dealId,
        uint32 revision,
        bool pass,
        bytes32 evidenceHash,
        bytes32 reportId
    );
    event CheckRefused(address indexed verifier, address indexed family, bytes32 indexed dealId, uint32 revision);
    event CheckSubmitted(address indexed verifier, bytes32 indexed dealId, uint32 revision);
    event CheckSubmitFailed(address indexed verifier, bytes32 indexed dealId, uint32 revision, bytes reason);
    event FactWritten(uint256 indexed factId, address indexed wallet, bytes32 indexed factKind, uint8 level);
    event FactRevoked(uint256 indexed factId);
    event KeepResult(address indexed family, bytes4 indexed selector, bytes args, bool ok, bytes reason);

    function approved(bytes32 digest) external view returns (bool);
    function verdictOf(bytes32 key) external view returns (bool set, bool pass, bytes32 evidenceHash);
    function verdictKey(address verifier, address family, bytes32 dealId, uint32 revision)
        external
        pure
        returns (bytes32);
    function checkDigest(
        address verifier,
        address family,
        bytes32 dealId,
        uint32 revision,
        bool pass,
        bytes32 evidenceHash
    ) external view returns (bytes32);
}

interface IKarwanRecordFacts {
    function recordFact(address wallet, bytes32 kind, uint8 level, bytes32 evidenceSeal, uint64 expiresAt)
        external
        returns (uint256 id);
    function revoke(uint256 id) external;
}

interface IKarwanCheckVerifierView {
    function threshold() external view returns (uint8);
    function isSigner(address who) external view returns (bool);
    function report(
        address family,
        bytes32 dealId,
        uint32 revision,
        bool pass,
        bytes32 evidenceHash,
        address[] calldata signers,
        bytes[] calldata sigs
    ) external;
}
