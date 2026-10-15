// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TimeFixture} from "./TimeFixture.sol";
import {KarwanTimeEscrow} from "../../../src/suite/KarwanTimeEscrow.sol";
import {TimeTerms, TimeCycle, TimeEngagement, TimeState} from "../../../src/suite/time/TimeTypes.sol";
import {TimeLib} from "../../../src/suite/time/TimeLib.sol";
import {Dispute} from "../../../src/suite/dispute/DisputeLib.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";

contract TimeHandler is Test {
    KarwanTimeEscrow internal time;
    BlocklistToken internal usdc;
    address public employer;
    address public worker;
    address public arbiter;
    address public reviewer;
    address public stranger = makeAddr("timeStranger");
    bytes32[] public ids;
    TimeTerms[] internal plans;
    bool public exitReverted;

    constructor(KarwanTimeEscrow time_, BlocklistToken usdc_, address employer_, address worker_, address arbiter_, address reviewer_) {
        time = time_;
        usdc = usdc_;
        employer = employer_;
        worker = worker_;
        arbiter = arbiter_;
        reviewer = reviewer_;
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function open(uint256 rateSeed, bool rollover, uint8 notice) external {
        if (ids.length >= 3) return;
        TimeTerms memory t;
        t.asset = address(usdc);
        t.worker = worker;
        t.rate = uint128(bound(rateSeed, 1e6, 20e6));
        t.unitScale = 60;
        t.maxUnits = 10 * 60;
        t.cycleSecs = 7 days;
        t.cycles = 6;
        t.startsAt = uint64(block.timestamp + 1 hours);
        t.acceptBy = uint64(block.timestamp + 1 hours);
        t.claimGrace = 2 days;
        t.reviewWindow = 3 days;
        t.noticeCycles = uint8(bound(notice, 0, 4));
        t.rollover = rollover;
        t.partialBps = 5_000;
        t.fallbackBps = 3_000;
        t.agreementHash = keccak256(abi.encode("plan", ids.length));
        vm.prank(employer);
        bytes32 id = time.open(keccak256(abi.encode(ids.length)), t);
        bytes32 h = time.termsHashOf(t);
        vm.prank(worker);
        time.accept(id, h);
        ids.push(id);
        plans.push(t);
    }

    function fund(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(employer);
        try time.fundCycle(ids[seed % ids.length]) {} catch {}
    }

    function submit(uint256 seed, uint16 k, uint32 units) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        k = uint16(bound(k, 0, 5));
        vm.prank(worker);
        try time.submit(id, k, uint32(bound(units, 0, 10 * 60)), bytes32(seed)) {} catch {}
    }

    function approve(uint256 seed, uint16 k, uint32 units) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        k = uint16(bound(k, 0, 5));
        TimeCycle memory c = time.getCycle(id, k);
        if (c.claimed <= c.approved) return;
        vm.prank(employer);
        try time.approve(id, k, uint32(bound(units, c.approved + 1, c.claimed))) {} catch {}
    }

    function object(uint256 seed, uint16 k, uint32 units) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        k = uint16(bound(k, 0, 5));
        TimeCycle memory c = time.getCycle(id, k);
        if (c.claimed <= c.approved) return;
        vm.prank(employer);
        try time.object(id, k, uint32(bound(units, 1, c.claimed - c.approved)), bytes32("clause")) {} catch {}
    }

    /// Anyone settles a cycle whose review is over; that must never fail.
    function settle(uint256 seed, uint16 k) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        k = uint16(bound(k, 0, 5));
        TimeEngagement memory e = time.getEngagement(id);
        TimeCycle memory c = time.getCycle(id, k);
        if (c.state != 1 || (e.state != TimeState.Active && e.state != TimeState.Ending)) return;
        if (block.timestamp < time.settleAtOf(id, k)) return;
        try time.settle(id, k) {} catch {
            exitReverted = true;
        }
    }

    /// The arbiter hands a dispute to the reviewer, who rules in time, or the
    /// fallback applies once the reviewer is late; neither may fail.
    function rule(uint256 seed, uint16 k, uint16 bps) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        k = uint16(bound(k, 0, 5));
        if (time.getCycle(id, k).state != 2) return;
        Dispute memory x = time.disputeOf(id, k);
        if (!x.escalated) {
            vm.prank(arbiter);
            time.escalate(id, k);
            x = time.disputeOf(id, k);
        }
        if (block.timestamp >= uint256(x.escalatedAt) + 5 days) {
            vm.prank(stranger);
            try time.applyFallback(id, k) {} catch {
                exitReverted = true;
            }
            return;
        }
        vm.prank(reviewer);
        try time.rule(id, k, uint16(bound(bps, 0, 10_000)), bytes32("ruling")) {} catch {
            exitReverted = true;
        }
    }

    function drop(uint256 seed, uint16 k) external {
        if (ids.length == 0) return;
        vm.prank(employer);
        try time.dropObjection(ids[seed % ids.length], uint16(bound(k, 0, 5))) {} catch {}
    }

    function notice(uint256 seed, bool byWorker) external {
        if (ids.length == 0) return;
        vm.prank(byWorker ? worker : employer);
        try time.giveNotice(ids[seed % ids.length]) {} catch {}
    }

    function endNow(uint256 seed) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        vm.prank(employer);
        try time.endNow(id) {} catch {}
        vm.prank(worker);
        try time.endNow(id) {} catch {}
    }

    function close(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(stranger);
        try time.close(ids[seed % ids.length]) {} catch {}
    }

    function amend(uint256 seed, uint256 rateSeed, uint16 fromSeed) external {
        if (ids.length == 0) return;
        uint256 i = seed % ids.length;
        TimeTerms memory t = plans[i];
        t.rate = uint128(bound(rateSeed, 1e6, 20e6));
        t.acceptBy = uint64(block.timestamp + 1 days);
        uint16 from = uint16(bound(fromSeed, 0, 5));
        vm.prank(employer);
        try time.proposeAmendment(ids[i], t, from) {}
        catch {
            return;
        }
        vm.prank(worker);
        try time.acceptAmendment(ids[i], t, from) {} catch {}
    }

    function blockWorker(bool on) external {
        usdc.setBlocked(worker, on);
    }

    function withdrawOwed() external {
        if (usdc.blocked(worker) || time.owed(address(usdc), worker) == 0) return;
        vm.prank(worker);
        time.withdrawOwed(address(usdc));
    }

    function wait(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 hours, 4 days));
    }
}

contract TimeInvariantTest is TimeFixture {
    TimeHandler internal handler;

    function setUp() public {
        _deployTime();
        hub.setCaps(address(time), address(usdc), 1_000_000e6, 10_000_000e6);
        handler = new TimeHandler(time, usdc, employer, worker, arbiter, reviewSafe);
        vm.prank(employer);
        usdc.approve(address(time), type(uint256).max);
        usdc.mint(employer, 10_000_000e6);
        targetContract(address(handler));
    }

    function invariant_books_balance() public view {
        assertEq(
            usdc.balanceOf(address(time)) + time.parked(address(usdc)),
            time.held(address(usdc)) + time.owedTotal(address(usdc))
        );
    }

    /// Each engagement holds exactly what its open cycles have not paid out,
    /// with the employer's fee share on what they did pay, plus its carry.
    function invariant_an_engagement_holds_exactly_its_open_cycles_and_carry() public view {
        for (uint256 i; i < handler.idCount(); ++i) {
            bytes32 id = handler.ids(i);
            TimeEngagement memory e = time.getEngagement(id);
            if (e.state == TimeState.Closed) {
                assertEq(time.accountOf(id).balance, 0);
                continue;
            }
            uint256 sum = e.carry;
            for (uint16 k; k < e.nextCycle; ++k) {
                TimeCycle memory c = time.getCycle(id, k);
                if (c.state == 3) continue;
                uint256 paid = c.paidGross;
                sum += c.funded - paid - ((paid * FEE_BPS) / 10_000) / 2;
            }
            assertEq(time.accountOf(id).balance, sum);
        }
    }

    function invariant_a_cycle_never_pays_more_than_its_budget_or_its_hours() public view {
        for (uint256 i; i < handler.idCount(); ++i) {
            bytes32 id = handler.ids(i);
            TimeEngagement memory e = time.getEngagement(id);
            for (uint16 k; k < e.nextCycle; ++k) {
                TimeCycle memory c = time.getCycle(id, k);
                TimeTerms memory t = time.getTerms(id, c.version);
                assertLe(c.approved, c.claimed);
                assertLe(c.claimed, t.maxUnits);
                assertLe(c.paidGross, TimeLib.grossOf(t, c.claimed));
            }
        }
    }

    function invariant_exits_never_revert() public view {
        assertFalse(handler.exitReverted());
    }

    function invariant_nobody_outside_the_engagement_is_paid() public view {
        assertEq(usdc.balanceOf(handler.stranger()), 0);
    }
}
