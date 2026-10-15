// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {JobStatus, BountyTerms} from "../../../src/suite/jobs/JobTypes.sol";
import {JobLib} from "../../../src/suite/jobs/JobLib.sol";
import {BountyLib} from "../../../src/suite/jobs/BountyLib.sol";
import {SettlementLib} from "../../../src/suite/settlement/SettlementLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";

/// @notice Bounties and contests: entries before the deadline, places awarded
///         from the entries, the rest back to the client.
contract BountyTest is JobFixture {
    address internal ann;
    uint64 internal annId;
    address internal bob;
    address internal cat;
    address internal dan;

    /// The prize plus the client's half of the 1% fee on it.
    uint256 internal constant CONTEST_FUNDED = 300e6 + 1.5e6;

    function setUp() public {
        _deployJobs();
        (ann,, annId) = _person("ann");
        (bob,,) = _person("bob");
        (cat,,) = _person("cat");
        dan = makeAddr("dan");
    }

    function test_a_contest_pays_its_places_from_the_entries() public {
        uint256 id = _contest();
        assertEq(usdc.balanceOf(address(jobs)), CONTEST_FUNDED);
        _enter(id, ann);
        _enter(id, bob);
        _enter(id, cat);
        _enter(id, dan);
        vm.warp(block.timestamp + 7 days);
        address[] memory winners = new address[](3);
        winners[0] = bob;
        winners[1] = ann;
        winners[2] = dan;
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), annId, 2, Outcome.COMPLETED, 0, 3_000);
        vm.prank(evaluator);
        jobs.award(id, winners);
        assertEq(usdc.balanceOf(bob), _net(180e6));
        assertEq(usdc.balanceOf(ann), _net(90e6));
        assertEq(usdc.balanceOf(dan), _net(30e6));
        assertEq(usdc.balanceOf(cat), 0);
        assertEq(usdc.balanceOf(feeSafe), 3e6);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
    }

    function test_an_early_award_must_fill_every_place() public {
        uint256 id = _contest();
        _enter(id, ann);
        _enter(id, bob);
        address[] memory two = new address[](2);
        two[0] = ann;
        two[1] = bob;
        vm.prank(evaluator);
        vm.expectRevert(BountyLib.BadWinners.selector);
        jobs.award(id, two);
        vm.warp(block.timestamp + 7 days);
        uint256 before = usdc.balanceOf(client);
        vm.prank(evaluator);
        jobs.award(id, two);
        assertEq(usdc.balanceOf(ann), _net(180e6));
        assertEq(usdc.balanceOf(bob), _net(90e6));
        assertEq(usdc.balanceOf(client), before + CONTEST_FUNDED - _net(180e6) - _net(90e6) - 2.7e6);
    }

    function test_only_entrants_win_and_each_place_once() public {
        uint256 id = _contest();
        _enter(id, ann);
        _enter(id, bob);
        _enter(id, cat);
        address[] memory w = new address[](3);
        w[0] = ann;
        w[1] = bob;
        w[2] = dan;
        vm.prank(evaluator);
        vm.expectRevert(BountyLib.BadWinners.selector);
        jobs.award(id, w);
        w[2] = ann;
        vm.prank(evaluator);
        vm.expectRevert(SettlementLib.BadParties.selector);
        jobs.award(id, w);
        w[2] = cat;
        vm.prank(stranger);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.award(id, w);
    }

    function test_the_client_and_the_evaluator_cannot_enter() public {
        uint256 id = _contest();
        vm.prank(client);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.enter(id, keccak256("mine"));
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.enter(id, keccak256("mine"));
    }

    function test_entries_close_at_the_deadline_and_can_be_replaced() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.prank(ann);
        jobs.enter(id, keccak256("better"));
        assertEq(jobs.entryOf(id, ann), keccak256("better"));
        assertEq(jobs.jobOf(id).entries, 1);
        vm.warp(block.timestamp + 7 days);
        vm.prank(bob);
        vm.expectRevert(JobLib.Late.selector);
        jobs.enter(id, keccak256("late"));
    }

    function test_an_unawarded_bounty_goes_back_and_is_recorded() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(block.timestamp + 10 days);
        address[] memory w = new address[](1);
        w[0] = ann;
        vm.prank(evaluator);
        vm.expectRevert(JobLib.Late.selector);
        jobs.award(id, w);
        uint256 before = usdc.balanceOf(client);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), clientId, 0, Outcome.FAILED, 0, 0);
        vm.prank(stranger);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(client), before + CONTEST_FUNDED);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
    }

    function test_the_client_takes_back_a_bounty_nobody_entered() public {
        uint256 id = _contest();
        uint256 before = usdc.balanceOf(client);
        vm.prank(client);
        jobs.reject(id, bytes32("not needed"), "");
        assertEq(usdc.balanceOf(client), before + CONTEST_FUNDED);
        uint256 second = _contest();
        _enter(second, ann);
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.reject(second, bytes32("not needed"), "");
    }

    function test_bounty_terms_are_checked() public {
        BountyTerms memory t = _contestTerms();
        t.shares[2] = 999;
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.openBounty(t);
        t = _contestTerms();
        t.shares = new uint16[](9);
        for (uint256 i; i < 8; ++i) t.shares[i] = 1_000;
        t.shares[8] = 2_000;
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.openBounty(t);
        t = _contestTerms();
        t.awardBy = t.entriesBy - 1;
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.openBounty(t);
        t = _contestTerms();
        t.evaluator = address(0);
        vm.prank(client);
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.openBounty(t);
    }

    function test_job_steps_do_not_apply_to_a_bounty() public {
        uint256 id = _contest();
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.complete(id, bytes32("x"), "");
        vm.prank(ann);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.submit(id, keccak256("x"), "");
    }

    // --------------------------- Review findings --------------------------

    function test_after_the_deadline_the_evaluator_may_award_fewer_places() public {
        uint256 id = _contest();
        _enter(id, ann);
        _enter(id, bob);
        _enter(id, dan);
        vm.warp(block.timestamp + 7 days);
        address[] memory one = new address[](1);
        one[0] = bob;
        uint256 before = usdc.balanceOf(client);
        vm.prank(evaluator);
        jobs.award(id, one);
        assertEq(usdc.balanceOf(bob), _net(180e6));
        assertEq(usdc.balanceOf(dan), 0);
        assertEq(usdc.balanceOf(client), before + CONTEST_FUNDED - _net(180e6) - 1.8e6);
    }

    function test_the_clients_own_wallets_cannot_enter() public {
        uint256 id = _contest();
        (address alt, uint256 altKey) = makeAddrAndKey("clientAlt");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(clientId, alt, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory sig = _sig(altKey, d);
        vm.prank(client);
        identity.bind(alt, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, sig);
        vm.prank(alt);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.enter(id, keccak256("mine"));
    }

    function test_each_winner_is_recorded_at_what_they_were_paid() public {
        hub.setCaps(address(jobs), address(usdc), 10_000e6, 100_000e6);
        BountyTerms memory t = _contestTerms();
        t.prize = 2_000e6;
        t.shares = new uint16[](2);
        t.shares[0] = 9_000;
        t.shares[1] = 1_000;
        vm.prank(client);
        uint256 id = jobs.openBounty(t);
        _enter(id, bob);
        _enter(id, ann);
        address[] memory w = new address[](2);
        w[0] = bob;
        w[1] = ann;
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), clientId, 0, Outcome.COMPLETED, 2, 0);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), annId, 2, Outcome.COMPLETED, 1, 1_000);
        vm.prank(evaluator);
        jobs.award(id, w);
    }

    function test_awards_come_after_entries_close() public {
        BountyTerms memory t = _contestTerms();
        t.awardBy = t.entriesBy;
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.openBounty(t);
    }
}
