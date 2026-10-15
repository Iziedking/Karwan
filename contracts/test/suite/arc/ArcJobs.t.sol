// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../../../src/suite/KarwanStakeVault.sol";
import {KarwanJobEscrow} from "../../../src/suite/KarwanJobEscrow.sol";

/// @notice An ERC-8183 job on Arc's own USDC, against Arc Foundry forking Arc
///         testnet (`forge-remote.sh --arc`): the evaluator's silence pays the
///         provider, and a provider on USDC's blocklist is owed, never lost.
contract ArcJobsTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    KarwanJobEscrow internal jobs;
    address internal client = makeAddr("arcClient");
    address internal provider = makeAddr("arcProvider");
    address internal evaluator = makeAddr("arcEvaluator");

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
        jobs = new KarwanJobEscrow(address(hub), address(USDC));
        hub.registerFamily(address(jobs), 100);
        hub.setCaps(address(jobs), address(USDC), 1_000e6, 10_000e6);
        vm.deal(client, 1_000 ether);
        vm.prank(client);
        USDC.approve(address(jobs), type(uint256).max);
    }

    function _paidBySilence(address to) internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(to, evaluator, block.timestamp + 10 days, "arc job", address(0));
        vm.prank(to);
        jobs.setBudget(id, 200e6, "");
        vm.prank(client);
        jobs.fund(id, 200e6, "");
        vm.prank(to);
        jobs.submit(id, keccak256("work"), "");
        vm.warp(block.timestamp + 5 days);
        jobs.release(id);
    }

    function test_silence_pays_a_job_on_arc_usdc() public {
        uint256 before = USDC.balanceOf(provider);
        _paidBySilence(provider);
        assertEq(USDC.balanceOf(provider), before + 200e6 - 1e6);
    }

    function test_a_job_for_a_blocklisted_provider_is_owed_on_arc() public {
        uint256 id = _paidBySilence(BLOCKED);
        assertEq(jobs.owed(address(USDC), BLOCKED), 200e6 - 1e6);
        assertEq(jobs.accountOf(bytes32(id)).balance, 0);
    }
}
