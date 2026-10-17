// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TimeFixture} from "./TimeFixture.sol";
import {TimeTerms} from "../../../src/suite/time/TimeTypes.sol";
import {KarwanSettlementBase} from "../../../src/suite/KarwanSettlementBase.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";
import {ReenteringToken} from "../mocks/ReenteringToken.sol";

/// @notice Every guarded Time step that moves money is closed to re-entry: a
///         token that calls back into the escrow mid-payment is refused.
contract TimeReentrancyTest is TimeFixture {
    bytes32 internal constant SALT = bytes32("e");

    function setUp() public {
        _deployTime();
    }

    function _newToken() internal override returns (BlocklistToken) {
        return new ReenteringToken();
    }

    function _arm() internal {
        ReenteringToken(address(usdc)).arm(
            address(time), abi.encodeCall(KarwanSettlementBase.withdrawOwed, (address(usdc)))
        );
    }

    function _assertRefused() internal view {
        ReenteringToken t = ReenteringToken(address(usdc));
        assertTrue(t.attempted());
        assertFalse(t.succeeded());
        assertEq(t.reason(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
    }

    /// The first week's 16 hours, objected to 4 hours short.
    function _objected(TimeTerms memory t) internal returns (bytes32 id) {
        id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
    }

    function test_opening_is_closed_to_reentry() public {
        _arm();
        _offer(_terms(), SALT);
        _assertRefused();
    }

    function test_taking_an_offer_back_is_closed_to_reentry() public {
        bytes32 id = _offer(_terms(), SALT);
        _arm();
        vm.prank(employer);
        time.cancelOffer(id);
        _assertRefused();
    }

    function test_funding_a_week_is_closed_to_reentry() public {
        bytes32 id = _active(_terms(), SALT);
        _arm();
        _fund(id);
        _assertRefused();
    }

    function test_approving_hours_is_closed_to_reentry() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        _arm();
        vm.prank(employer);
        time.approve(id, 0, 10 * 60);
        _assertRefused();
    }

    function test_settling_a_week_is_closed_to_reentry() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 3 days);
        _submit(id, 0, 16 * 60);
        vm.warp(time.settleAtOf(id, 0));
        _arm();
        vm.prank(stranger);
        time.settle(id, 0);
        _assertRefused();
    }

    function test_objecting_is_closed_to_reentry() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        _arm();
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        _assertRefused();
    }

    function test_giving_notice_is_closed_to_reentry() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        _fund(id);
        _fund(id);
        vm.warp(_start(t, 0) + 2 days);
        _arm();
        vm.prank(worker);
        time.giveNotice(id);
        _assertRefused();
    }

    function test_ending_at_once_is_closed_to_reentry() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 2 days);
        vm.prank(employer);
        time.endNow(id);
        _arm();
        vm.prank(worker);
        time.endNow(id);
        _assertRefused();
    }

    /// A week settled with unused budget carried forward, then notice: closing
    /// pays the carry back.
    function test_closing_is_closed_to_reentry() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertGt(_engagement(id).carry, 0);
        vm.prank(employer);
        time.giveNotice(id);
        vm.warp(_end(t, _engagement(id).runs - 1));
        _arm();
        vm.prank(stranger);
        time.close(id);
        _assertRefused();
    }

    function test_executing_a_ruling_is_closed_to_reentry() public {
        bytes32 id = _objected(_terms());
        vm.prank(arbiter);
        time.proposeRuling(id, 0, 0, bytes32("no"));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        _arm();
        vm.prank(stranger);
        time.executeRuling(id, 0);
        _assertRefused();
    }

    function test_the_reviewers_ruling_is_closed_to_reentry() public {
        bytes32 id = _objected(_terms());
        vm.prank(arbiter);
        time.escalate(id, 0);
        _arm();
        vm.prank(reviewSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
        _assertRefused();
    }

    function test_the_fallback_is_closed_to_reentry() public {
        bytes32 id = _objected(_terms());
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        _arm();
        vm.prank(stranger);
        time.applyFallback(id, 0);
        _assertRefused();
    }
}
