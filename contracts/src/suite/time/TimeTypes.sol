// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DisputeStore} from "../dispute/DisputeLib.sol";

/// @notice What both sides agree for an engagement, or for every cycle from an
///         amendment on. The worker accepts the hash of exactly these bytes.
struct TimeTerms {
    address asset;
    address worker;
    /// The price of one whole unit: an hour, a day, an item, or a whole
    /// retainer cycle.
    uint128 rate;
    /// Units are claimed in steps of 1/unitScale: 60 bills an hourly rate by
    /// the minute, 1 bills whole units, as a retainer does.
    uint32 unitScale;
    /// The most one cycle can bill, in those steps.
    uint32 maxUnits;
    /// The length of a cycle, 1 to 31 days. Never changed by an amendment.
    uint32 cycleSecs;
    /// How many cycles the engagement plans, counting from the first.
    uint16 cycles;
    /// When the first cycle starts. Never changed by an amendment.
    uint64 startsAt;
    /// The worker accepts the engagement, or the other side an amendment,
    /// before this time.
    uint64 acceptBy;
    /// How long after a cycle ends the worker can still submit units for it.
    uint32 claimGrace;
    /// The employer's time to approve or object once the claim grace ends
    /// and the claim is final.
    uint32 reviewWindow;
    /// How many more cycles run after either side gives notice, 0 to 4.
    uint8 noticeCycles;
    /// Unused budget carries into later cycles instead of going back at once.
    bool rollover;
    /// The partial share an automatic ruling may propose, in basis points to
    /// the worker. 0 = none.
    uint16 partialBps;
    /// The worker's share of disputed units if the reviewer misses the ruling
    /// deadline, in basis points.
    uint16 fallbackBps;
    /// Digest of the full signed agreement off chain.
    bytes32 agreementHash;
}

enum TimeState {
    None,
    Offered,
    Active,
    Ending,
    Closed
}

/// One engagement: one employer, one worker, one settlement account for its
/// whole life, and one record when it closes.
struct TimeEngagement {
    TimeState state;
    /// The latest terms version; version 0 is what the worker accepted.
    uint16 version;
    /// The next cycle the employer can fund. Cycles are funded in order.
    uint16 nextCycle;
    /// How many cycles run in total: the plan, cut short by notice.
    uint16 runs;
    /// Funded cycles not yet settled.
    uint16 open;
    /// A dispute on one of its cycles ended in a ruling.
    bool ruled;
    /// Who asked to end the engagement at once, and in which cycle; the other
    /// side agreeing in that same cycle ends it.
    address endAsked;
    uint16 endAskedIn;
    bytes32 termsHash;
    /// Unused budget carried forward, spent on the next funding or returned
    /// when the engagement closes.
    uint128 carry;
    /// Everything the worker has been paid for, before the fee.
    uint128 paidGross;
    /// The proposed amendment: the hash of its terms and first cycle, and who
    /// proposed it.
    bytes32 amendHash;
    address amendBy;
}

/// One funded cycle.
struct TimeCycle {
    uint8 state;
    /// The terms version the cycle was funded under.
    uint16 version;
    /// Units the worker has submitted, in total for the cycle.
    uint32 claimed;
    /// Units approved or paid by silence so far.
    uint32 approved;
    /// Units under dispute.
    uint32 disputed;
    uint64 claimedAt;
    /// Money held for the cycle: its budget plus the employer's fee share.
    uint128 funded;
    /// What the worker has been paid for this cycle, before the fee.
    uint128 paidGross;
    bytes32 evidence;
}

struct TimeStore {
    mapping(bytes32 => TimeEngagement) engagements;
    mapping(bytes32 => mapping(uint16 => TimeTerms)) terms;
    /// The first cycle each terms version applies to.
    mapping(bytes32 => mapping(uint16 => uint16)) versionFrom;
    mapping(bytes32 => mapping(uint16 => TimeCycle)) cycles;
    /// The panel fixed when the engagement opened, copied to a cycle's
    /// dispute key when a dispute opens.
    mapping(bytes32 => address) arbiterOf;
    mapping(bytes32 => address) reviewerOf;
    /// The asset's high-value line at opening, kept while the standard
    /// reviewer serves: an amendment that lifts the planned total past it
    /// brings the senior reviewer.
    mapping(bytes32 => uint256) highValueOf;
    DisputeStore disputes;
}
