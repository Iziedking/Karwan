// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, Outcome} from "../interfaces/IKarwanSuite.sol";
import {SettlementStore, SettlementLib, DealAccount} from "../settlement/SettlementLib.sol";
import {DisputeLib} from "../dispute/DisputeLib.sol";
import {TimeTerms, TimeState, TimeEngagement, TimeCycle, TimeStore} from "./TimeTypes.sol";

/// @title TimeLib
/// @notice Hourly, daily and unit work and retainers, one cycle at a time. The
///         employer funds each cycle's budget before it ends, the worker submits
///         the units worked with a fingerprint of the work log, and the employer
///         approves, objects to some of the units, or says nothing, in which
///         case the submitted units are paid once the review window ends. Only
///         objected units wait for a ruling. Unused budget goes back, or carries
///         forward when the terms say so. Linked once at deploy; every payout
///         goes through the settlement base.
library TimeLib {
    uint16 internal constant BPS = 10_000;
    uint32 internal constant MIN_CYCLE = 1 days;
    uint32 internal constant MAX_CYCLE = 31 days;
    uint32 internal constant MIN_REVIEW = 1 hours;
    uint32 internal constant MAX_REVIEW = 14 days;
    uint32 internal constant MAX_GRACE = 7 days;
    uint8 internal constant MAX_NOTICE = 4;
    uint16 internal constant MAX_CYCLES = 520;
    uint32 internal constant MAX_SCALE = 10_000;
    uint64 internal constant MAX_START = 90 days;
    uint64 internal constant MAX_AMEND_WAIT = 30 days;
    uint16 internal constant MAX_VERSIONS = 32;

    uint8 internal constant FUNDED = 1;
    uint8 internal constant DISPUTED = 2;
    uint8 internal constant SETTLED = 3;

    uint8 internal constant EMPLOYER = 0;
    uint8 internal constant WORKER = 1;

    event EngagementOffered(bytes32 indexed id, address indexed employer, address indexed worker, bytes32 termsHash);
    event EngagementAccepted(bytes32 indexed id);
    event EngagementCancelled(bytes32 indexed id, uint256 refunded);
    event CycleFunded(bytes32 indexed id, uint16 indexed cycle, uint256 paid, uint256 fromCarry);
    event UnitsSubmitted(bytes32 indexed id, uint16 indexed cycle, uint32 units, bytes32 evidence);
    event UnitsApproved(bytes32 indexed id, uint16 indexed cycle, uint32 units);
    event UnitsObjected(bytes32 indexed id, uint16 indexed cycle, uint32 units);
    event ObjectionDropped(bytes32 indexed id, uint16 indexed cycle);
    event CycleSettled(bytes32 indexed id, uint16 indexed cycle, uint256 gross, uint256 unused, bool carried);
    event NoticeGiven(bytes32 indexed id, address indexed by, uint16 runs);
    event EndAsked(bytes32 indexed id, address indexed by);
    event AmendmentProposed(bytes32 indexed id, address indexed by, bytes32 amendHash, uint16 fromCycle);
    event AmendmentAccepted(bytes32 indexed id, uint16 version, uint16 fromCycle);
    event EngagementClosed(bytes32 indexed id, uint256 paidGross, uint256 refunded);

    error BadTerms();
    error BadState();
    error BadCaller();
    error BadUnits();
    error Late();
    error Early();
    error HashMismatch();
    error OnHold();

    // ------------------------------ Opening -------------------------------

    function dealIdFor(address employer, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), employer, salt));
    }

    /// @notice The employer offers an engagement and funds its first cycle.
    function open(SettlementStore storage s, TimeStore storage g, IKarwanHub hub, bytes32 salt, TimeTerms calldata t)
        external
        returns (bytes32 id)
    {
        _validate(t, true);
        id = dealIdFor(msg.sender, salt);
        address[] memory payees = new address[](1);
        payees[0] = t.worker;
        IKarwanHub.OpeningConfig memory cfg =
            SettlementLib.open(s, hub, id, t.asset, msg.sender, payees, _horizonOf(t, t, 0));
        TimeEngagement storage e = g.engagements[id];
        e.state = TimeState.Offered;
        e.runs = t.cycles;
        e.termsHash = keccak256(abi.encode(t));
        g.terms[id][0] = t;
        g.arbiterOf[id] = cfg.autoArbiter;
        uint256 planned = budgetOf(t) * t.cycles;
        if (cfg.highValue != 0 && planned >= cfg.highValue) {
            g.reviewerOf[id] = cfg.seniorSafe;
        } else {
            g.reviewerOf[id] = cfg.reviewSafe;
            g.highValueOf[id] = cfg.highValue;
        }
        emit EngagementOffered(id, msg.sender, t.worker, e.termsHash);
        _fundNext(s, g, hub, id);
    }

    /// @notice The worker accepts the exact terms the employer offered, in time.
    function accept(SettlementStore storage s, TimeStore storage g, bytes32 id, bytes32 termsHash) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Offered) revert BadState();
        TimeTerms storage t = g.terms[id][0];
        if (msg.sender != t.worker) revert BadCaller();
        if (block.timestamp > t.acceptBy) revert Late();
        if (termsHash != e.termsHash) revert HashMismatch();
        e.state = TimeState.Active;
        SettlementLib.markConsent(s, id, msg.sender);
        emit EngagementAccepted(id);
    }

    /// @notice The employer takes an offer back before the worker accepts it.
    function cancelOffer(SettlementStore storage s, TimeStore storage g, IKarwanHub hub, bytes32 id) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Offered) revert BadState();
        address employer = _onlyEmployer(s, id);
        uint256 amount = s.accounts[id].balance;
        e.state = TimeState.Closed;
        e.open = 0;
        emit EngagementCancelled(id, amount);
        SettlementLib.payTo(s, id, employer, amount);
        SettlementLib.close(s, id);
        SettlementLib.recordOutcome(s, hub, id, EMPLOYER, Outcome.CANCELLED, 0);
    }

    // ------------------------------ Funding -------------------------------

    /// @notice The employer funds the next cycle's budget, any time before that
    ///         cycle ends, up to the horizon the settlement base allows, also
    ///         during a notice period.
    function fundCycle(SettlementStore storage s, TimeStore storage g, IKarwanHub hub, bytes32 id) external {
        _live(g, id);
        _onlyEmployer(s, id);
        _fundNext(s, g, hub, id);
    }

    // ------------------------------- Claims -------------------------------

    /// @notice The worker submits the units worked in a cycle so far, in total,
    ///         with a fingerprint of the work log, from the cycle's start until
    ///         its claim grace ends; the employer's review starts then.
    function submit(TimeStore storage g, bytes32 id, uint16 k, uint32 units, bytes32 evidence) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Active && e.state != TimeState.Ending) revert BadState();
        TimeTerms storage t0 = g.terms[id][0];
        if (msg.sender != t0.worker) revert BadCaller();
        TimeCycle storage c = g.cycles[id][k];
        if (c.state != FUNDED) revert BadState();
        TimeTerms storage t = g.terms[id][c.version];
        if (block.timestamp < cycleStart(t0, k)) revert Early();
        if (block.timestamp >= uint256(cycleEnd(t0, k)) + t.claimGrace) revert Late();
        if (units < c.approved || units > t.maxUnits) revert BadUnits();
        c.claimed = units;
        c.claimedAt = uint64(block.timestamp);
        c.evidence = evidence;
        emit UnitsSubmitted(id, k, units, evidence);
    }

    /// @notice The employer approves submitted units, which are paid at once.
    function approve(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint32 units) external {
        _live(g, id);
        _onlyEmployer(s, id);
        TimeCycle storage c = g.cycles[id][k];
        if (c.state != FUNDED) revert BadState();
        if (units <= c.approved || units > c.claimed) revert BadUnits();
        c.approved = units;
        emit UnitsApproved(id, k, units);
        _payUpTo(s, g, id, k, grossOf(g.terms[id][c.version], units));
    }

    /// @notice Once the review window ends, anyone pays the submitted units and
    ///         settles the cycle: silence pays.
    function settle(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k) external {
        _live(g, id);
        _notHeld(s, id);
        TimeCycle storage c = g.cycles[id][k];
        if (c.state != FUNDED) revert BadState();
        if (block.timestamp < settleAt(g, id, k)) revert Early();
        c.approved = c.claimed;
        _finish(s, g, id, k, grossOf(g.terms[id][c.version], c.claimed));
    }

    /// @notice Once the claim grace ends and the claim is final, and before the
    ///         review window closes, the employer objects to some of the unpaid
    ///         units. The rest are paid at once; only the objected units wait
    ///         for the dispute.
    function object(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint32 units, bytes32 clauseHash)
        external
    {
        _live(g, id);
        _onlyEmployer(s, id);
        TimeCycle storage c = g.cycles[id][k];
        if (c.state != FUNDED) revert BadState();
        uint256 claimsEnd = uint256(cycleEnd(g.terms[id][0], k)) + g.terms[id][c.version].claimGrace;
        if (block.timestamp < claimsEnd) revert Early();
        if (block.timestamp >= settleAt(g, id, k)) revert Late();
        if (units == 0 || units > c.claimed - c.approved) revert BadUnits();
        uint32 undisputed = c.claimed - units;
        c.disputed = units;
        c.state = DISPUTED;
        bytes32 key = cycleKey(id, k);
        DisputeLib.setPanel(g.disputes, key, g.arbiterOf[id], g.reviewerOf[id]);
        DisputeLib.open(g.disputes, key, clauseHash);
        emit UnitsObjected(id, k, units);
        if (undisputed > c.approved) {
            c.approved = undisputed;
            _payUpTo(s, g, id, k, grossOf(g.terms[id][c.version], undisputed));
        }
    }

    /// @notice The employer withdraws an objection; the units go back to
    ///         waiting for approval or silence.
    function dropObjection(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k) external {
        _live(g, id);
        _onlyEmployer(s, id);
        TimeCycle storage c = g.cycles[id][k];
        if (c.state != DISPUTED) revert BadState();
        c.state = FUNDED;
        c.disputed = 0;
        DisputeLib.drop(g.disputes, cycleKey(id, k));
        emit ObjectionDropped(id, k);
    }

    /// @notice Pays a ruling on a cycle's objected units: the worker's share of
    ///         their price, the rest back, and the cycle settles.
    function payRuling(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint16 workerBps)
        public
    {
        _live(g, id);
        TimeCycle storage c = g.cycles[id][k];
        TimeTerms storage t = g.terms[id][c.version];
        uint256 base = grossOf(t, c.approved);
        uint256 award = ((grossOf(t, c.approved + c.disputed) - base) * workerBps) / BPS;
        c.disputed = 0;
        g.engagements[id].ruled = true;
        _finish(s, g, id, k, base + award);
    }

    // ------------------------------- Ending -------------------------------

    /// @notice Either side ends the engagement with the notice the terms give:
    ///         the current cycle and that many more still run; cycles funded
    ///         beyond them are refunded at once.
    function giveNotice(SettlementStore storage s, TimeStore storage g, bytes32 id) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Active) revert BadState();
        _onlyParty(s, g, id);
        uint256 cur = _cyclesStarted(g.terms[id][0]);
        uint256 notice = g.terms[id][_versionFor(g, id, cur == 0 ? 0 : uint16(cur - 1))].noticeCycles;
        _endAfter(s, g, id, cur + notice);
    }

    /// @notice Both sides together end the engagement at once: the current
    ///         cycle still settles for the work in it, nothing after it runs.
    function endNow(SettlementStore storage s, TimeStore storage g, bytes32 id) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Active && e.state != TimeState.Ending) revert BadState();
        _onlyParty(s, g, id);
        address asked = e.endAsked;
        uint16 cur = uint16(_cyclesStarted(g.terms[id][0]));
        if (asked == address(0) || asked == msg.sender || e.endAskedIn != cur) {
            e.endAsked = msg.sender;
            e.endAskedIn = cur;
            emit EndAsked(id, msg.sender);
            return;
        }
        e.endAsked = address(0);
        _endAfter(s, g, id, cur);
    }

    /// @notice Anyone closes an engagement with nothing left to run: every cycle
    ///         that runs is settled, or the next one ended unfunded. Unused
    ///         carry goes back, and the relationship's one outcome is recorded.
    function close(SettlementStore storage s, TimeStore storage g, IKarwanHub hub, bytes32 id) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Active && e.state != TimeState.Ending) revert BadState();
        if (e.open != 0) revert BadState();
        if (e.nextCycle < e.runs && block.timestamp < cycleEnd(g.terms[id][0], e.nextCycle)) revert Early();
        uint256 refund = e.carry;
        e.carry = 0;
        e.state = TimeState.Closed;
        uint8 outcome = e.ruled ? Outcome.RULED : (e.paidGross == 0 ? Outcome.CANCELLED : Outcome.COMPLETED);
        emit EngagementClosed(id, e.paidGross, refund);
        SettlementLib.payTo(s, id, s.accounts[id].payer, refund);
        SettlementLib.close(s, id);
        SettlementLib.setRecordValue(s, id, e.paidGross);
        SettlementLib.recordOutcome(s, hub, id, EMPLOYER, outcome, 0);
        SettlementLib.recordOutcome(s, hub, id, WORKER, outcome, 0);
    }

    // ----------------------------- Amendments -----------------------------

    /// @notice Either side proposes new terms for every cycle from `fromCycle`
    ///         on, which must not be funded yet. The asset, the worker, the
    ///         cycle length and the start never change.
    function proposeAmendment(
        SettlementStore storage s,
        TimeStore storage g,
        bytes32 id,
        TimeTerms calldata t,
        uint16 fromCycle
    ) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Active) revert BadState();
        _onlyParty(s, g, id);
        _checkAmendment(g, id, t, fromCycle);
        e.amendHash = keccak256(abi.encode(t, fromCycle));
        e.amendBy = msg.sender;
        emit AmendmentProposed(id, msg.sender, e.amendHash, fromCycle);
    }

    /// @notice The other side accepts the exact amendment, in time.
    function acceptAmendment(
        SettlementStore storage s,
        TimeStore storage g,
        bytes32 id,
        TimeTerms calldata t,
        uint16 fromCycle
    ) external {
        TimeEngagement storage e = g.engagements[id];
        if (e.state != TimeState.Active) revert BadState();
        _onlyParty(s, g, id);
        if (e.amendBy == address(0) || msg.sender == e.amendBy) revert BadCaller();
        if (keccak256(abi.encode(t, fromCycle)) != e.amendHash) revert HashMismatch();
        if (block.timestamp > t.acceptBy) revert Late();
        _checkAmendment(g, id, t, fromCycle);
        uint16 v = e.version + 1;
        e.version = v;
        g.terms[id][v] = t;
        g.versionFrom[id][v] = fromCycle;
        e.runs = t.cycles;
        e.amendHash = bytes32(0);
        e.amendBy = address(0);
        uint256 hv = g.highValueOf[id];
        if (hv != 0 && budgetOf(t) * t.cycles >= hv) {
            g.reviewerOf[id] = s.accounts[id].seniorSafe;
            g.highValueOf[id] = 0;
        }
        emit AmendmentAccepted(id, v, fromCycle);
    }

    // -------------------------------- Views -------------------------------

    function budgetOf(TimeTerms memory t) public pure returns (uint256) {
        return grossOf(t, t.maxUnits);
    }

    function grossOf(TimeTerms memory t, uint256 units) public pure returns (uint256) {
        return (uint256(t.rate) * units) / t.unitScale;
    }

    function cycleStart(TimeTerms storage t0, uint256 k) internal view returns (uint64) {
        return uint64(uint256(t0.startsAt) + k * t0.cycleSecs);
    }

    function cycleEnd(TimeTerms storage t0, uint256 k) internal view returns (uint64) {
        return uint64(uint256(t0.startsAt) + (k + 1) * t0.cycleSecs);
    }

    /// @notice When anyone may settle a cycle: its claim grace has ended, and so
    ///         has the review window that follows it, unless every submitted
    ///         unit is already approved.
    function settleAt(TimeStore storage g, bytes32 id, uint16 k) public view returns (uint256 at) {
        TimeCycle storage c = g.cycles[id][k];
        TimeTerms storage t = g.terms[id][c.version];
        at = uint256(cycleEnd(g.terms[id][0], k)) + t.claimGrace;
        if (c.claimed > c.approved) at += t.reviewWindow;
    }

    function cycleKey(bytes32 id, uint16 k) public pure returns (bytes32) {
        return keccak256(abi.encode(id, k));
    }

    // ------------------------------ Internals -----------------------------

    function _fundNext(SettlementStore storage s, TimeStore storage g, IKarwanHub hub, bytes32 id) private {
        TimeEngagement storage e = g.engagements[id];
        uint16 k = e.nextCycle;
        if (k >= e.runs) revert BadState();
        TimeTerms storage t0 = g.terms[id][0];
        if (block.timestamp >= cycleEnd(t0, k)) revert Late();
        uint16 v = _versionFor(g, id, k);
        TimeTerms storage t = g.terms[id][v];
        uint256 budget = budgetOf(t);
        uint256 total = budget + ((budget * s.accounts[id].feeBps) / BPS) / 2;
        uint256 carried = e.carry < total ? e.carry : total;
        e.carry -= uint128(carried);
        g.cycles[id][k] = TimeCycle(FUNDED, v, 0, 0, 0, 0, uint128(total), 0, bytes32(0));
        e.nextCycle = k + 1;
        e.open += 1;
        SettlementLib.extendHorizon(s, id, _horizonOf(t0, t, k));
        emit CycleFunded(id, k, total - carried, carried);
        if (total > carried) SettlementLib.fund(s, hub, id, total - carried);
    }

    /// Pays the worker up to `gross` for a cycle, in total: the worker's net
    /// and the fee for the new part only, so every split is exact in the end.
    function _payUpTo(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint256 gross) private {
        (uint256 toWorker, uint256 toFee) = _book(s, g, id, k, gross);
        _pay(s, g, id, toWorker, toFee);
    }

    /// Settles a cycle at `gross` in total: what it did not pay goes back to
    /// the employer, or carries forward when its terms say so and a later
    /// cycle is still to be funded. The books and the event come before any payment.
    function _finish(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint256 gross) private {
        TimeEngagement storage e = g.engagements[id];
        TimeCycle storage c = g.cycles[id][k];
        (uint256 toWorker, uint256 toFee) = _book(s, g, id, k, gross);
        uint256 paid = c.paidGross;
        uint256 unused = uint256(c.funded) - paid - ((paid * s.accounts[id].feeBps) / BPS) / 2;
        c.state = SETTLED;
        e.open -= 1;
        bool carried = g.terms[id][c.version].rollover && e.state == TimeState.Active && e.nextCycle < e.runs;
        if (carried) e.carry += uint128(unused);
        emit CycleSettled(id, k, paid, unused, carried);
        _pay(s, g, id, toWorker, toFee);
        if (!carried) SettlementLib.payTo(s, id, s.accounts[id].payer, unused);
    }

    function _book(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint256 gross)
        private
        returns (uint256 toWorker, uint256 toFee)
    {
        TimeCycle storage c = g.cycles[id][k];
        uint256 old = c.paidGross;
        if (gross <= old) return (0, 0);
        uint16 feeBps = s.accounts[id].feeBps;
        uint256 feeNew = (gross * feeBps) / BPS;
        uint256 feeOld = (old * feeBps) / BPS;
        toWorker = (gross - (feeNew - feeNew / 2)) - (old - (feeOld - feeOld / 2));
        toFee = feeNew - feeOld;
        c.paidGross = uint128(gross);
        g.engagements[id].paidGross += uint128(gross - old);
    }

    function _pay(SettlementStore storage s, TimeStore storage g, bytes32 id, uint256 toWorker, uint256 toFee) private {
        SettlementLib.payTo(s, id, g.terms[id][0].worker, toWorker);
        SettlementLib.payFee(s, id, toFee);
    }

    /// Cuts the engagement to `runs` cycles; funded cycles from there on have
    /// not started, so they go back in full.
    function _endAfter(SettlementStore storage s, TimeStore storage g, bytes32 id, uint256 runs) private {
        TimeEngagement storage e = g.engagements[id];
        if (runs > e.runs) runs = e.runs;
        e.state = TimeState.Ending;
        e.runs = uint16(runs);
        emit NoticeGiven(id, msg.sender, uint16(runs));
        uint16 funded = e.nextCycle;
        if (funded <= runs) return;
        e.nextCycle = uint16(runs);
        uint256 refund;
        for (uint16 k = uint16(runs); k < funded; ++k) {
            TimeCycle storage c = g.cycles[id][k];
            refund += c.funded;
            c.state = SETTLED;
            e.open -= 1;
        }
        SettlementLib.payTo(s, id, s.accounts[id].payer, refund);
    }

    /// The number of cycles that have started by now.
    function _cyclesStarted(TimeTerms storage t0) private view returns (uint256) {
        if (block.timestamp < t0.startsAt) return 0;
        return (block.timestamp - t0.startsAt) / t0.cycleSecs + 1;
    }

    function _versionFor(TimeStore storage g, bytes32 id, uint16 k) private view returns (uint16 v) {
        v = g.engagements[id].version;
        while (v != 0 && g.versionFrom[id][v] > k) --v;
    }

    function _horizonOf(TimeTerms memory t0, TimeTerms memory t, uint256 k) private pure returns (uint64) {
        return uint64(
            uint256(t0.startsAt) + (k + 1) * t0.cycleSecs + t.claimGrace + t.reviewWindow + DisputeLib.LONGEST
                + SettlementLib.HOLD_BUDGET
        );
    }

    function _checkAmendment(TimeStore storage g, bytes32 id, TimeTerms calldata t, uint16 fromCycle) private view {
        TimeTerms storage t0 = g.terms[id][0];
        if (
            t.asset != t0.asset || t.worker != t0.worker || t.cycleSecs != t0.cycleSecs || t.startsAt != t0.startsAt
                || fromCycle < g.engagements[id].nextCycle || t.cycles < fromCycle
                || g.engagements[id].version >= MAX_VERSIONS || t.acceptBy > block.timestamp + MAX_AMEND_WAIT
        ) revert BadTerms();
        _validate(t, false);
    }

    function _validate(TimeTerms calldata t, bool first) private view {
        if (t.worker == address(0) || t.rate == 0 || t.unitScale == 0 || t.unitScale > MAX_SCALE || t.maxUnits == 0) {
            revert BadTerms();
        }
        if (t.cycleSecs < MIN_CYCLE || t.cycleSecs > MAX_CYCLE || t.cycles == 0 || t.cycles > MAX_CYCLES) {
            revert BadTerms();
        }
        if (t.reviewWindow < MIN_REVIEW || t.reviewWindow > MAX_REVIEW || t.claimGrace > MAX_GRACE) revert BadTerms();
        if (t.noticeCycles > MAX_NOTICE || t.partialBps >= BPS || t.fallbackBps > BPS || t.agreementHash == bytes32(0)) {
            revert BadTerms();
        }
        if (budgetOf(t) == 0 || budgetOf(t) > type(uint128).max) revert BadTerms();
        if (t.acceptBy <= block.timestamp) revert BadTerms();
        if (first && (t.startsAt < block.timestamp || t.startsAt > block.timestamp + MAX_START || t.acceptBy > t.startsAt + t.cycleSecs)) {
            revert BadTerms();
        }
    }

    function _onlyEmployer(SettlementStore storage s, bytes32 id) private view returns (address employer) {
        employer = s.accounts[id].payer;
        if (msg.sender != employer) revert BadCaller();
    }

    function _onlyParty(SettlementStore storage s, TimeStore storage g, bytes32 id) private view {
        if (msg.sender != s.accounts[id].payer && msg.sender != g.terms[id][0].worker) revert BadCaller();
    }

    /// An engagement still running or in its notice period.
    function _live(TimeStore storage g, bytes32 id) private view {
        TimeState st = g.engagements[id].state;
        if (st != TimeState.Active && st != TimeState.Ending) revert BadState();
    }

    function _notHeld(SettlementStore storage s, bytes32 id) internal view {
        if (s.accounts[id].holdUntil > block.timestamp) revert OnHold();
    }
}
