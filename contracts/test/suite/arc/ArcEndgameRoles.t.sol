// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanCheckVerifier} from "../../../src/suite/KarwanCheckVerifier.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {EndgameConfig} from "../../../script/suite/EndgameConfig.sol";
import {EndgameDeploy, EndgameDeployment} from "../../../script/suite/EndgameDeploy.sol";
import {EndgameRoles} from "../../../script/suite/EndgameRoles.sol";

/// @notice The role scenario the testnet suite runs once configured, proved
///         first on an Arc fork (`forge-remote.sh --arc`) against a suite
///         deployed and configured the same way.
contract ArcEndgameRolesTest is Test, EndgameRoles {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal ownerSafe = makeAddr("ownerSafe");
    address internal feeRecipient = makeAddr("feeRecipient");
    RoleKeys internal k;
    EndgameDeployment internal d;

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        (, k.buyer) = makeAddrAndKey("rolesBuyer");
        (, k.seller) = makeAddrAndKey("rolesSeller");
        (, k.arbiter) = makeAddrAndKey("rolesArbiter");
        (, k.issuer) = makeAddrAndKey("rolesIssuer");
        (, k.checker1) = makeAddrAndKey("rolesChecker1");
        (, k.checker2) = makeAddrAndKey("rolesChecker2");
        (, k.checker3) = makeAddrAndKey("rolesChecker3");

        EndgameConfig memory c;
        c.usdc = address(USDC);
        c.minDelay = 24 hours;
        c.ownerSafe = ownerSafe;
        c.guardianSafe = makeAddr("guardianSafe");
        c.reviewSafe = makeAddr("reviewSafe");
        c.seniorSafe = makeAddr("seniorSafe");
        c.feeRecipient = feeRecipient;
        c.autoArbiter = vm.addr(k.arbiter);
        c.feeBps = 100;
        c.highValue = 5_000e6;
        c.perDealCap = 1_005e6;
        c.totalCap = 10_000e6;
        c.minReview = 1 hours;
        c.maxReview = 30 days;
        c.maxHorizon = 365 days;
        c.checkers = new address[](3);
        c.checkers[0] = vm.addr(k.checker1);
        c.checkers[1] = vm.addr(k.checker2);
        c.checkers[2] = vm.addr(k.checker3);
        c.checkerThreshold = 2;
        c.issuers = new address[](1);
        c.issuers[0] = vm.addr(k.issuer);

        d = EndgameDeploy.deploy(c);
        (address[] memory t, uint256[] memory v, bytes[] memory p) = EndgameDeploy.firstSettings(d, c);
        vm.prank(ownerSafe);
        d.timelock.scheduleBatch(t, v, p, bytes32(0), EndgameDeploy.SALT, c.minDelay);
        vm.warp(block.timestamp + c.minDelay);
        vm.prank(ownerSafe);
        d.timelock.executeBatch(t, v, p, bytes32(0), EndgameDeploy.SALT);

        vm.deal(vm.addr(k.buyer), 100 ether);
    }

    function test_every_role_acts_once_and_the_split_settles_after_the_appeal_window() public {
        Opened memory o = _openStage(d, k);
        address seller = vm.addr(k.seller);

        assertEq(d.record.factsOf(d.identity.identityOf(seller)).length, 1);
        assertEq(uint8(d.agreement.getDeal(o.checked).state), uint8(AgreementState.Settled));
        assertEq(USDC.balanceOf(seller), 19.9e6);
        assertGe(USDC.balanceOf(vm.addr(k.arbiter)), 0.5e6);
        assertGe(USDC.balanceOf(vm.addr(k.issuer)), 0.5e6);

        vm.prank(vm.addr(k.buyer));
        vm.expectRevert();
        d.agreement.executeRuling(o.disputed);

        vm.warp(block.timestamp + APPEAL_WINDOW);
        bytes32 id = _settleStage(d, k);
        assertEq(id, o.disputed);
        assertEq(USDC.balanceOf(address(d.agreement)), 0);
        assertGt(USDC.balanceOf(seller), 19.9e6);
    }

    /// A run cut off after the checked deal was paid finishes from where it
    /// stopped, and a second run changes nothing.
    function test_stage_one_finishes_a_half_finished_run_and_reruns_as_a_no_op() public {
        address seller = vm.addr(k.seller);
        AgreementTerms memory t = _checkedTerms(d, address(USDC), seller);
        vm.startPrank(vm.addr(k.buyer));
        USDC.approve(address(d.agreement), type(uint256).max);
        d.agreement.fund(CHECKED_SALT, t);
        vm.stopPrank();

        Opened memory o = _openStage(d, k);
        assertEq(uint8(d.agreement.getDeal(o.checked).state), uint8(AgreementState.Settled));
        assertEq(uint8(d.agreement.getDeal(o.disputed).state), uint8(AgreementState.Disputed));
        uint256 sellerHas = USDC.balanceOf(seller);

        Opened memory again = _openStage(d, k);
        assertEq(again.factId, o.factId);
        assertEq(again.checked, o.checked);
        assertEq(again.disputed, o.disputed);
        assertEq(d.record.factsOf(d.identity.identityOf(seller)).length, 1);
        assertEq(USDC.balanceOf(seller), sellerHas);
    }

    /// One checker alone cannot pass a delivery; the verifier needs two.
    function test_one_checker_signature_is_refused() public {
        bytes32 id = keccak256("any deal");
        bytes32 proof = keccak256("proof");
        bytes32 digest = d.verifier.reportDigest(address(d.agreement), id, 1, true, proof);
        address[] memory signers = new address[](1);
        bytes[] memory sigs = new bytes[](1);
        signers[0] = vm.addr(k.checker3);
        sigs[0] = _sign(k.checker3, digest);
        vm.expectRevert(KarwanCheckVerifier.NotEnough.selector);
        d.verifier.report(address(d.agreement), id, 1, true, proof, signers, sigs);
    }
}
