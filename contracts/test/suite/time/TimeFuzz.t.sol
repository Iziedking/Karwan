// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimeFixture} from "./TimeFixture.sol";
import {TimeTerms} from "../../../src/suite/time/TimeTypes.sol";
import {TimeLib} from "../../../src/suite/time/TimeLib.sol";
import {DealAccount} from "../../../src/suite/settlement/SettlementLib.sol";

/// @notice The Time family's money arithmetic under fuzzed rates, scales, caps,
///         units, fees and choices: every cycle pays the worker, the fee and the
///         employer back exactly what it held, and nothing more.
contract TimeFuzzTest is TimeFixture {
    bytes32 internal constant SALT = bytes32("fuzz");
    uint256 internal constant BPS = 10_000;

    /// What the test expects the engagement to have moved, in total.
    struct Books {
        uint256 spent;
        uint256 toWorker;
        uint256 fees;
        uint256 gross;
        uint256 carry;
    }

    function setUp() public {
        _deployTime();
        hub.setCaps(address(time), address(usdc), 1e15, 1e16);
        usdc.mint(employer, 1e15);
    }

    // ------------------------------ Helpers -------------------------------

    function _setFee(uint256 seed) internal returns (uint16 f) {
        f = uint16(bound(seed, 0, 1_000));
        hub.setFamilyFee(address(time), f);
    }

    /// Terms the escrow accepts: a rate up to 1,000 USDC a unit, any scale,
    /// and a cap no lower than the one step that makes the budget non-zero.
    function _fuzzTerms(uint256 rate, uint256 scale, uint256 maxUnits) internal view returns (TimeTerms memory t) {
        t = _terms();
        t.unitScale = uint32(bound(scale, 1, 10_000));
        t.rate = uint128(bound(rate, 1, 1_000e6));
        uint256 lo = (uint256(t.unitScale) + t.rate - 1) / t.rate;
        t.maxUnits = uint32(bound(maxUnits, lo, 10_000));
    }

    function _grossOf(TimeTerms memory t, uint256 units) internal pure returns (uint256) {
        return (uint256(t.rate) * units) / t.unitScale;
    }

    function _budgetOf(TimeTerms memory t) internal pure returns (uint256) {
        return _grossOf(t, t.maxUnits);
    }

    function _totalOf(uint256 budget, uint16 f) internal pure returns (uint256) {
        return budget + ((budget * f) / BPS) / 2;
    }

    function _netOf(uint256 gross, uint16 f) internal pure returns (uint256) {
        uint256 fee = (gross * f) / BPS;
        return gross - (fee - fee / 2);
    }

    /// Units for cycle `k`: none, the cap, or anything between.
    function _unitsFor(uint256 seed, uint256 k, uint32 max) internal pure returns (uint32) {
        uint256 r = uint256(keccak256(abi.encode(seed, k)));
        if (r % 4 == 0) return 0;
        if (r % 4 == 1) return max;
        return uint32((r >> 8) % (uint256(max) + 1));
    }

    function _reviewer(TimeTerms memory t) internal view returns (address) {
        uint256 hv = hub.highValueOf(address(usdc));
        return hv != 0 && _budgetOf(t) * t.cycles >= hv ? seniorSafe : reviewSafe;
    }

    function _oneCycle(uint256 gross, uint16 f) internal pure returns (Books memory b) {
        uint256 fee = (gross * f) / BPS;
        b.gross = gross;
        b.fees = fee;
        b.toWorker = gross - (fee - fee / 2);
        b.spent = gross + fee / 2;
    }

    /// Settles cycle `k` at `units` under terms `v` and books it: the worker's
    /// net and the fee on what it paid, and its unused budget carried or back.
    function _settleAndBook(bytes32 id, TimeTerms memory v, uint16 k, uint32 units, uint16 f, Books memory b, bool carries)
        internal
    {
        uint256 before = usdc.balanceOf(employer);
        time.settle(id, k);
        uint256 gross = _grossOf(v, units);
        uint256 fee = (gross * f) / BPS;
        uint256 unused = uint256(_cycle(id, k).funded) - gross - fee / 2;
        b.gross += gross;
        b.fees += fee;
        b.toWorker += gross - (fee - fee / 2);
        assertEq(_cycle(id, k).paidGross, gross);
        if (carries) {
            b.carry += unused;
            assertEq(usdc.balanceOf(employer), before);
        } else {
            b.spent -= unused;
            assertEq(usdc.balanceOf(employer) - before, unused);
        }
        assertEq(_engagement(id).carry, b.carry);
    }

    function _fundFromCarry(bytes32 id, uint256 total, Books memory b) internal {
        uint256 fromCarry = b.carry < total ? b.carry : total;
        uint256 before = usdc.balanceOf(employer);
        _fund(id);
        b.carry -= fromCarry;
        b.spent += total - fromCarry;
        assertEq(before - usdc.balanceOf(employer), total - fromCarry);
        assertEq(_engagement(id).carry, b.carry);
    }

    function _outsidersUnpaid() internal view {
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(arbiter), 0);
        assertEq(usdc.balanceOf(reviewSafe), 0);
        assertEq(usdc.balanceOf(seniorSafe), 0);
        assertEq(time.owedTotal(address(usdc)), 0);
    }

    /// The engagement is closed and every unit it took is accounted for.
    function _assertBooks(bytes32 id, uint256 employerBefore, Books memory b, uint16 f) internal view {
        assertEq(usdc.balanceOf(worker), b.toWorker);
        assertEq(usdc.balanceOf(feeSafe), b.fees);
        assertEq(employerBefore - usdc.balanceOf(employer), b.spent);
        assertEq(b.spent, b.toWorker + b.fees);
        assertEq(usdc.balanceOf(address(time)), 0);
        DealAccount memory a = time.accountOf(id);
        assertTrue(a.closed);
        assertEq(a.balance, 0);
        assertEq(a.feePaid, b.fees);
        assertLe(a.feePaid, (uint256(a.funded) * f) / BPS);
        assertEq(_engagement(id).paidGross, b.gross);
        assertEq(_engagement(id).carry, 0);
        _outsidersUnpaid();
    }

    // ------------------------------- Pricing ------------------------------

    function testFuzz_gross_rounds_down_never_passes_the_budget_and_a_split_never_pays_more(
        uint128 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 a,
        uint256 b
    ) public view {
        TimeTerms memory t = _terms();
        t.rate = rate;
        t.unitScale = uint32(bound(scale, 1, 10_000));
        t.maxUnits = uint32(bound(maxUnits, 1, type(uint32).max));
        uint256 ua = bound(a, 0, t.maxUnits);
        uint256 ub = bound(b, 0, t.maxUnits - ua);
        uint256 ga = TimeLib.grossOf(t, ua);
        uint256 gb = TimeLib.grossOf(t, ub);
        uint256 gab = TimeLib.grossOf(t, ua + ub);
        assertEq(ga, (uint256(rate) * ua) / t.unitScale);
        assertLe(ga * t.unitScale, uint256(rate) * ua);
        assertGt((ga + 1) * t.unitScale, uint256(rate) * ua);
        assertLe(ga + gb, gab);
        assertLe(gab - ga - gb, 1);
        assertEq(TimeLib.budgetOf(t), (uint256(rate) * t.maxUnits) / t.unitScale);
        assertLe(gab, TimeLib.budgetOf(t));
    }

    // ------------------------------ One cycle -----------------------------

    function testFuzz_approvals_in_parts_and_silence_pay_exactly_the_units_claimed(
        uint256 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 fee,
        uint256 claimed,
        uint256 first,
        uint256 second
    ) public {
        uint16 f = _setFee(fee);
        TimeTerms memory t = _fuzzTerms(rate, scale, maxUnits);
        t.cycles = 1;
        uint32 units = uint32(bound(claimed, 0, t.maxUnits));
        uint256 employerBefore = usdc.balanceOf(employer);
        bytes32 id = _active(t, SALT);
        uint256 funded = _totalOf(_budgetOf(t), f);
        assertEq(_cycle(id, 0).funded, funded);
        assertEq(employerBefore - usdc.balanceOf(employer), funded);
        assertEq(usdc.balanceOf(address(time)), funded);
        assertEq(time.feeLeft(id), (funded * f) / BPS);
        vm.warp(_start(t, 0));
        if (units != 0) {
            _submit(id, 0, units);
            uint32 a1 = uint32(bound(first, 0, units));
            uint32 a2 = uint32(bound(second, a1, units));
            if (a1 != 0) {
                vm.prank(employer);
                time.approve(id, 0, a1);
                assertEq(usdc.balanceOf(worker), _netOf(_grossOf(t, a1), f));
            }
            if (a2 > a1) {
                vm.prank(employer);
                time.approve(id, 0, a2);
                assertEq(usdc.balanceOf(worker), _netOf(_grossOf(t, a2), f));
            }
        }
        vm.warp(time.settleAtOf(id, 0));
        vm.prank(stranger);
        time.settle(id, 0);
        time.close(id);
        _assertBooks(id, employerBefore, _oneCycle(_grossOf(t, units), f), f);
    }

    function testFuzz_an_objection_pays_the_rest_at_once_and_silence_never_pays_the_objected_units(
        uint256 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 fee,
        uint256 claimed,
        uint256 approved,
        uint256 objected,
        uint256 timing
    ) public {
        uint16 f = _setFee(fee);
        TimeTerms memory t = _fuzzTerms(rate, scale, maxUnits);
        t.cycles = 1;
        t.claimGrace = uint32(bound(timing, 0, 7 days));
        t.reviewWindow = uint32(bound(timing >> 32, 1 hours, 14 days));
        uint32 units = uint32(bound(claimed, 1, t.maxUnits));
        uint32 a = uint32(bound(approved, 0, units - 1));
        uint32 o = uint32(bound(objected, 1, units - a));
        uint256 employerBefore = usdc.balanceOf(employer);
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0));
        _submit(id, 0, units);
        if (a != 0) {
            vm.prank(employer);
            time.approve(id, 0, a);
        }
        uint256 claimsEnd = _end(t, 0) + t.claimGrace;
        vm.warp(claimsEnd + bound(timing >> 64, 0, t.reviewWindow - 1));
        vm.prank(employer);
        time.object(id, 0, o, bytes32("units"));
        uint256 paid = _grossOf(t, units - o);
        assertEq(usdc.balanceOf(worker), _netOf(paid, f));
        assertEq(_cycle(id, 0).approved, units - o);
        assertEq(_cycle(id, 0).disputed, o);
        assertEq(
            time.accountOf(id).balance, _totalOf(_budgetOf(t), f) - paid - ((paid * f) / BPS) / 2
        );
        vm.warp(claimsEnd + t.reviewWindow);
        vm.expectRevert(TimeLib.BadState.selector);
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _netOf(paid, f));
        vm.prank(employer);
        time.dropObjection(id, 0);
        time.settle(id, 0);
        time.close(id);
        _assertBooks(id, employerBefore, _oneCycle(_grossOf(t, units), f), f);
    }

    /// Ends the dispute on cycle 0 by one of the three routes and returns the
    /// worker's share it applied.
    function _resolve(bytes32 id, TimeTerms memory t, uint256 path, uint16 share, uint256 at)
        internal
        returns (uint16 w)
    {
        uint256 route = path % 3;
        if (route == 0) {
            uint256 pick = (path / 3) % 3;
            w = pick == 0 ? uint16(0) : (pick == 1 ? uint16(BPS) : t.partialBps);
            vm.prank(arbiter);
            time.proposeRuling(id, 0, w, bytes32("proposal"));
            vm.warp(at + 72 hours);
            vm.prank(stranger);
            time.executeRuling(id, 0);
        } else if (route == 1) {
            w = share;
            vm.prank(arbiter);
            time.escalate(id, 0);
            vm.prank(_reviewer(t));
            time.rule(id, 0, w, bytes32("ruling"));
        } else {
            w = t.fallbackBps;
            vm.prank(arbiter);
            time.escalate(id, 0);
            vm.warp(at + 5 days);
            vm.prank(stranger);
            time.applyFallback(id, 0);
        }
    }

    function testFuzz_a_ruling_splits_the_objected_units_and_the_cycle_pays_out_exactly_its_balance(
        uint256 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 fee,
        uint256 claimed,
        uint256 objected,
        uint256 shareSeed,
        uint256 path
    ) public {
        uint16 f = _setFee(fee);
        TimeTerms memory t = _fuzzTerms(rate, scale, maxUnits);
        t.cycles = 1;
        uint16 share = uint16(bound(shareSeed, 0, BPS));
        t.partialBps = share == BPS ? uint16(0) : share;
        t.fallbackBps = share;
        uint32 units = uint32(bound(claimed, 1, t.maxUnits));
        uint32 o = uint32(bound(objected, 1, units));
        uint256 employerBefore = usdc.balanceOf(employer);
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0));
        _submit(id, 0, units);
        uint256 claimsEnd = _end(t, 0) + t.claimGrace;
        vm.warp(claimsEnd);
        vm.prank(employer);
        time.object(id, 0, o, bytes32("units"));
        uint16 w = _resolve(id, t, path, share, claimsEnd);
        uint256 base = _grossOf(t, units - o);
        uint256 whole = _grossOf(t, units);
        uint256 gross = base + ((whole - base) * w) / BPS;
        assertLe(gross, whole);
        assertGe(gross, base);
        assertEq(_cycle(id, 0).paidGross, gross);
        assertEq(_cycle(id, 0).disputed, 0);
        assertEq(time.accountOf(id).balance, 0);
        assertTrue(_engagement(id).ruled);
        time.close(id);
        _assertBooks(id, employerBefore, _oneCycle(gross, f), f);
    }

    // ----------------------------- Many cycles ----------------------------

    function testFuzz_unused_budget_carries_forward_and_what_is_left_goes_back_at_close(
        uint256 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 fee,
        uint256 cycles,
        uint256 funded,
        uint256 seed
    ) public {
        uint16 f = _setFee(fee);
        TimeTerms memory t = _fuzzTerms(rate, scale, maxUnits);
        t.rollover = true;
        t.claimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.cycles = uint16(bound(cycles, 1, 6));
        uint16 last = uint16(bound(funded, 1, t.cycles));
        uint256 total = _totalOf(_budgetOf(t), f);
        uint256 employerBefore = usdc.balanceOf(employer);
        bytes32 id = _active(t, SALT);
        Books memory b;
        b.spent = total;
        vm.warp(_start(t, 0));
        for (uint16 k; k < last; ++k) {
            if (k != 0) _fundFromCarry(id, total, b);
            uint32 u = _unitsFor(seed, k, t.maxUnits);
            if (u != 0) _submit(id, k, u);
            vm.warp(time.settleAtOf(id, k));
            _settleAndBook(id, t, k, u, f, b, k + 1 < t.cycles);
            assertEq(time.accountOf(id).balance, b.carry);
        }
        if (last < t.cycles) vm.warp(_end(t, last));
        uint256 before = usdc.balanceOf(employer);
        time.close(id);
        assertEq(usdc.balanceOf(employer) - before, b.carry);
        b.spent -= b.carry;
        b.carry = 0;
        _assertBooks(id, employerBefore, b, f);
    }

    function testFuzz_a_carry_funds_the_next_cycle_up_to_its_budget_and_the_rest_goes_back_at_close(
        uint256 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 newRate,
        uint256 newScale,
        uint256 newMax,
        uint256 fee,
        uint256 seed
    ) public {
        uint16 f = _setFee(fee);
        TimeTerms memory t = _fuzzTerms(rate, scale, maxUnits);
        t.rollover = true;
        t.claimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.cycles = 2;
        TimeTerms memory n = _fuzzTerms(newRate, newScale, newMax);
        n.rollover = true;
        n.claimGrace = 1 days;
        n.reviewWindow = 2 days;
        n.cycles = 2;
        uint256 employerBefore = usdc.balanceOf(employer);
        bytes32 id = _active(t, SALT);
        vm.prank(employer);
        time.proposeAmendment(id, n, 1);
        vm.prank(worker);
        time.acceptAmendment(id, n, 1);
        Books memory b;
        b.spent = _totalOf(_budgetOf(t), f);
        vm.warp(_start(t, 0));
        uint32 u0 = _unitsFor(seed, 0, t.maxUnits);
        if (u0 != 0) _submit(id, 0, u0);
        vm.warp(time.settleAtOf(id, 0));
        _settleAndBook(id, t, 0, u0, f, b, true);
        uint256 total1 = _totalOf(_budgetOf(n), f);
        _fundFromCarry(id, total1, b);
        assertEq(_cycle(id, 1).version, 1);
        assertEq(_cycle(id, 1).funded, total1);
        assertEq(time.accountOf(id).balance, total1 + b.carry);
        uint32 u1 = _unitsFor(seed, 1, n.maxUnits);
        if (u1 != 0) _submit(id, 1, u1);
        vm.warp(time.settleAtOf(id, 1));
        _settleAndBook(id, n, 1, u1, f, b, false);
        assertEq(time.accountOf(id).balance, b.carry);
        uint256 before = usdc.balanceOf(employer);
        time.close(id);
        assertEq(usdc.balanceOf(employer) - before, b.carry);
        b.spent -= b.carry;
        b.carry = 0;
        _assertBooks(id, employerBefore, b, f);
    }

    /// Funds cycles 1 to 3 after the amendment and checks each holds the
    /// budget of the terms version it falls under.
    function _fundAhead(bytes32 id, TimeTerms memory t, TimeTerms memory n, uint16 fromCycle, uint16 f)
        internal
        returns (uint256[4] memory funded)
    {
        for (uint16 k = 1; k < 4; ++k) _fund(id);
        for (uint16 k; k < 4; ++k) {
            funded[k] = _totalOf(_budgetOf(k >= fromCycle ? n : t), f);
            assertEq(_cycle(id, k).version, k >= fromCycle ? uint16(1) : uint16(0));
            assertEq(_cycle(id, k).funded, funded[k]);
        }
    }

    /// Claims and settles every cycle that still runs after the notice, each
    /// priced by its own terms version.
    function _workThrough(
        bytes32 id,
        TimeTerms memory t,
        TimeTerms memory n,
        uint16 fromCycle,
        uint16 runs,
        uint256 seed,
        uint16 f,
        Books memory b
    ) internal {
        uint32[4] memory units;
        for (uint16 k; k < runs; ++k) {
            units[k] = _unitsFor(seed, k, (k >= fromCycle ? n : t).maxUnits);
            vm.warp(_start(t, k));
            if (units[k] != 0) _submit(id, k, units[k]);
        }
        vm.warp(_end(t, runs - 1) + t.claimGrace + t.reviewWindow);
        for (uint16 k; k < runs; ++k) {
            _settleAndBook(id, k >= fromCycle ? n : t, k, units[k], f, b, false);
        }
    }

    function testFuzz_notice_and_amendments_never_change_what_earlier_cycles_pay(
        uint256 rate,
        uint256 scale,
        uint256 maxUnits,
        uint256 newRate,
        uint256 newScale,
        uint256 newMax,
        uint256 from,
        uint256 seed
    ) public {
        uint16 f = _setFee(uint256(keccak256(abi.encode(seed, "fee"))));
        TimeTerms memory t = _fuzzTerms(rate, scale, maxUnits);
        t.noticeCycles = uint8(seed % 5);
        TimeTerms memory n = _fuzzTerms(newRate, newScale, newMax);
        uint16 fromCycle = uint16(bound(from, 1, 4));
        uint256 employerBefore = usdc.balanceOf(employer);
        bytes32 id = _active(t, SALT);
        vm.prank(employer);
        time.proposeAmendment(id, n, fromCycle);
        vm.prank(worker);
        time.acceptAmendment(id, n, fromCycle);
        uint256[4] memory funded = _fundAhead(id, t, n, fromCycle, f);
        uint16 runs = t.noticeCycles >= 3 ? uint16(4) : uint16(1 + t.noticeCycles);
        Books memory b;
        for (uint16 k; k < runs; ++k) b.spent += funded[k];
        vm.warp(_start(t, 0));
        uint256 before = usdc.balanceOf(employer);
        vm.prank(((seed >> 8) & 1) == 0 ? worker : employer);
        time.giveNotice(id);
        assertEq(_engagement(id).runs, runs);
        assertEq(_engagement(id).nextCycle, runs);
        uint256 refund;
        for (uint16 k = runs; k < 4; ++k) refund += funded[k];
        assertEq(usdc.balanceOf(employer) - before, refund);
        _workThrough(id, t, n, fromCycle, runs, seed, f, b);
        time.close(id);
        _assertBooks(id, employerBefore, b, f);
    }
}
