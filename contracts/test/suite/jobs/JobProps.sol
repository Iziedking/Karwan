// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {JobCore, JobStatus, BountyTerms} from "../../../src/suite/jobs/JobTypes.sol";
import {Dispute} from "../../../src/suite/dispute/DisputeLib.sol";

/// @notice The Jobs family's property set, one contract for three fuzzers:
///         it deploys the suite, its public functions are the actions, and
///         each `property_` function must stay true. Foundry runs it from
///         `JobInvariant.t.sol`; Medusa and Echidna target it directly.
contract JobProps is JobFixture {
    address[3] internal entrants;
    uint256[] public ids;
    bool public exitReverted;
    bool internal paused;

    constructor() {
        _deployJobs();
        hub.setCaps(address(jobs), address(usdc), 1_000_000e6, 10_000_000e6);
        entrants = [makeAddr("e1"), makeAddr("e2"), makeAddr("e3")];
    }

    // ------------------------------ Properties ----------------------------

    function property_books_balance() public view returns (bool) {
        return usdc.balanceOf(address(jobs)) + jobs.parked(address(usdc))
            == jobs.held(address(usdc)) + jobs.owedTotal(address(usdc));
    }

    /// A live job or bounty holds exactly its budget and the client's half of
    /// the fee on it; a finished one holds nothing.
    function property_every_job_holds_exactly_its_money() public view returns (bool) {
        for (uint256 i; i < ids.length; ++i) {
            JobCore memory j = jobs.jobOf(ids[i]);
            uint256 balance = jobs.accountOf(bytes32(ids[i])).balance;
            bool live = j.status == JobStatus.Funded || j.status == JobStatus.Submitted;
            uint256 want = live ? uint256(j.budget) + ((uint256(j.budget) * FEE_BPS) / 10_000) / 2 : 0;
            if (balance != want) return false;
        }
        return true;
    }

    function property_the_evaluator_and_outsiders_are_never_paid() public view returns (bool) {
        return usdc.balanceOf(stranger) == 0 && usdc.balanceOf(evaluator) == 0 && usdc.balanceOf(arbiter) == 0
            && usdc.balanceOf(reviewSafe) == 0 && usdc.balanceOf(guardian) == 0;
    }

    function property_exits_never_revert() public view returns (bool) {
        return !exitReverted;
    }

    // ------------------------------- Actions ------------------------------

    function openJob(uint256 budgetSeed) external {
        if (ids.length >= 6 || paused) return;
        uint256 budget = bound(budgetSeed, 1, 500e6);
        vm.prank(client);
        uint256 id = jobs.createJob(provider, evaluator, block.timestamp + 10 days, "job", address(0));
        vm.prank(provider);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        jobs.fund(id, budget, "");
        ids.push(id);
    }

    function openBounty(uint256 prizeSeed, uint8 placesSeed) external {
        if (ids.length >= 6 || paused) return;
        BountyTerms memory t;
        t.evaluator = evaluator;
        t.prize = uint128(bound(prizeSeed, 1, 500e6));
        t.entriesBy = uint64(block.timestamp + 3 days);
        t.awardBy = uint64(block.timestamp + 6 days);
        uint256 places = bound(placesSeed, 1, 3);
        t.shares = new uint16[](places);
        uint16 each = uint16(10_000 / places);
        for (uint256 i; i < places; ++i) t.shares[i] = each;
        t.shares[0] += uint16(10_000 - each * places);
        vm.prank(client);
        ids.push(jobs.openBounty(t));
    }

    function submit(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(provider);
        try jobs.submit(ids[seed % ids.length], bytes32(seed | 1), "") {} catch {}
    }

    function enter(uint256 seed, uint8 who) external {
        if (ids.length == 0) return;
        vm.prank(entrants[who % 3]);
        try jobs.enter(ids[seed % ids.length], bytes32(seed | 1)) {} catch {}
    }

    function complete(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(evaluator);
        try jobs.complete(ids[seed % ids.length], bytes32("ok"), "") {} catch {}
    }

    function reject(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(evaluator);
        try jobs.reject(ids[seed % ids.length], bytes32("no"), "") {} catch {}
    }

    function dispute(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(provider);
        try jobs.disputeRejection(ids[seed % ids.length], bytes32("clause")) {} catch {}
    }

    function award(uint256 seed, uint8 first, uint8 count) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        JobCore memory j = jobs.jobOf(id);
        if (!j.bounty || j.status != JobStatus.Funded) return;
        uint256 n = bound(count, 1, jobs.sharesOf(id).length);
        address[] memory w = new address[](n);
        for (uint256 i; i < n; ++i) w[i] = entrants[(first + i) % 3];
        vm.prank(evaluator);
        try jobs.award(id, w) {} catch {}
    }

    function propose(uint256 seed, uint8 pick) external {
        if (ids.length == 0) return;
        uint16[3] memory bps = [uint16(0), 5_000, 10_000];
        vm.prank(arbiter);
        try jobs.proposeRuling(ids[seed % ids.length], bps[pick % 3], bytes32("proposal")) {} catch {}
    }

    function escalate(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(arbiter);
        try jobs.escalate(ids[seed % ids.length]) {} catch {}
    }

    function rule(uint256 seed, uint16 bps) external {
        if (ids.length == 0) return;
        vm.prank(reviewSafe);
        try jobs.rule(ids[seed % ids.length], uint16(bound(bps, 0, 10_000)), bytes32("ruling")) {} catch {}
    }

    function hold(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(guardian);
        try jobs.hold(bytes32(ids[seed % ids.length]), bytes32("check")) {} catch {}
    }

    function pause(bool on) external {
        if (on) {
            vm.prank(guardian);
            hub.pauseFamily(address(jobs));
        } else {
            hub.resumeFamily(address(jobs));
        }
        paused = on;
    }

    /// Every timeout that is due must run, held or paused alike, once its
    /// hold has passed.
    function timeouts(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        JobCore memory j = jobs.jobOf(id);
        if (jobs.accountOf(bytes32(id)).holdUntil > block.timestamp) return;
        bool ok = true;
        if (j.status == JobStatus.Funded && block.timestamp >= (j.bounty ? j.awardBy : j.expiredAt)) {
            vm.prank(stranger);
            try jobs.claimRefund(id) {} catch {
                ok = false;
            }
        } else if (j.status == JobStatus.Submitted && j.rejectedAt == 0 && block.timestamp >= j.submittedAt + j.reviewWindow) {
            vm.prank(stranger);
            try jobs.release(id) {} catch {
                ok = false;
            }
        } else if (j.status == JobStatus.Submitted && j.rejectedAt != 0 && !j.disputed && block.timestamp >= j.rejectedAt + 3 days) {
            vm.prank(stranger);
            try jobs.confirmRejection(id) {} catch {
                ok = false;
            }
        } else if (j.disputed) {
            Dispute memory x = jobs.disputeOf(id);
            if (x.escalated && block.timestamp >= x.escalatedAt + 5 days) {
                vm.prank(stranger);
                try jobs.applyFallback(id) {} catch {
                    ok = false;
                }
            } else if (!x.escalated && x.proposed && block.timestamp >= x.proposedAt + 72 hours) {
                vm.prank(stranger);
                try jobs.executeRuling(id) {} catch {
                    ok = false;
                }
            } else if (!x.escalated && !x.proposed && block.timestamp >= x.openedAt + 5 days) {
                vm.prank(stranger);
                try jobs.escalate(id) {} catch {
                    ok = false;
                }
            }
        }
        if (!ok) exitReverted = true;
    }

    function blockProvider(bool on) external {
        usdc.setBlocked(provider, on);
    }

    function withdrawOwed() external {
        if (usdc.blocked(provider) || jobs.owed(address(usdc), provider) == 0) return;
        vm.prank(provider);
        jobs.withdrawOwed(address(usdc));
    }

    function wait(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 hours, 3 days));
    }
}
