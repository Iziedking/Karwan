// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, IKarwanIdentity, Outcome} from "../interfaces/IKarwanSuite.sol";
import {IAgenticCommerce} from "../interfaces/IAgenticCommerce.sol";
import {SettlementStore, SettlementLib} from "../settlement/SettlementLib.sol";
import {JobStatus, BountyTerms, JobCore, JobStore} from "./JobTypes.sol";
import {JobLib} from "./JobLib.sol";

/// @title BountyLib
/// @notice Bounties and contests with one or more winners. The client funds
///         the prize and half the fee on it; entrants submit a fingerprint of
///         their work before the entry deadline; the evaluator awards the
///         places from those entries, each place's share fixed in the terms.
///         Winners become payees only when they are awarded, before any money
///         leaves. Awards are final.
///
///         Once someone has entered, the prize goes to entrants (view 88):
///         the evaluator may still award during a 3-day wait after the award
///         deadline; after it, anyone triggers the payout to the earliest
///         valid entries, in order of first entry, and the client's record
///         shows the bounty was not judged. The evaluator can mark an entry
///         not valid, with a reason, until the payout opens; a marked entry is
///         never paid. With no entry, or every entry marked, the prize goes
///         back to the client.
library BountyLib {
    uint16 internal constant BPS = 10_000;
    uint256 internal constant MAX_PLACES = 8;
    uint64 internal constant MAX_AWARD_WAIT = 60 days;
    /// After the award deadline, before anyone can pay the entrants.
    uint64 internal constant WAIT = 3 days;
    /// The most entries a bounty takes, so the payout always fits in a block.
    uint256 internal constant MAX_SLOTS = 1_000;

    event BountyOpened(
        uint256 indexed jobId,
        address indexed client,
        address indexed evaluator,
        uint256 prize,
        uint64 entriesBy,
        uint64 awardBy
    );
    event Entered(uint256 indexed jobId, address indexed entrant, bytes32 deliverable);
    event BountyAwarded(uint256 indexed jobId, address[] winners, uint256 paid);
    event EntryRejected(uint256 indexed jobId, address indexed entrant, bytes32 reason);

    error BadWinners();
    error Full();

    /// @notice The client opens and funds a bounty in one step.
    function open(SettlementStore storage s, JobStore storage g, IKarwanHub hub, address asset, BountyTerms calldata t)
        external
        returns (uint256 id)
    {
        uint256 places = t.shares.length;
        if (t.evaluator == address(0)) revert JobLib.BadParties();
        if (t.prize == 0 || places == 0 || places > MAX_PLACES) revert JobLib.BadTerms();
        uint256 sum;
        for (uint256 i; i < places; ++i) {
            if (t.shares[i] == 0) revert JobLib.BadTerms();
            sum += t.shares[i];
        }
        if (sum != BPS) revert JobLib.BadTerms();
        if (
            t.entriesBy < block.timestamp + JobLib.MIN_EXPIRY || t.entriesBy > block.timestamp + JobLib.MAX_EXPIRY
                || t.awardBy <= t.entriesBy || t.awardBy > t.entriesBy + MAX_AWARD_WAIT
        ) revert JobLib.BadTerms();
        if (bytes(t.description).length > JobLib.MAX_DESCRIPTION) revert JobLib.BadTerms();
        id = ++g.count;
        JobCore storage j = g.jobs[id];
        j.status = JobStatus.Funded;
        j.bounty = true;
        j.client = msg.sender;
        j.evaluator = t.evaluator;
        j.expiredAt = t.entriesBy;
        j.awardBy = t.awardBy;
        j.budget = t.prize;
        j.description = t.description;
        g.shares[id] = t.shares;
        bytes32 key = bytes32(id);
        IKarwanHub.OpeningConfig memory cfg = SettlementLib.open(
            s, hub, key, asset, msg.sender, new address[](0), uint64(t.awardBy + WAIT + SettlementLib.HOLD_BUDGET)
        );
        emit BountyOpened(id, msg.sender, t.evaluator, t.prize, t.entriesBy, t.awardBy);
        SettlementLib.fund(s, hub, key, uint256(t.prize) + ((uint256(t.prize) * cfg.feeBps) / BPS) / 2);
    }

    /// @notice Anyone but the client, the client's own wallets and the
    ///         evaluator enters before the deadline, or replaces their entry.
    function enter(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id, bytes32 deliverable)
        external
    {
        JobCore storage j = _bounty(g, id);
        if (msg.sender == j.client || msg.sender == j.evaluator) revert JobLib.BadCaller();
        uint64 who = IKarwanIdentity(hub.identity()).identityOf(msg.sender);
        if (who != 0 && who == s.accounts[bytes32(id)].payerId) revert JobLib.BadCaller();
        if (block.timestamp >= j.expiredAt) revert JobLib.Late();
        if (deliverable == bytes32(0)) revert JobLib.BadTerms();
        if (g.entries[id][msg.sender] == bytes32(0)) j.entries += 1;
        // A first entry, or one resent after it was marked not valid, takes
        // the next slot; resending a valid entry keeps its place.
        if (g.slotOf[id][msg.sender] == 0 || g.rejected[id][msg.sender]) {
            address[] storage order = g.slots[id];
            if (order.length >= MAX_SLOTS) revert Full();
            order.push(msg.sender);
            g.slotOf[id][msg.sender] = uint32(order.length);
            g.rejected[id][msg.sender] = false;
        }
        g.entries[id][msg.sender] = deliverable;
        emit Entered(id, msg.sender, deliverable);
    }

    /// @notice The evaluator marks an entry not valid, with the hash of a
    ///         reason every entrant can read, until the payout opens. A
    ///         marked entry is never paid; resending it moves it to the back.
    function rejectEntry(JobStore storage g, uint256 id, address entrant, bytes32 reason) external {
        JobCore storage j = _bounty(g, id);
        if (msg.sender != j.evaluator) revert JobLib.BadCaller();
        if (block.timestamp >= uint256(j.awardBy) + WAIT) revert JobLib.Late();
        if (g.slotOf[id][entrant] == 0 || g.rejected[id][entrant]) revert JobLib.BadState();
        g.rejected[id][entrant] = true;
        emit EntryRejected(id, entrant, reason);
    }

    /// @notice The evaluator awards the places, first place first, from the
    ///         entries. Before the entry deadline every place must be filled;
    ///         after it, the evaluator fills as many places as it chooses,
    ///         from the first. Shares of places left empty go back to the
    ///         client.
    function award(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id, address[] calldata winners)
        external
    {
        JobCore storage j = _bounty(g, id);
        if (msg.sender != j.evaluator) revert JobLib.BadCaller();
        if (block.timestamp >= uint256(j.awardBy) + WAIT) revert JobLib.Late();
        uint16[] storage shares = g.shares[id];
        uint256 places = shares.length;
        uint256 n = winners.length;
        if (n == 0 || n > places || (block.timestamp < j.expiredAt && n != places)) revert BadWinners();
        bytes32 key = bytes32(id);
        j.status = JobStatus.Completed;
        for (uint256 i; i < n; ++i) {
            if (g.entries[id][winners[i]] == bytes32(0) || g.rejected[id][winners[i]]) revert BadWinners();
            SettlementLib.addPayee(s, hub, key, winners[i]);
            SettlementLib.markConsent(s, key, winners[i]);
        }
        uint256[] memory gross = new uint256[](n);
        uint16[] memory bps = new uint16[](n);
        for (uint256 i; i < n; ++i) {
            bps[i] = shares[i];
            gross[i] = (uint256(j.budget) * shares[i]) / BPS;
        }
        _pay(s, hub, j, id, winners, gross, bps, Outcome.COMPLETED);
    }

    /// Pays each place its share of the prize, less its half of the fee on
    /// it; the fee; and the rest back to the client. The events come first.
    /// Each winner's record carries what that winner was paid.
    function _pay(
        SettlementStore storage s,
        IKarwanHub hub,
        JobCore storage j,
        uint256 id,
        address[] memory winners,
        uint256[] memory gross,
        uint16[] memory bps,
        uint8 clientOutcome
    ) private {
        bytes32 key = bytes32(id);
        uint256 n = winners.length;
        uint16 feeBps = s.accounts[key].feeBps;
        uint256[] memory net = new uint256[](n);
        uint256 paid;
        uint256 fee;
        uint256 toWinners;
        for (uint256 i; i < n; ++i) {
            uint256 f = (gross[i] * feeBps) / BPS;
            net[i] = gross[i] - (f - f / 2);
            paid += gross[i];
            fee += f;
            toWinners += net[i];
        }
        uint256 back = s.accounts[key].balance - toWinners - fee;
        emit BountyAwarded(id, winners, paid);
        for (uint256 i; i < n; ++i) {
            emit IAgenticCommerce.PaymentReleased(id, winners[i], net[i]);
        }
        if (back != 0) emit IAgenticCommerce.Refunded(id, j.client, back);
        for (uint256 i; i < n; ++i) {
            SettlementLib.payTo(s, key, winners[i], net[i]);
        }
        SettlementLib.payFee(s, key, fee);
        SettlementLib.payTo(s, key, j.client, back);
        SettlementLib.close(s, key);
        SettlementLib.setRecordValue(s, key, clientOutcome == Outcome.COMPLETED ? paid : 0);
        SettlementLib.recordOutcome(s, hub, key, 0, clientOutcome, 0);
        for (uint256 i; i < n; ++i) {
            SettlementLib.setRecordValue(s, key, gross[i]);
            SettlementLib.recordOutcome(s, hub, key, uint8(i + 1), Outcome.COMPLETED, bps[i]);
        }
    }

    /// @notice The client takes back a bounty nobody has entered.
    function cancel(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id, bytes32 reason) external {
        JobCore storage j = _bounty(g, id);
        if (msg.sender != j.client) revert JobLib.BadCaller();
        if (j.entries != 0) revert JobLib.BadState();
        j.status = JobStatus.Rejected;
        emit IAgenticCommerce.JobRejected(id, msg.sender, reason);
        _refund(s, j, hub, id, Outcome.CANCELLED);
    }

    /// @notice A bounty not awarded by its award deadline and the wait after
    ///         it; anyone triggers it. The places go to the earliest valid
    ///         entries, and the shares of places nobody fills go to them in
    ///         proportion; the client's record shows the bounty was not
    ///         judged. With no valid entry the prize goes back to the client.
    function expire(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id) external {
        JobCore storage j = _bounty(g, id);
        if (block.timestamp < uint256(j.awardBy) + WAIT) revert JobLib.Early();
        JobLib.notHeld(s, id);
        address[] memory picked = _earliest(g, id, g.shares[id].length);
        if (picked.length == 0) {
            j.status = JobStatus.Expired;
            emit IAgenticCommerce.JobExpired(id);
            _refund(s, j, hub, id, j.entries == 0 ? Outcome.CANCELLED : Outcome.FAILED);
            return;
        }
        j.status = JobStatus.Completed;
        _admit(s, hub, bytes32(id), picked);
        (uint256[] memory gross, uint16[] memory bps) = _split(j.budget, g.shares[id], picked.length);
        _pay(s, hub, j, id, picked, gross, bps, Outcome.FAILED);
    }

    /// The entrants picked become payees before any money leaves.
    function _admit(SettlementStore storage s, IKarwanHub hub, bytes32 key, address[] memory picked) private {
        for (uint256 i; i < picked.length; ++i) {
            SettlementLib.addPayee(s, hub, key, picked[i]);
            SettlementLib.markConsent(s, key, picked[i]);
        }
    }

    /// The prize over the first `k` places, the empty places' shares spread
    /// over them in proportion.
    function _split(uint128 budget, uint16[] storage shares, uint256 k)
        private
        view
        returns (uint256[] memory gross, uint16[] memory bps)
    {
        uint256 sum;
        for (uint256 i; i < k; ++i) {
            sum += shares[i];
        }
        gross = new uint256[](k);
        bps = new uint16[](k);
        for (uint256 i; i < k; ++i) {
            bps[i] = uint16((uint256(shares[i]) * BPS) / sum);
            gross[i] = (uint256(budget) * shares[i]) / sum;
        }
    }

    /// The first `places` valid entries, in order of entry.
    function _earliest(JobStore storage g, uint256 id, uint256 places) private view returns (address[] memory out) {
        address[] storage order = g.slots[id];
        address[] memory found = new address[](places);
        uint256 k;
        uint256 len = order.length;
        for (uint256 i; i < len && k < places; ++i) {
            address a = order[i];
            if (g.slotOf[id][a] != i + 1 || g.rejected[id][a]) continue;
            found[k++] = a;
        }
        out = new address[](k);
        for (uint256 i; i < k; ++i) {
            out[i] = found[i];
        }
    }

    function _refund(SettlementStore storage s, JobCore storage j, IKarwanHub hub, uint256 id, uint8 outcome) private {
        bytes32 key = bytes32(id);
        uint256 back = s.accounts[key].balance;
        emit IAgenticCommerce.Refunded(id, j.client, back);
        SettlementLib.payTo(s, key, j.client, back);
        SettlementLib.close(s, key);
        SettlementLib.setRecordValue(s, key, 0);
        SettlementLib.recordOutcome(s, hub, key, 0, outcome, 0);
    }

    function _bounty(JobStore storage g, uint256 id) private view returns (JobCore storage j) {
        j = JobLib._job(g, id);
        if (!j.bounty || j.status != JobStatus.Funded) revert JobLib.BadState();
    }
}
