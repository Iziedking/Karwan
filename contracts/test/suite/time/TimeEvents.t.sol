// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimeFixture} from "./TimeFixture.sol";
import {TimeTerms} from "../../../src/suite/time/TimeTypes.sol";
import {TimeLib} from "../../../src/suite/time/TimeLib.sol";

/// @notice Every step of a Time engagement is announced with every field.
///         Callers are relayed, so msg.sender is not tx.origin.
contract TimeEventsTest is TimeFixture {
    address internal relayer = makeAddr("relayer");
    bytes32 internal constant SALT = bytes32("e");

    function setUp() public {
        _deployTime();
    }

    function test_an_offer_its_first_week_acceptance_and_withdrawal_are_announced() public {
        TimeTerms memory t = _terms();
        bytes32 id = time.dealIdFor(employer, SALT);
        vm.expectEmit(address(time));
        emit TimeLib.EngagementOffered(id, employer, worker, time.termsHashOf(t));
        vm.expectEmit(address(time));
        emit TimeLib.CycleFunded(id, 0, WEEK_FUNDED, 0);
        vm.prank(employer, relayer);
        time.open(SALT, t);
        vm.expectEmit(address(time));
        emit TimeLib.EngagementCancelled(id, WEEK_FUNDED);
        vm.prank(employer, relayer);
        time.cancelOffer(id);

        bytes32 other = _offer(t, bytes32("f"));
        bytes32 h = time.termsHashOf(t);
        vm.expectEmit(address(time));
        emit TimeLib.EngagementAccepted(other);
        vm.prank(worker, relayer);
        time.accept(other, h);
    }

    function test_hours_submitted_approved_objected_and_dropped_are_announced() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        bytes32 evidence = keccak256("log");
        vm.expectEmit(address(time));
        emit TimeLib.UnitsSubmitted(id, 0, 16 * 60, evidence);
        vm.prank(worker, relayer);
        time.submit(id, 0, 16 * 60, evidence);
        vm.expectEmit(address(time));
        emit TimeLib.UnitsApproved(id, 0, 10 * 60);
        vm.prank(employer, relayer);
        time.approve(id, 0, 10 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.expectEmit(address(time));
        emit TimeLib.UnitsObjected(id, 0, 4 * 60);
        vm.prank(employer, relayer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        vm.expectEmit(address(time));
        emit TimeLib.ObjectionDropped(id, 0);
        vm.prank(employer, relayer);
        time.dropObjection(id, 0);
    }

    function test_a_week_settled_with_the_rest_returned_is_announced() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 3 days);
        _submit(id, 0, 16 * 60);
        vm.warp(time.settleAtOf(id, 0));
        vm.expectEmit(address(time));
        emit TimeLib.CycleSettled(id, 0, 128e6, WEEK_FUNDED - 128e6 - 0.64e6, false);
        vm.prank(stranger);
        time.settle(id, 0);
    }

    /// The unused budget is carried, and the next week funded from it pays only the rest.
    function test_a_carried_week_and_a_week_funded_from_the_carry_are_announced() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(time.settleAtOf(id, 0));
        uint256 unused = WEEK_FUNDED - 128e6 - 0.64e6;
        vm.expectEmit(address(time));
        emit TimeLib.CycleSettled(id, 0, 128e6, unused, true);
        time.settle(id, 0);
        vm.expectEmit(address(time));
        emit TimeLib.CycleFunded(id, 2, WEEK_FUNDED - unused, unused);
        vm.prank(employer, relayer);
        time.fundCycle(id);
    }

    function test_notice_and_ending_together_are_announced() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 2 days);
        vm.expectEmit(address(time));
        emit TimeLib.NoticeGiven(id, worker, 2);
        vm.prank(worker, relayer);
        time.giveNotice(id);
        assertEq(_engagement(id).runs, 2);

        bytes32 other = _active(_terms(), bytes32("f"));
        vm.warp(_start(t, 0) + 3 days);
        vm.expectEmit(address(time));
        emit TimeLib.EndAsked(other, employer);
        vm.prank(employer, relayer);
        time.endNow(other);
        vm.expectEmit(address(time));
        emit TimeLib.NoticeGiven(other, worker, 1);
        vm.prank(worker, relayer);
        time.endNow(other);
    }

    function test_closing_announces_what_was_paid_and_returned() public {
        TimeTerms memory t = _terms();
        t.cycles = 2;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.warp(_start(t, 1) + 1 days);
        _submit(id, 1, 60);
        vm.warp(time.settleAtOf(id, 1));
        time.settle(id, 0);
        time.settle(id, 1);
        vm.expectEmit(address(time));
        emit TimeLib.EngagementClosed(id, 2 * RATE, 0);
        vm.prank(stranger);
        time.close(id);
    }

    function test_an_amendment_proposed_and_accepted_is_announced() public {
        TimeTerms memory t = _terms();
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        bytes32 id = _active(t, SALT);
        vm.expectEmit(address(time));
        emit TimeLib.AmendmentProposed(id, employer, time.amendHashOf(n, 2), 2);
        vm.prank(employer, relayer);
        time.proposeAmendment(id, n, 2);
        vm.expectEmit(address(time));
        emit TimeLib.AmendmentAccepted(id, 1, 2);
        vm.prank(worker, relayer);
        time.acceptAmendment(id, n, 2);
    }

    /// A week settled with unused budget carried, then notice: closing pays the
    /// carry back, and the event says how much.
    function test_closing_with_a_carry_announces_the_carry_returned() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        uint256 carry = WEEK_FUNDED - 128e6 - 0.64e6;
        assertEq(_engagement(id).carry, carry);
        vm.prank(employer);
        time.giveNotice(id);
        vm.warp(_end(t, _engagement(id).runs - 1));
        vm.expectEmit(address(time));
        emit TimeLib.EngagementClosed(id, 128e6, carry);
        vm.prank(stranger);
        time.close(id);
    }

    /// Ids and hashes come from published encodings, so a client can work them out.
    function test_ids_and_hashes_follow_their_published_encodings() public view {
        TimeTerms memory t = _terms();
        assertEq(time.dealIdFor(employer, SALT), keccak256(abi.encode(block.chainid, address(time), employer, SALT)));
        assertEq(time.termsHashOf(t), keccak256(abi.encode(t)));
        assertEq(time.amendHashOf(t, 2), keccak256(abi.encode(t, uint16(2))));
    }
}
