// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KarwanSettlementBase} from "./KarwanSettlementBase.sol";
import {TimeTerms, TimeEngagement, TimeCycle, TimeState, TimeStore} from "./time/TimeTypes.sol";
import {TimeLib} from "./time/TimeLib.sol";
import {TimeDisputeLib} from "./time/TimeDisputeLib.sol";
import {Dispute} from "./dispute/DisputeLib.sol";

/// @title KarwanTimeEscrow
/// @notice Hourly, daily and unit work and retainers between one employer and
///         one worker. The employer funds one cycle's budget at a time, or
///         several ahead; the worker submits the units worked; the employer
///         approves, objects to some of them, or says nothing and they are paid
///         when the review window ends. Unused budget goes back or carries
///         forward, as the terms say. Either side ends the engagement with the
///         notice the terms give, and the engagement records one outcome when
///         it closes. The rules live in `TimeLib` and `TimeDisputeLib`, linked
///         once at deploy; every payout goes through the settlement base.
contract KarwanTimeEscrow is KarwanSettlementBase {
    TimeStore internal _g;

    constructor(address hub_) KarwanSettlementBase(hub_, "KarwanTime", "1") {}

    // ------------------------------- Views --------------------------------

    function dealIdFor(address employer, bytes32 salt) external view returns (bytes32) {
        return TimeLib.dealIdFor(employer, salt);
    }

    function termsHashOf(TimeTerms calldata t) external pure returns (bytes32) {
        return keccak256(abi.encode(t));
    }

    function amendHashOf(TimeTerms calldata t, uint16 fromCycle) external pure returns (bytes32) {
        return keccak256(abi.encode(t, fromCycle));
    }

    function getEngagement(bytes32 id) external view returns (TimeEngagement memory) {
        return _g.engagements[id];
    }

    function getCycle(bytes32 id, uint16 k) external view returns (TimeCycle memory) {
        return _g.cycles[id][k];
    }

    function getTerms(bytes32 id, uint16 version) external view returns (TimeTerms memory) {
        return _g.terms[id][version];
    }

    function settleAtOf(bytes32 id, uint16 k) external view returns (uint256) {
        return TimeLib.settleAt(_g, id, k);
    }

    function disputeOf(bytes32 id, uint16 k) external view returns (Dispute memory) {
        return _g.disputes.disputes[TimeLib.cycleKey(id, k)];
    }

    // ------------------------------ Actions -------------------------------

    /// @notice The employer offers an engagement and funds its first cycle. The
    ///         id comes from the chain, this escrow, the employer and a salt.
    function open(bytes32 salt, TimeTerms calldata t) external nonReentrant returns (bytes32) {
        return TimeLib.open(_s, _g, hub, salt, t);
    }

    function accept(bytes32 id, bytes32 termsHash) external {
        TimeLib.accept(_s, _g, id, termsHash);
    }

    function cancelOffer(bytes32 id) external nonReentrant {
        TimeLib.cancelOffer(_s, _g, hub, id);
    }

    function fundCycle(bytes32 id) external nonReentrant {
        TimeLib.fundCycle(_s, _g, hub, id);
    }

    function submit(bytes32 id, uint16 k, uint32 units, bytes32 evidence) external {
        TimeLib.submit(_g, id, k, units, evidence);
    }

    function approve(bytes32 id, uint16 k, uint32 units) external nonReentrant {
        TimeLib.approve(_s, _g, id, k, units);
    }

    function settle(bytes32 id, uint16 k) external nonReentrant {
        TimeLib.settle(_s, _g, id, k);
    }

    function object(bytes32 id, uint16 k, uint32 units, bytes32 clauseHash) external nonReentrant {
        TimeLib.object(_s, _g, id, k, units, clauseHash);
    }

    function dropObjection(bytes32 id, uint16 k) external {
        TimeLib.dropObjection(_s, _g, id, k);
    }

    function giveNotice(bytes32 id) external nonReentrant {
        TimeLib.giveNotice(_s, _g, id);
    }

    function endNow(bytes32 id) external nonReentrant {
        TimeLib.endNow(_s, _g, id);
    }

    function close(bytes32 id) external nonReentrant {
        TimeLib.close(_s, _g, hub, id);
    }

    function proposeAmendment(bytes32 id, TimeTerms calldata t, uint16 fromCycle) external {
        TimeLib.proposeAmendment(_s, _g, id, t, fromCycle);
    }

    function acceptAmendment(bytes32 id, TimeTerms calldata t, uint16 fromCycle) external {
        TimeLib.acceptAmendment(_s, _g, id, t, fromCycle);
    }

    // ------------------------------ Disputes ------------------------------

    function proposeRuling(bytes32 id, uint16 k, uint16 workerBps, bytes32 rulingHash) external {
        TimeDisputeLib.propose(_g, id, k, workerBps, rulingHash);
    }

    function escalate(bytes32 id, uint16 k) external {
        TimeDisputeLib.escalate(_s, _g, id, k);
    }

    function executeRuling(bytes32 id, uint16 k) external nonReentrant {
        TimeDisputeLib.executeRuling(_s, _g, id, k);
    }

    function rule(bytes32 id, uint16 k, uint16 workerBps, bytes32 rulingHash) external nonReentrant {
        TimeDisputeLib.rule(_s, _g, id, k, workerBps, rulingHash);
    }

    function applyFallback(bytes32 id, uint16 k) external nonReentrant {
        TimeDisputeLib.applyFallback(_s, _g, id, k);
    }

    // ------------------------------ Internals -----------------------------

    /// The long-stop paid out the engagement; nothing on it runs again.
    function _onLongstop(bytes32 id) internal override {
        _g.engagements[id].state = TimeState.Closed;
    }
}
