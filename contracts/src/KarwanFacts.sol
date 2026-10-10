// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IFactsVault {
    function resolveOwner(address addr) external view returns (address);
}

/// @title KarwanFacts
/// @notice Verified facts about people, append only. A fact says what was
///         verified (a kind and a level), by which issuer, when, until when,
///         and a fingerprint of the evidence. It holds no score, no personal
///         data and no money.
///
///         Guarantees, each covered by tests:
///           - a fact is only ever written to a person, never to an agent
///             wallet bound to one, so a record cannot land on the wrong
///             subject;
///           - a fact is never changed or deleted; its issuer can only mark it
///             revoked;
///           - only allowlisted issuers write facts, and only allowlisted
///             escrows record deals.
contract KarwanFacts is Ownable2Step {
    struct Fact {
        address subject;
        bytes32 kind;
        uint8 level;
        address issuer;
        uint64 issuedAt;
        uint64 expiresAt;
        bool revoked;
        bytes32 evidenceHash;
    }

    IFactsVault public immutable vault;
    mapping(address => bool) public isIssuer;
    mapping(address => bool) public isEscrow;

    Fact[] internal _facts;
    mapping(address => uint256[]) internal _bySubject;

    event FactRecorded(
        uint256 indexed id,
        address indexed subject,
        bytes32 indexed kind,
        uint8 level,
        address issuer,
        bytes32 evidenceHash,
        uint64 expiresAt
    );
    event FactRevoked(uint256 indexed id, address issuer);
    /// A finished deal. `outcome` is set on completion, `sellerBps` on a ruling.
    event DealRecorded(
        bytes32 indexed jobId, address indexed buyer, address indexed seller, uint8 outcome, uint16 sellerBps, uint256 dealAmount
    );
    event RoleSet(bytes32 indexed role, address indexed who, bool ok);

    error NotIssuer();
    error NotEscrow();
    error NotAnIdentity();
    error BadExpiry();
    error NotYours();
    error UnknownFact();

    constructor(address _vault, address _owner) Ownable(_owner) {
        vault = IFactsVault(_vault);
    }

    function setIssuer(address who, bool ok) external onlyOwner {
        isIssuer[who] = ok;
        emit RoleSet("issuer", who, ok);
    }

    function setEscrow(address who, bool ok) external onlyOwner {
        isEscrow[who] = ok;
        emit RoleSet("escrow", who, ok);
    }

    function record(address subject, bytes32 kind, uint8 level, bytes32 evidenceHash, uint64 expiresAt)
        external
        returns (uint256 id)
    {
        if (!isIssuer[msg.sender]) revert NotIssuer();
        _requireIdentity(subject);
        if (expiresAt <= block.timestamp) revert BadExpiry();
        id = _facts.length;
        _facts.push(Fact(subject, kind, level, msg.sender, uint64(block.timestamp), expiresAt, false, evidenceHash));
        _bySubject[subject].push(id);
        emit FactRecorded(id, subject, kind, level, msg.sender, evidenceHash, expiresAt);
    }

    function revoke(uint256 id) external {
        if (id >= _facts.length) revert UnknownFact();
        Fact storage f = _facts[id];
        if (f.issuer != msg.sender) revert NotYours();
        f.revoked = true;
        emit FactRevoked(id, msg.sender);
    }

    /// @notice The escrow's reputation hook: a deal that settled or failed.
    function recordCompletion(bytes32 jobId, address buyer, address seller, uint8 outcome, uint256 dealAmount)
        external
    {
        if (!isEscrow[msg.sender]) revert NotEscrow();
        _requireIdentity(buyer);
        _requireIdentity(seller);
        emit DealRecorded(jobId, buyer, seller, outcome, 0, dealAmount);
    }

    /// @notice The escrow's reputation hook: a dispute ruled with a split.
    function recordResolution(bytes32 jobId, address buyer, address seller, uint16 sellerBps, uint256 dealAmount)
        external
    {
        if (!isEscrow[msg.sender]) revert NotEscrow();
        _requireIdentity(buyer);
        _requireIdentity(seller);
        emit DealRecorded(jobId, buyer, seller, 0, sellerBps, dealAmount);
    }

    function factsOf(address subject) external view returns (uint256[] memory) {
        return _bySubject[subject];
    }

    /// @notice Facts of a subject that are unrevoked and unexpired at `at`.
    function validFactsOf(address subject, uint64 at) external view returns (uint256[] memory out) {
        uint256[] storage ids = _bySubject[subject];
        uint256 n;
        for (uint256 i; i < ids.length; ++i) {
            if (_valid(_facts[ids[i]], at)) ++n;
        }
        out = new uint256[](n);
        n = 0;
        for (uint256 i; i < ids.length; ++i) {
            if (_valid(_facts[ids[i]], at)) out[n++] = ids[i];
        }
    }

    function getFact(uint256 id) external view returns (Fact memory) {
        if (id >= _facts.length) revert UnknownFact();
        return _facts[id];
    }

    function factCount() external view returns (uint256) {
        return _facts.length;
    }

    function _valid(Fact storage f, uint64 at) internal view returns (bool) {
        return !f.revoked && f.expiresAt > at;
    }

    function _requireIdentity(address a) internal view {
        if (a == address(0) || vault.resolveOwner(a) != a) revert NotAnIdentity();
    }
}
