// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanTimelock} from "../../../src/suite/KarwanTimelock.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";
import {EndgameConfig, EndgameConfigLib} from "../../../script/suite/EndgameConfig.sol";
import {EndgameDeploy, EndgameDeployment} from "../../../script/suite/EndgameDeploy.sol";
import {EndgameCheck} from "../../../script/suite/EndgameCheck.sol";
import {DeployEndgame} from "../../../script/DeployEndgame.s.sol";

/// @notice The suite as it deploys: owned by the timelock from the first block,
///         set up by one batch from the owner Safe, and nothing left to the
///         deployer key.
contract EndgameDeployTest is Test {
    address internal ownerSafe = makeAddr("ownerSafe");
    address internal guardianSafe = makeAddr("guardianSafe");
    address internal stranger = makeAddr("stranger");
    EndgameConfig internal c;
    EndgameDeployment internal d;
    Vm.Log[] internal deployLogs;

    function setUp() public {
        c.usdc = address(new BlocklistToken(6));
        c.minDelay = 24 hours;
        c.ownerSafe = ownerSafe;
        c.guardianSafe = guardianSafe;
        c.reviewSafe = makeAddr("reviewSafe");
        c.seniorSafe = makeAddr("seniorSafe");
        c.feeRecipient = makeAddr("feeRecipient");
        c.autoArbiter = makeAddr("autoArbiter");
        c.feeBps = 100;
        c.highValue = 5_000e6;
        c.perDealCap = 1_000e6;
        c.totalCap = 10_000e6;
        c.minReview = 1 hours;
        c.maxReview = 30 days;
        c.maxHorizon = 365 days;
        c.checkers.push(makeAddr("checker1"));
        c.checkers.push(makeAddr("checker2"));
        c.checkers.push(makeAddr("checker3"));
        c.checkerThreshold = 2;
        c.issuers.push(makeAddr("issuer"));
        vm.recordLogs();
        d = EndgameDeploy.deploy(c);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) deployLogs.push(logs[i]);
    }

    function _configure() internal {
        (address[] memory t, uint256[] memory v, bytes[] memory p) = EndgameDeploy.firstSettings(d, c);
        vm.prank(ownerSafe);
        d.timelock.scheduleBatch(t, v, p, bytes32(0), EndgameDeploy.SALT, c.minDelay);
        vm.warp(block.timestamp + c.minDelay);
        vm.prank(ownerSafe);
        d.timelock.executeBatch(t, v, p, bytes32(0), EndgameDeploy.SALT);
    }

    function test_the_timelock_owns_the_hub_from_the_first_block() public view {
        assertEq(d.hub.owner(), address(d.timelock));
        assertEq(d.hub.pendingOwner(), address(0));
        assertEq(d.hub.identity(), address(d.identity));
        assertEq(d.hub.record(), address(d.record));
        assertEq(d.hub.stakeVault(), address(d.vault));
        assertEq(d.timelock.getMinDelay(), 24 hours);
    }

    /// The deployer key holds no owner power and no timelock role once the
    /// script is done, and cannot wire the hub again.
    function test_the_deployer_can_do_nothing_after_the_deploy() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        d.hub.setGuardian(address(this));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        d.hub.registerFamily(address(d.agreement), 100);
        vm.expectRevert(KarwanHub.AlreadyWired.selector);
        d.hub.wire(address(d.identity), address(d.record), address(d.vault));
        bytes32[4] memory roles = [
            d.timelock.DEFAULT_ADMIN_ROLE(), d.timelock.PROPOSER_ROLE(),
            d.timelock.EXECUTOR_ROLE(), d.timelock.CANCELLER_ROLE()
        ];
        for (uint256 i; i < 4; ++i) assertFalse(d.timelock.hasRole(roles[i], address(this)));
    }

    /// Exactly these roles were granted: the timelock administers itself, the
    /// owner Safe proposes, executes and cancels, the guardian Safe cancels.
    function test_the_deploy_grants_exactly_the_expected_roles() public view {
        bytes32 granted = IAccessControl.RoleGranted.selector;
        uint256 n;
        for (uint256 i; i < deployLogs.length; ++i) {
            if (deployLogs[i].emitter != address(d.timelock) || deployLogs[i].topics[0] != granted) continue;
            bytes32 role = deployLogs[i].topics[1];
            address who = address(uint160(uint256(deployLogs[i].topics[2])));
            bool expected = (role == d.timelock.DEFAULT_ADMIN_ROLE() && who == address(d.timelock))
                || (role == d.timelock.PROPOSER_ROLE() && who == ownerSafe)
                || (role == d.timelock.EXECUTOR_ROLE() && who == ownerSafe)
                || (role == d.timelock.CANCELLER_ROLE() && (who == ownerSafe || who == guardianSafe));
            assertTrue(expected);
            ++n;
        }
        assertEq(n, 5);
    }

    function test_the_first_batch_sets_every_role_and_value() public {
        _configure();
        KarwanHub h = d.hub;
        assertEq(h.guardian(), guardianSafe);
        assertEq(h.reviewSafe(), c.reviewSafe);
        assertEq(h.seniorSafe(), c.seniorSafe);
        assertEq(h.feeRecipient(), c.feeRecipient);
        assertEq(h.autoArbiter(), c.autoArbiter);
        assertTrue(h.assetAllowed(c.usdc));
        assertEq(h.highValueOf(c.usdc), c.highValue);
        address[3] memory money = [address(d.agreement), address(d.time), address(d.jobs)];
        for (uint256 i; i < 3; ++i) {
            (bool registered,,,, uint16 fee) = h.families(money[i]);
            assertTrue(registered);
            assertEq(fee, c.feeBps);
            (uint128 perDeal, uint128 total) = h.capsOf(money[i], c.usdc);
            assertEq(perDeal, c.perDealCap);
            assertEq(total, c.totalCap);
        }
        (bool tfRegistered,,,, uint16 tfFee) = h.families(address(d.tradeFinance));
        assertTrue(tfRegistered);
        assertEq(tfFee, 0);
        assertTrue(h.isVerifier(address(d.verifier)));
        assertTrue(h.isIssuer(c.issuers[0]));
    }

    function test_the_batch_waits_the_delay_and_only_the_owner_safe_moves_it() public {
        (address[] memory t, uint256[] memory v, bytes[] memory p) = EndgameDeploy.firstSettings(d, c);
        vm.prank(stranger);
        vm.expectRevert();
        d.timelock.scheduleBatch(t, v, p, bytes32(0), EndgameDeploy.SALT, c.minDelay);
        vm.prank(ownerSafe);
        d.timelock.scheduleBatch(t, v, p, bytes32(0), EndgameDeploy.SALT, c.minDelay);
        vm.warp(block.timestamp + c.minDelay - 1);
        vm.prank(ownerSafe);
        vm.expectRevert();
        d.timelock.executeBatch(t, v, p, bytes32(0), EndgameDeploy.SALT);
        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        vm.expectRevert();
        d.timelock.executeBatch(t, v, p, bytes32(0), EndgameDeploy.SALT);
        vm.prank(ownerSafe);
        d.timelock.executeBatch(t, v, p, bytes32(0), EndgameDeploy.SALT);
        assertEq(d.hub.guardian(), guardianSafe);
    }

    /// The guardian Safe can cancel an ordinary change, never a protected one.
    function test_the_guardian_cancels_ordinary_changes_only() public {
        _configure();
        bytes memory raise = abi.encodeCall(KarwanHub.setCaps, (address(d.agreement), c.usdc, 2_000e6, 20_000e6));
        vm.prank(ownerSafe);
        d.timelock.schedule(address(d.hub), 0, raise, bytes32(0), bytes32("ordinary"), c.minDelay);
        bytes32 ordinary = d.timelock.hashOperation(address(d.hub), 0, raise, bytes32(0), bytes32("ordinary"));
        vm.prank(guardianSafe);
        d.timelock.cancel(ordinary);
        assertFalse(d.timelock.isOperation(ordinary));
        vm.prank(ownerSafe);
        d.timelock.scheduleProtected(address(d.hub), 0, raise, bytes32(0), bytes32("protected"));
        bytes32 protectedOp = d.timelock.hashOperation(address(d.hub), 0, raise, bytes32(0), bytes32("protected"));
        vm.prank(guardianSafe);
        vm.expectRevert(KarwanTimelock.Protected.selector);
        d.timelock.cancel(protectedOp);
        vm.warp(block.timestamp + 7 days);
        vm.prank(ownerSafe);
        d.timelock.execute(address(d.hub), 0, raise, bytes32(0), bytes32("protected"));
        (uint128 perDeal,) = d.hub.capsOf(address(d.agreement), c.usdc);
        assertEq(perDeal, 2_000e6);
    }

    /// With no checkers named, no verifier deploys and the batch lists none.
    function test_no_checkers_means_no_verifier() public {
        delete c.checkers;
        c.checkerThreshold = 0;
        EndgameDeployment memory e = EndgameDeploy.deploy(c);
        assertEq(address(e.verifier), address(0));
        (address[] memory t,, bytes[] memory p) = EndgameDeploy.firstSettings(e, c);
        for (uint256 i; i < t.length; ++i) assertTrue(bytes4(p[i]) != KarwanHub.setVerifier.selector);
    }

    function test_the_checker_passes_each_phase_in_turn() public {
        EndgameCheck.deployed(d, c, address(this));
        _configure();
        EndgameCheck.configured(d, c);
    }

    function test_the_checker_refuses_a_hub_that_is_not_yet_configured() public {
        vm.expectRevert(bytes("guardian is not the guardian Safe"));
        this.checkConfigured();
    }

    function test_the_checker_refuses_a_wrong_cap() public {
        _configure();
        c.perDealCap = 999e6;
        vm.expectRevert(bytes("agreement per-deal cap differs"));
        this.checkConfigured();
    }

    function checkConfigured() external view {
        EndgameCheck.configured(d, c);
    }

    /// The testnet config ships with every Safe unset, so no deploy can start
    /// from it until the owner fills them in.
    function test_the_shipped_testnet_config_is_refused_until_filled() public {
        vm.expectRevert(bytes("config: owner or guardian Safe unset"));
        this.loadShipped();
    }

    function loadShipped() external view returns (EndgameConfig memory) {
        return EndgameConfigLib.load(vm, "deployments/endgame-5042002.config.json");
    }

    /// The script end to end: the Safe files it writes, sent as written by the
    /// owner Safe, leave the suite exactly as the config says.
    function test_the_deploy_script_writes_files_the_owner_safe_can_send() public {
        string memory config = "deployments/endgame-test.config.json";
        string memory k = "cfg";
        vm.serializeAddress(k, "usdc", c.usdc);
        vm.serializeUint(k, "minDelay", c.minDelay);
        vm.serializeAddress(k, "ownerSafe", c.ownerSafe);
        vm.serializeAddress(k, "guardianSafe", c.guardianSafe);
        vm.serializeAddress(k, "reviewSafe", c.reviewSafe);
        vm.serializeAddress(k, "seniorSafe", c.seniorSafe);
        vm.serializeAddress(k, "feeRecipient", c.feeRecipient);
        vm.serializeAddress(k, "autoArbiter", c.autoArbiter);
        vm.serializeUint(k, "feeBps", c.feeBps);
        vm.serializeUint(k, "highValue", c.highValue);
        vm.serializeUint(k, "perDealCap", c.perDealCap);
        vm.serializeUint(k, "totalCap", c.totalCap);
        vm.serializeUint(k, "minReview", c.minReview);
        vm.serializeUint(k, "maxReview", c.maxReview);
        vm.serializeUint(k, "maxHorizon", c.maxHorizon);
        vm.serializeAddress(k, "checkers", c.checkers);
        vm.serializeUint(k, "checkerThreshold", c.checkerThreshold);
        vm.writeJson(vm.serializeAddress(k, "issuers", c.issuers), config);
        vm.setEnv("CONFIG", config);

        new DeployEndgame().run();

        string memory base = string.concat("deployments/endgame-", vm.toString(block.chainid));
        string memory book = vm.readFile(string.concat(base, ".json"));
        KarwanHub hub = KarwanHub(vm.parseJsonAddress(book, ".hub"));
        address timelock = vm.parseJsonAddress(book, ".timelock");
        assertEq(hub.owner(), timelock);
        _sendAsOwnerSafe(string.concat(base, ".schedule.json"), timelock);
        vm.warp(block.timestamp + c.minDelay);
        _sendAsOwnerSafe(string.concat(base, ".execute.json"), timelock);
        assertEq(hub.guardian(), guardianSafe);
        (uint128 perDeal,) = hub.capsOf(vm.parseJsonAddress(book, ".agreement"), c.usdc);
        assertEq(perDeal, c.perDealCap);
        assertTrue(hub.isVerifier(vm.parseJsonAddress(book, ".verifier")));

        vm.removeFile(config);
        vm.removeFile(string.concat(base, ".json"));
        vm.removeFile(string.concat(base, ".schedule.json"));
        vm.removeFile(string.concat(base, ".execute.json"));
    }

    function _sendAsOwnerSafe(string memory path, address timelock) internal {
        string memory batch = vm.readFile(path);
        assertEq(vm.parseJsonAddress(batch, ".transactions[0].to"), timelock);
        assertEq(vm.parseJsonString(batch, ".chainId"), vm.toString(block.chainid));
        vm.prank(ownerSafe);
        (bool ok,) = timelock.call(vm.parseJsonBytes(batch, ".transactions[0].data"));
        assertTrue(ok);
    }
}
