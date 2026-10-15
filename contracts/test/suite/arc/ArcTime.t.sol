// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../../../src/suite/KarwanStakeVault.sol";
import {KarwanTimeEscrow} from "../../../src/suite/KarwanTimeEscrow.sol";
import {TimeTerms} from "../../../src/suite/time/TimeTypes.sol";

/// @notice A week of hourly work on Arc's own USDC, against Arc Foundry forking
///         Arc testnet (`forge-remote.sh --arc`): silence pays the worker, and
///         a worker on USDC's blocklist is owed the week, never lost.
contract ArcTimeTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    KarwanTimeEscrow internal time;
    address internal employer = makeAddr("arcEmployer");
    address internal worker = makeAddr("arcWorker");

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        KarwanHub hub = new KarwanHub(address(this));
        KarwanIdentityRegistry identity = new KarwanIdentityRegistry(address(hub));
        KarwanRecord record = new KarwanRecord(address(hub));
        KarwanStakeVault vault = new KarwanStakeVault(address(hub));
        hub.wire(address(identity), address(record), address(vault));
        hub.setAsset(address(USDC), true, 5_000e6);
        hub.setFeeRecipient(makeAddr("arcFees"));
        hub.setGuardian(makeAddr("arcGuardian"));
        hub.setReviewers(makeAddr("arcReview"), makeAddr("arcSenior"));
        time = new KarwanTimeEscrow(address(hub));
        hub.registerFamily(address(time), 100);
        hub.setCaps(address(time), address(USDC), 1_000e6, 10_000e6);
        vm.deal(employer, 1_000 ether);
        vm.prank(employer);
        USDC.approve(address(time), type(uint256).max);
    }

    function _week(address to) internal returns (bytes32 id, TimeTerms memory t) {
        t.asset = address(USDC);
        t.worker = to;
        t.rate = 8e6;
        t.unitScale = 60;
        t.maxUnits = 20 * 60;
        t.cycleSecs = 7 days;
        t.cycles = 1;
        t.startsAt = uint64(block.timestamp + 1 hours);
        t.acceptBy = uint64(block.timestamp + 1 hours);
        t.claimGrace = 2 days;
        t.reviewWindow = 5 days;
        t.fallbackBps = 5_000;
        t.agreementHash = keccak256("arc week");
        vm.prank(employer);
        id = time.open(keccak256(abi.encode(to)), t);
        bytes32 h = time.termsHashOf(t);
        vm.prank(to);
        time.accept(id, h);
        vm.warp(uint256(t.startsAt) + 3 days);
        vm.prank(to);
        time.submit(id, 0, 16 * 60, keccak256("log"));
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
    }

    function test_silence_pays_a_week_of_hours_on_arc_usdc() public {
        uint256 before = USDC.balanceOf(worker);
        _week(worker);
        assertEq(USDC.balanceOf(worker), before + 128e6 - 0.64e6);
    }

    function test_a_week_for_a_blocklisted_worker_is_owed_on_arc() public {
        (bytes32 id,) = _week(BLOCKED);
        assertEq(time.owed(address(USDC), BLOCKED), 128e6 - 0.64e6);
        assertEq(time.accountOf(id).balance, 0);
    }
}
