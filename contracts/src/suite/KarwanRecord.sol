// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, IKarwanIdentity, IKarwanRecord, Outcome} from "./interfaces/IKarwanSuite.sol";

/// @title KarwanRecord
/// @notice A person's record on chain: facts written by trusted issuers and
///         the endings of deals written by escrow families. Facts are never
///         changed or deleted; only their issuer marks one revoked. Outcomes
///         carry a value band, never an amount, and nothing here is a score or
///         personal data. Every entry belongs to an identity, never to an
///         unbound wallet or an agent.
contract KarwanRecord is IKarwanRecord {
    struct Fact {
        uint64 subject;
        uint8 level;
        bool revoked;
        uint64 issuedAt;
        uint64 expiresAt;
        address issuer;
        bytes32 kind;
        bytes32 evidenceSeal;
    }

    uint8 public constant MAX_BAND = 3;

    IKarwanHub public immutable hub;

    Fact[] internal _facts;
    mapping(uint64 => uint256[]) internal _bySubject;
    mapping(bytes32 => bool) public outcomeRecorded;

    event FactRecorded(
        uint256 indexed id,
        uint64 indexed subject,
        bytes32 indexed kind,
        uint8 level,
        address issuer,
        bytes32 evidenceSeal,
        uint64 expiresAt
    );
    event FactRevoked(uint256 indexed id, address issuer);
    event OutcomeRecorded(
        address indexed family,
        bytes32 indexed dealKey,
        uint64 indexed subject,
        uint8 role,
        uint8 outcome,
        uint8 band,
        uint16 detail
    );

    error NotIssuer();
    error NotFamily();
    error NotAnIdentity();
    error BadFact();
    error BadOutcome();
    error NotYours();
    error UnknownFact();
    error AlreadyRecorded();

    constructor(address hub_) {
        hub = IKarwanHub(hub_);
    }

    /// @notice Record a verified fact about the person a wallet belongs to.
    ///         `evidenceSeal` is a keyed fingerprint, so a guess cannot be
    ///         tested against it.
    function recordFact(address wallet, bytes32 kind, uint8 level, bytes32 evidenceSeal, uint64 expiresAt)
        external
        returns (uint256 id)
    {
        if (!hub.isIssuer(msg.sender)) revert NotIssuer();
        IKarwanIdentity idr = IKarwanIdentity(hub.identity());
        uint64 subject = idr.identityOf(wallet);
        if (subject == 0 || idr.isAgent(wallet)) revert NotAnIdentity();
        if (expiresAt <= block.timestamp || kind == bytes32(0) || evidenceSeal == bytes32(0)) revert BadFact();
        id = _facts.length;
        _facts.push(Fact(subject, level, false, uint64(block.timestamp), expiresAt, msg.sender, kind, evidenceSeal));
        _bySubject[subject].push(id);
        emit FactRecorded(id, subject, kind, level, msg.sender, evidenceSeal, expiresAt);
    }

    function revoke(uint256 id) external {
        if (id >= _facts.length) revert UnknownFact();
        Fact storage f = _facts[id];
        if (f.issuer != msg.sender) revert NotYours();
        f.revoked = true;
        emit FactRevoked(id, msg.sender);
    }

    /// @notice A family records how a deal ended for one of its parties, once.
    function recordOutcome(bytes32 dealKey, uint64 subject, uint8 role, uint8 outcome, uint8 band, uint16 detail)
        external
    {
        if (!hub.isFamily(msg.sender)) revert NotFamily();
        if (subject == 0 || subject > IKarwanIdentity(hub.identity()).identityCount()) revert NotAnIdentity();
        if (outcome == 0 || outcome > Outcome.MAX || band > MAX_BAND) revert BadOutcome();
        bytes32 key = outcomeKey(msg.sender, dealKey, subject, role);
        if (outcomeRecorded[key]) revert AlreadyRecorded();
        outcomeRecorded[key] = true;
        emit OutcomeRecorded(msg.sender, dealKey, subject, role, outcome, band, detail);
    }

    // -------------------------------- Views -------------------------------

    function outcomeKey(address family, bytes32 dealKey, uint64 subject, uint8 role) public pure returns (bytes32) {
        return keccak256(abi.encode(family, dealKey, subject, role));
    }

    function factsOf(uint64 subject) external view returns (uint256[] memory) {
        return _bySubject[subject];
    }

    /// @notice Facts of a person that are unrevoked and unexpired at `at`.
    function validFactsOf(uint64 subject, uint64 at) external view returns (uint256[] memory out) {
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
}
