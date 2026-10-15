// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "../SuiteFixture.sol";
import {KarwanTimeEscrow} from "../../../src/suite/KarwanTimeEscrow.sol";
import {TimeTerms, TimeCycle, TimeEngagement, TimeState} from "../../../src/suite/time/TimeTypes.sol";

abstract contract TimeFixture is SuiteFixture {
    KarwanTimeEscrow internal time;
    address internal employer;
    uint256 internal employerKey;
    uint64 internal employerId;
    address internal worker;
    uint256 internal workerKey;
    uint64 internal workerId;
    address internal stranger = makeAddr("stranger");

    /// 8 USDC an hour, billed by the minute, at most 20 hours a week.
    uint128 internal constant RATE = 8e6;
    uint32 internal constant WEEK_MAX = 20 * 60;
    /// The week's budget, 160 USDC, plus the employer's half of a 1% fee.
    uint256 internal constant WEEK_FUNDED = 160e6 + 0.8e6;

    function _deployTime() internal {
        _deploySuite();
        time = new KarwanTimeEscrow(address(hub));
        hub.registerFamily(address(time), FEE_BPS);
        hub.setCaps(address(time), address(usdc), PER_DEAL, TOTAL);
        (employer, employerKey, employerId) = _person("employer");
        (worker, workerKey, workerId) = _person("worker");
        usdc.mint(employer, 100_000e6);
        vm.prank(employer);
        usdc.approve(address(time), type(uint256).max);
    }

    /// Four weekly cycles from tomorrow, a 2-day claim grace, a 5-day review,
    /// one cycle of notice, unused budget refunded.
    function _terms() internal view returns (TimeTerms memory t) {
        t.asset = address(usdc);
        t.worker = worker;
        t.rate = RATE;
        t.unitScale = 60;
        t.maxUnits = WEEK_MAX;
        t.cycleSecs = 7 days;
        t.cycles = 4;
        t.startsAt = uint64(block.timestamp + 1 days);
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.claimGrace = 2 days;
        t.reviewWindow = 5 days;
        t.noticeCycles = 1;
        t.partialBps = 5_000;
        t.fallbackBps = 5_000;
        t.agreementHash = keccak256("engagement");
    }

    function _offer(TimeTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        vm.prank(employer);
        id = time.open(salt, t);
    }

    function _active(TimeTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        id = _offer(t, salt);
        bytes32 h = time.termsHashOf(t);
        vm.prank(worker);
        time.accept(id, h);
    }

    function _start(TimeTerms memory t, uint256 k) internal view returns (uint256) {
        return uint256(t.startsAt) + k * t.cycleSecs;
    }

    function _end(TimeTerms memory t, uint256 k) internal view returns (uint256) {
        return uint256(t.startsAt) + (k + 1) * t.cycleSecs;
    }

    function _submit(bytes32 id, uint16 k, uint32 units) internal {
        vm.prank(worker);
        time.submit(id, k, units, keccak256(abi.encode("log", k, units)));
    }

    function _fund(bytes32 id) internal {
        vm.prank(employer);
        time.fundCycle(id);
    }

    function _cycle(bytes32 id, uint16 k) internal view returns (TimeCycle memory) {
        return time.getCycle(id, k);
    }

    function _engagement(bytes32 id) internal view returns (TimeEngagement memory) {
        return time.getEngagement(id);
    }

    /// What the worker nets from `gross`, after their half of the 1% fee.
    function _net(uint256 gross) internal pure returns (uint256) {
        uint256 fee = (gross * FEE_BPS) / 10_000;
        return gross - (fee - fee / 2);
    }
}
