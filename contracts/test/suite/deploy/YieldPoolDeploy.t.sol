// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KarwanYieldPool} from "../../../src/suite/KarwanYieldPool.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";
import {MockTeller} from "../mocks/MockTeller.sol";
import {EndgameConfig} from "../../../script/suite/EndgameConfig.sol";
import {EndgameDeploy, EndgameDeployment} from "../../../script/suite/EndgameDeploy.sol";
import {DeployYieldPool} from "../../../script/DeployYieldPool.s.sol";

/// @notice The USDC yield pool as it deploys on the live suite: the deployer
///         keeps nothing, and one timelock batch from the owner Safe points the
///         hub at the pool and the pool at the USYC Teller, as
///         scripts/ops/yield-pool-timelock-batch.mjs writes it.
contract YieldPoolDeployTest is Test {
    uint256 internal constant ARC_TESTNET = 5042002;
    address internal ownerSafe = makeAddr("ownerSafe");
    address internal stranger = makeAddr("stranger");
    EndgameConfig internal c;
    EndgameDeployment internal d;
    DeployYieldPool internal script;
    MockTeller internal teller;

    function setUp() public {
        c.usdc = address(new BlocklistToken(6));
        c.minDelay = 24 hours;
        c.ownerSafe = ownerSafe;
        c.guardianSafe = makeAddr("guardianSafe");
        c.reviewSafe = makeAddr("reviewSafe");
        c.seniorSafe = makeAddr("seniorSafe");
        c.feeRecipient = makeAddr("feeRecipient");
        c.autoArbiter = makeAddr("autoArbiter");
        c.feeBps = 100;
        c.highValue = 5_000e6;
        c.perDealCap = 1_005e6;
        c.totalCap = 10_000e6;
        c.minReview = 1 hours;
        c.maxReview = 30 days;
        c.maxHorizon = 365 days;
        c.checkers.push(makeAddr("checker1"));
        c.checkers.push(makeAddr("checker2"));
        c.checkers.push(makeAddr("checker3"));
        c.checkerThreshold = 2;
        c.issuers.push(makeAddr("issuer"));
        d = EndgameDeploy.deploy(c);
        (address[] memory t, uint256[] memory v, bytes[] memory p) = EndgameDeploy.firstSettings(d, c);
        _run(t, v, p, EndgameDeploy.SALT);
        teller = new MockTeller(BlocklistToken(c.usdc));
        script = new DeployYieldPool();
        vm.chainId(ARC_TESTNET);
    }

    function _run(address[] memory t, uint256[] memory v, bytes[] memory p, bytes32 salt) internal {
        vm.prank(ownerSafe);
        d.timelock.scheduleBatch(t, v, p, bytes32(0), salt, c.minDelay);
        vm.warp(block.timestamp + c.minDelay);
        vm.prank(ownerSafe);
        d.timelock.executeBatch(t, v, p, bytes32(0), salt);
    }

    /// The two calls the batch script queues, in its order.
    function _wire(KarwanYieldPool pool) internal {
        address[] memory t = new address[](2);
        t[0] = address(d.hub);
        t[1] = address(pool);
        uint256[] memory v = new uint256[](2);
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encodeCall(d.hub.setYieldPool, (c.usdc, address(pool)));
        p[1] = abi.encodeCall(pool.setTeller, (address(teller)));
        _run(t, v, p, keccak256("karwan.yieldpool.usdc"));
    }

    function test_the_pool_belongs_to_the_hub_and_the_deployer_keeps_nothing() public {
        KarwanYieldPool pool = script.deploy(address(d.hub), c.usdc);
        assertEq(pool.hub(), address(d.hub));
        assertEq(pool.asset(), c.usdc);
        assertEq(address(pool.teller()), address(0));
        vm.expectRevert(KarwanYieldPool.NotOwner.selector);
        pool.setTeller(address(teller));
        vm.prank(ownerSafe);
        vm.expectRevert(KarwanYieldPool.NotOwner.selector);
        pool.setTeller(address(teller));
    }

    function test_one_timelock_batch_points_the_hub_at_the_pool_and_the_pool_at_the_teller() public {
        KarwanYieldPool pool = script.deploy(address(d.hub), c.usdc);
        _wire(pool);
        assertEq(d.hub.yieldPoolOf(c.usdc), address(pool));
        assertEq(address(pool.teller()), address(teller));
    }

    /// Before Circle allowlists the pool every subscription fails and the
    /// pool keeps cash; once allowlisted the same pool subscribes.
    function test_the_pool_waits_in_cash_until_it_is_allowlisted() public {
        KarwanYieldPool pool = script.deploy(address(d.hub), c.usdc);
        _wire(pool);
        BlocklistToken(c.usdc).mint(stranger, 20_000e6);
        vm.startPrank(stranger);
        BlocklistToken(c.usdc).approve(address(pool), 20_000e6);
        pool.backstop(20_000e6);
        vm.stopPrank();
        pool.rebalance();
        assertEq(teller.share_().balanceOf(address(pool)), 0);
        teller.entitle(address(pool), true);
        pool.rebalance();
        assertGt(teller.share_().balanceOf(address(pool)), 0);
    }

    /// The hub takes one pool per asset, once, so a second deploy is refused
    /// before it costs anything.
    function test_a_second_pool_is_refused_once_one_is_set() public {
        KarwanYieldPool pool = script.deploy(address(d.hub), c.usdc);
        _wire(pool);
        vm.expectRevert(abi.encodeWithSelector(DeployYieldPool.PoolAlreadySet.selector, address(pool)));
        script.deploy(address(d.hub), c.usdc);
    }

    function test_it_deploys_only_on_arc_testnet() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployYieldPool.WrongChain.selector, 1));
        script.deploy(address(d.hub), c.usdc);
    }
}
