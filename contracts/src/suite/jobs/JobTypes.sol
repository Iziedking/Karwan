// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DisputeStore} from "../dispute/DisputeLib.sol";

/// @notice ERC-8183 job states, in the standard's order.
enum JobStatus {
    Open,
    Funded,
    Submitted,
    Completed,
    Rejected,
    Expired
}

/// @notice A job as ERC-8183 reports it.
struct Job {
    uint256 id;
    address client;
    address provider;
    address evaluator;
    string description;
    uint256 budget;
    uint256 expiredAt;
    JobStatus status;
    address hook;
}

/// @notice Karwan's terms on top of ERC-8183. `createJob` uses the defaults:
///         a 5-day review, half as the partial ruling the arbiter may
///         propose, and half as the fallback.
struct JobTerms {
    /// After the provider submits, how long the evaluator has to complete or
    /// reject; then anyone can complete the job for the provider.
    uint32 reviewWindow;
    /// The partial share an automatic ruling may propose, in basis points to
    /// the provider. 0 = none.
    uint16 partialBps;
    /// The provider's share if the reviewer misses the ruling deadline.
    uint16 fallbackBps;
}

/// @notice A bounty or contest: entrants submit before `entriesBy`, and the
///         evaluator awards the places from their entries by `awardBy`.
struct BountyTerms {
    address evaluator;
    uint128 prize;
    uint64 entriesBy;
    uint64 awardBy;
    /// Each place's share of the prize in basis points, first place first,
    /// at most 8 places, summing to 10,000.
    uint16[] shares;
    string description;
}

struct JobCore {
    JobStatus status;
    bool bounty;
    /// The provider disputed a rejection of the submitted work.
    bool disputed;
    /// A job: the last moment to fund and to submit. A bounty: the entry
    /// deadline.
    uint64 expiredAt;
    uint64 submittedAt;
    /// When the evaluator rejected the submitted work; the money waits for
    /// the provider's dispute window.
    uint64 rejectedAt;
    uint32 reviewWindow;
    uint16 partialBps;
    uint16 fallbackBps;
    address client;
    /// A bounty: the last moment to award.
    uint64 awardBy;
    address provider;
    /// A bounty: how many entrants entered.
    uint32 entries;
    address evaluator;
    uint128 budget;
    bytes32 deliverable;
    bytes32 reason;
    string description;
}

struct JobStore {
    uint256 count;
    mapping(uint256 => JobCore) jobs;
    mapping(uint256 => uint16[]) shares;
    mapping(uint256 => mapping(address => bytes32)) entries;
    DisputeStore disputes;
}
