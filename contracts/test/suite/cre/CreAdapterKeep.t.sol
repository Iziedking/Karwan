// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {CreFixture} from "./CreFixture.sol";
import {KarwanTimeEscrow} from "../../../src/suite/KarwanTimeEscrow.sol";
import {KarwanJobEscrow} from "../../../src/suite/KarwanJobEscrow.sol";
import {TimeTerms} from "../../../src/suite/time/TimeTypes.sol";
import {AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {JobStatus} from "../../../src/suite/jobs/JobTypes.sol";
import {IKarwanCreAdapter} from "../../../src/suite/interfaces/IKarwanCreAdapter.sol";

/// Whether a timeout is open to anyone is pinned by each family's own suite
/// (strangers call claim, reclaim, cancelMissed, executeRuling, applyFallback,
/// settle, close, release, confirmRejection and claimRefund there). These
/// tests pin the adapter's path: what it lets through and what it refuses.
contract CreAdapterKeepTest is CreFixture {
    KarwanTimeEscrow internal time;
    KarwanJobEscrow internal jobs;
    address internal employer;
    address internal worker;
    address internal client;
    address internal provider;
    address internal evaluator = makeAddr("evaluator");

    function setUp() public {
        _deployCre();
        time = new KarwanTimeEscrow(address(hub));
        hub.registerFamily(address(time), FEE_BPS);
        hub.setCaps(address(time), address(usdc), PER_DEAL, TOTAL);
        jobs = new KarwanJobEscrow(address(hub), address(usdc));
        hub.registerFamily(address(jobs), FEE_BPS);
        hub.setCaps(address(jobs), address(usdc), PER_DEAL, TOTAL);
        (employer,,) = _person("employer");
        (worker,,) = _person("worker");
        (client,,) = _person("client");
        (provider,,) = _person("provider");
        usdc.mint(employer, 10_000e6);
        usdc.mint(client, 10_000e6);
        vm.prank(employer);
        usdc.approve(address(time), type(uint256).max);
        vm.prank(client);
        usdc.approve(address(jobs), type(uint256).max);
    }

    function _call(address family, string memory sig, bytes memory args)
        internal
        pure
        returns (IKarwanCreAdapter.KeepCall memory)
    {
        return IKarwanCreAdapter.KeepCall(family, bytes4(keccak256(bytes(sig))), args);
    }

    function _timeTerms() internal view returns (TimeTerms memory t) {
        t.asset = address(usdc);
        t.worker = worker;
        t.rate = 8e6;
        t.unitScale = 60;
        t.maxUnits = 20 * 60;
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

    function _activeEngagement() internal returns (bytes32 id, TimeTerms memory t) {
        t = _timeTerms();
        vm.prank(employer);
        id = time.open("e1", t);
        bytes32 h = time.termsHashOf(t);
        vm.prank(worker);
        time.accept(id, h);
    }

    function _submittedJob() internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(provider, evaluator, block.timestamp + 30 days, "write the report", address(0));
        vm.prank(provider);
        jobs.setBudget(id, 200e6, "");
        vm.prank(client);
        jobs.fund(id, 200e6, "");
        vm.prank(provider);
        jobs.submit(id, keccak256("report"), "");
    }

    function _results() internal returns (bool[] memory oks) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = IKarwanCreAdapter.KeepResult.selector;
        uint256 n;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(adapter) && logs[i].topics[0] == topic) ++n;
        }
        oks = new bool[](n);
        n = 0;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(adapter) && logs[i].topics[0] == topic) {
                (, bool ok,) = abi.decode(logs[i].data, (bytes, bool, bytes));
                oks[n++] = ok;
            }
        }
    }

    function test_a_batch_lands_due_calls_across_families_and_isolates_the_rest() public {
        bytes32 due = _fundAccepted(_terms(), "a1");
        _deliver(due);
        bytes32 early = _fundAccepted(_terms(), "a2");
        (bytes32 engagement, TimeTerms memory t) = _activeEngagement();
        uint256 job = _submittedJob();
        vm.warp(uint256(t.startsAt) + t.cycleSecs + t.claimGrace);
        uint8 cycleBefore = time.getCycle(engagement, 0).state;

        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](4);
        calls[0] = _call(address(escrow), "claim(bytes32)", abi.encode(due));
        calls[1] = _call(address(escrow), "reclaim(bytes32)", abi.encode(early));
        calls[2] = _call(address(time), "settle(bytes32,uint16)", abi.encode(engagement, uint16(0)));
        calls[3] = _call(address(jobs), "release(uint256)", abi.encode(job));
        vm.recordLogs();
        _send(3, abi.encode(calls));

        assertTrue(forwarder.lastOk());
        bool[] memory oks = _results();
        assertEq(oks.length, 4);
        assertTrue(oks[0]);
        assertFalse(oks[1]);
        assertTrue(oks[2]);
        assertTrue(oks[3]);
        assertEq(uint8(_state(due)), uint8(AgreementState.Settled));
        assertEq(uint8(_state(early)), uint8(AgreementState.Accepted));
        assertTrue(time.getCycle(engagement, 0).state != cycleBefore);
        assertEq(uint8(jobs.getJob(job).status), uint8(JobStatus.Completed));
        assertEq(usdc.balanceOf(address(adapter)), 0);
    }

    function test_refuses_a_selector_outside_the_list() public {
        bytes32 id = _fundAccepted(_terms(), "a1");
        _deliver(id);
        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](1);
        calls[0] = _call(address(escrow), "release(bytes32)", abi.encode(id));
        _send(3, abi.encode(calls));
        assertFalse(forwarder.lastOk());
    }

    function test_refuses_a_target_that_is_not_a_family() public {
        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](1);
        calls[0] = _call(address(usdc), "claim(bytes32)", abi.encode(DEAL));
        _send(3, abi.encode(calls));
        assertFalse(forwarder.lastOk());
    }

    function test_refuses_an_empty_batch_more_than_eight_calls_and_long_args() public {
        _send(3, abi.encode(new IKarwanCreAdapter.KeepCall[](0)));
        assertFalse(forwarder.lastOk());

        IKarwanCreAdapter.KeepCall[] memory nine = new IKarwanCreAdapter.KeepCall[](9);
        for (uint256 i; i < 9; ++i) {
            nine[i] = _call(address(escrow), "claim(bytes32)", abi.encode(bytes32(i)));
        }
        vm.warp(block.timestamp + 1);
        _send(3, abi.encode(nine));
        assertFalse(forwarder.lastOk());

        IKarwanCreAdapter.KeepCall[] memory long = new IKarwanCreAdapter.KeepCall[](1);
        long[0] = _call(address(escrow), "claim(bytes32)", abi.encodePacked(bytes32(0), bytes32(0), bytes1(0)));
        vm.warp(block.timestamp + 1);
        _send(3, abi.encode(long));
        assertFalse(forwarder.lastOk());
    }

    function test_a_check_workflow_cannot_send_keeper_calls() public {
        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](1);
        calls[0] = _call(address(escrow), "claim(bytes32)", abi.encode(DEAL));
        bytes memory body = abi.encode(calls);
        forwarder.deliver(
            address(adapter), CHECK_ID, CHECK_NAME, creOwner, _envelope(3, uint64(block.timestamp), "k1", body)
        );
        assertFalse(forwarder.lastOk());
    }

    function test_a_not_due_call_pays_nobody() public {
        bytes32 id = _fundAccepted(_terms(), "a1");
        _deliver(id);
        uint256 sellerBefore = usdc.balanceOf(seller);
        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](1);
        calls[0] = _call(address(escrow), "claim(bytes32)", abi.encode(id));
        _send(3, abi.encode(calls));
        assertTrue(forwarder.lastOk());
        assertEq(usdc.balanceOf(seller), sellerBefore);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
    }

    /// karwan-risk sends at most 4 calls a report with a 7,000,000 gas limit.
    function test_four_due_claims_fit_the_workflow_gas_limit() public {
        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](4);
        for (uint256 i; i < 4; ++i) {
            bytes32 id = _fundAccepted(_terms(), bytes32(i + 100));
            _deliver(id);
            calls[i] = _call(address(escrow), "claim(bytes32)", abi.encode(id));
        }
        vm.warp(block.timestamp + 4 days);
        bytes memory body = abi.encode(calls);
        bytes32 reportId = keccak256(abi.encode(uint8(3), body, block.timestamp));
        vm.recordLogs();
        (bool sent,) = address(forwarder).call{gas: 7_000_000}(
            abi.encodeCall(forwarder.deliver, (address(adapter), KEEP_ID, KEEP_NAME, creOwner, _envelope(3, uint64(block.timestamp), reportId, body)))
        );
        assertTrue(sent);
        assertTrue(forwarder.lastOk());
        bool[] memory oks = _results();
        assertEq(oks.length, 4);
        for (uint256 i; i < 4; ++i) assertTrue(oks[i]);
    }
}
