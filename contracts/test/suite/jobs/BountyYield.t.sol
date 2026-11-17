// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {JobStatus} from "../../../src/suite/jobs/JobTypes.sol";

/// @notice View 88 (owner, 17 Nov 2026): a contest's prize can wait months for
///         judging, so the second job escrow takes an 80% yield share. A
///         contest copies the share when it opens, its prize is parked in the
///         pool once the hub has one, and every payout, picked or automatic,
///         is paid in full from the pool or owed until the pool can pay.
contract BountyYieldTest is JobFixture {
    uint16 internal constant SHARE = 8_000;
    uint256 internal constant AWARD_BY = 10 days;
    uint256 internal constant WAIT = 3 days;

    address internal ann;
    address internal bob;
    address internal cat;
    uint256 internal t0;

    function setUp() public {
        _deployJobs();
        (ann,,) = _person("ann");
        (bob,,) = _person("bob");
        (cat,,) = _person("cat");
        t0 = vm.getBlockTimestamp();
    }

    function _books() internal view {
        assertEq(
            usdc.balanceOf(address(jobs)) + jobs.parked(address(usdc)),
            jobs.held(address(usdc)) + jobs.owedTotal(address(usdc))
        );
        assertEq(jobs.parked(address(usdc)), pool.principalOf(address(jobs)));
    }

    function _threeEntries(uint256 id) internal {
        _enter(id, ann);
        vm.warp(t0 + 1 hours);
        _enter(id, bob);
        vm.warp(t0 + 2 hours);
        _enter(id, cat);
    }

    function test_a_contest_parks_its_share_of_the_prize() public {
        _deployYield(address(jobs), SHARE);
        uint256 id = _contest();
        assertEq(jobs.accountOf(bytes32(id)).yieldBps, SHARE);
        jobs.rebalanceYield(address(usdc));
        uint256 held = jobs.held(address(usdc));
        assertEq(jobs.parked(address(usdc)), (held * SHARE) / 10_000);
        _books();
    }

    /// The batch sets the share before Circle entitles a pool. A contest opened
    /// before the pool exists keeps its whole prize in the escrow; only
    /// contests opened after it take the share.
    function test_a_contest_opened_before_the_pool_stays_out_of_it() public {
        hub.setYieldShare(address(jobs), SHARE);
        uint256 early = _contest();
        assertEq(jobs.accountOf(bytes32(early)).yieldBps, 0);
        _deployYield(address(jobs), SHARE);
        jobs.rebalanceYield(address(usdc));
        assertEq(jobs.parked(address(usdc)), 0, "the early contest is never parked");
        uint256 late = _contest();
        assertEq(jobs.accountOf(bytes32(late)).yieldBps, SHARE);
        jobs.rebalanceYield(address(usdc));
        assertGt(jobs.parked(address(usdc)), 0);
        _books();
    }

    function test_nobody_judged_pays_the_earliest_entries_in_full_from_the_pool() public {
        _deployYield(address(jobs), SHARE);
        uint256 id = _contest();
        jobs.rebalanceYield(address(usdc));
        pool.rebalance();
        _threeEntries(id);
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(t0 + AWARD_BY + WAIT);
        vm.prank(stranger);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(ann), _net(180e6));
        assertEq(usdc.balanceOf(bob), _net(90e6));
        assertEq(usdc.balanceOf(cat), _net(30e6));
        assertEq(usdc.balanceOf(client), clientBefore);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
        assertEq(jobs.parked(address(usdc)), 0);
        assertEq(jobs.held(address(usdc)), 0);
        _books();
    }

    /// The pool keeps at least 5,000 USDC as cash, which would cover a 300 USDC
    /// prize; with no cash buffer the prize sits in the Teller.
    function test_a_picked_winner_is_owed_while_the_pool_cannot_pay_then_paid() public {
        _deployYield(address(jobs), SHARE);
        pool.setBuffer(0, 0);
        uint256 id = _contest();
        jobs.rebalanceYield(address(usdc));
        pool.rebalance();
        _threeEntries(id);
        vm.warp(t0 + 8 days);
        teller.setPaused(true);
        address[] memory w = new address[](1);
        w[0] = cat;
        vm.prank(evaluator);
        jobs.award(id, w);
        uint256 paid = usdc.balanceOf(cat);
        uint256 owed = jobs.owed(address(usdc), cat);
        assertEq(paid + owed, _net(180e6), "first place, paid or owed");
        assertGt(owed, 0, "the part in the pool waits");
        _books();
        teller.setPaused(false);
        vm.prank(cat);
        jobs.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(cat), _net(180e6));
        uint256 back = jobs.owed(address(usdc), client);
        assertEq(back, 120e6 + 0.6e6, "the places not given and their fee go back to the buyer");
        uint256 clientBefore = usdc.balanceOf(client);
        vm.prank(client);
        jobs.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(client), clientBefore + back);
        assertEq(jobs.owedTotal(address(usdc)), 0);
        _books();
    }

    function test_a_contest_nobody_entered_goes_back_to_the_buyer_from_the_pool() public {
        _deployYield(address(jobs), SHARE);
        uint256 before = usdc.balanceOf(client);
        uint256 id = _contest();
        jobs.rebalanceYield(address(usdc));
        pool.rebalance();
        vm.warp(t0 + AWARD_BY + WAIT);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(client), before);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
        _books();
    }
}
