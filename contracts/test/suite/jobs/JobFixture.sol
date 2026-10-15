// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "../SuiteFixture.sol";
import {KarwanJobEscrow} from "../../../src/suite/KarwanJobEscrow.sol";
import {JobCore, BountyTerms} from "../../../src/suite/jobs/JobTypes.sol";

abstract contract JobFixture is SuiteFixture {
    KarwanJobEscrow internal jobs;
    address internal client;
    uint64 internal clientId;
    address internal provider;
    uint64 internal providerId;
    address internal evaluator = makeAddr("evaluator");
    address internal stranger = makeAddr("stranger");

    /// A 200 USDC job, plus the client's half of the 1% fee.
    uint256 internal constant BUDGET = 200e6;
    uint256 internal constant FUNDED = 200e6 + 1e6;

    function _deployJobs() internal {
        _deploySuite();
        jobs = new KarwanJobEscrow(address(hub), address(usdc));
        hub.registerFamily(address(jobs), FEE_BPS);
        hub.setCaps(address(jobs), address(usdc), PER_DEAL, TOTAL);
        (client,, clientId) = _person("client");
        (provider,, providerId) = _person("provider");
        usdc.mint(client, 100_000e6);
        vm.prank(client);
        usdc.approve(address(jobs), type(uint256).max);
    }

    /// A job for `provider`, judged by `evaluator`, expiring in 10 days.
    function _job() internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(provider, evaluator, block.timestamp + 10 days, "write the report", address(0));
    }

    function _fundedJob() internal returns (uint256 id) {
        id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
    }

    function _submitted() internal returns (uint256 id) {
        id = _fundedJob();
        vm.prank(provider);
        jobs.submit(id, keccak256("report"), "");
    }

    function _core(uint256 id) internal view returns (JobCore memory) {
        return jobs.jobOf(id);
    }

    /// What a payee nets from `gross`, after their half of the 1% fee.
    function _net(uint256 gross) internal pure returns (uint256) {
        uint256 fee = (gross * FEE_BPS) / 10_000;
        return gross - (fee - fee / 2);
    }

    /// A 300 USDC contest judged by `evaluator`: 60%, 30% and 10%, entries
    /// for 7 days, awards within 3 more.
    function _contestTerms() internal view returns (BountyTerms memory t) {
        t.evaluator = evaluator;
        t.prize = 300e6;
        t.entriesBy = uint64(block.timestamp + 7 days);
        t.awardBy = uint64(block.timestamp + 10 days);
        t.shares = new uint16[](3);
        t.shares[0] = 6_000;
        t.shares[1] = 3_000;
        t.shares[2] = 1_000;
        t.description = "best logo";
    }

    function _contest() internal returns (uint256 id) {
        BountyTerms memory t = _contestTerms();
        vm.prank(client);
        id = jobs.openBounty(t);
    }

    function _enter(uint256 id, address who) internal {
        vm.prank(who);
        jobs.enter(id, keccak256(abi.encode("entry", who)));
    }
}
