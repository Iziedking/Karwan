// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";
import {SettlementLib} from "../../../src/suite/settlement/SettlementLib.sol";
import {EndgameConfig} from "../../../script/suite/EndgameConfig.sol";
import {EndgameDeploy, EndgameDeployment} from "../../../script/suite/EndgameDeploy.sol";
import {EndgameCheck} from "../../../script/suite/EndgameCheck.sol";
import {ISafe, ISafeProxyFactory} from "../mocks/ISafe.sol";

/// @notice The testnet deploy rehearsed on an Arc fork (`forge-remote.sh
///         --arc`): Safes made by Arc's own Safe v1.4.1 factory, the suite
///         configured only through them, and a deal settled on Arc's USDC.
contract ArcDeployRehearsalTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    ISafeProxyFactory internal constant FACTORY = ISafeProxyFactory(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67);
    address internal constant SAFE_L2 = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address internal constant HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    uint256[] internal ownerKeys;
    uint256[] internal guardianKeys;
    ISafe internal ownerSafe;
    ISafe internal guardianSafe;
    EndgameConfig internal c;
    EndgameDeployment internal d;
    address internal buyer = makeAddr("rehearsalBuyer");
    address internal seller = makeAddr("rehearsalSeller");

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        ownerSafe = _safe("owner", 5, 3, ownerKeys);
        guardianSafe = _safe("guardian", 3, 2, guardianKeys);

        c.usdc = address(USDC);
        c.minDelay = 24 hours;
        c.ownerSafe = address(ownerSafe);
        c.guardianSafe = address(guardianSafe);
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
        EndgameCheck.deployed(d, c, address(this));

        (address[] memory t, uint256[] memory v, bytes[] memory p) = EndgameDeploy.firstSettings(d, c);
        _exec(
            ownerSafe,
            ownerKeys,
            3,
            address(d.timelock),
            abi.encodeCall(TimelockController.scheduleBatch, (t, v, p, bytes32(0), EndgameDeploy.SALT, c.minDelay))
        );
        vm.warp(block.timestamp + c.minDelay);
        _exec(
            ownerSafe,
            ownerKeys,
            3,
            address(d.timelock),
            abi.encodeCall(TimelockController.executeBatch, (t, v, p, bytes32(0), EndgameDeploy.SALT))
        );
        EndgameCheck.configured(d, c);

        vm.deal(buyer, 2_000 ether);
        vm.prank(buyer);
        USDC.approve(address(d.agreement), type(uint256).max);
    }

    function test_the_safes_are_as_created() public view {
        assertEq(ownerSafe.getThreshold(), 3);
        assertEq(ownerSafe.getOwners().length, 5);
        assertEq(guardianSafe.getThreshold(), 2);
        assertEq(guardianSafe.getOwners().length, 3);
        assertEq(d.hub.owner(), address(d.timelock));
    }

    /// The per-deal cap counts the buyer's half of the fee, so the 1,005 USDC
    /// cap is what lets a 1,000 USDC deal open, and nothing larger.
    function test_a_deal_settles_on_arc_usdc_within_the_beta_cap() public {
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.OverCap.selector);
        d.agreement.fund(bytes32("too-big"), _terms(1_001e6));

        AgreementTerms memory t = _terms(1_000e6);
        vm.prank(buyer);
        bytes32 id = d.agreement.fund(bytes32("rehearsal"), t);
        bytes32 h = d.agreement.termsHashOf(t);
        vm.prank(seller);
        d.agreement.accept(id, h);
        vm.prank(seller);
        d.agreement.markDelivered(id, keccak256("delivered"));
        vm.prank(buyer);
        d.agreement.release(id);
        assertEq(USDC.balanceOf(seller), 995e6);
        assertEq(USDC.balanceOf(c.feeRecipient), 10e6);
        assertEq(USDC.balanceOf(address(d.agreement)), 0);
    }

    function test_the_guardian_safe_pauses_a_family_and_cancels_an_ordinary_change() public {
        _exec(guardianSafe, guardianKeys, 2, address(d.hub), abi.encodeCall(KarwanHub.pauseFamily, (address(d.agreement))));
        (,,, bool paused,) = d.hub.families(address(d.agreement));
        assertTrue(paused);
        vm.prank(buyer);
        vm.expectRevert();
        d.agreement.fund(bytes32("paused"), _terms(100e6));

        bytes memory raise = abi.encodeCall(KarwanHub.setCaps, (address(d.agreement), c.usdc, 2_000e6, 20_000e6));
        _exec(
            ownerSafe,
            ownerKeys,
            3,
            address(d.timelock),
            abi.encodeCall(TimelockController.schedule, (address(d.hub), 0, raise, bytes32(0), bytes32("raise"), c.minDelay))
        );
        bytes32 op = d.timelock.hashOperation(address(d.hub), 0, raise, bytes32(0), bytes32("raise"));
        assertTrue(d.timelock.isOperationPending(op));
        _exec(guardianSafe, guardianKeys, 2, address(d.timelock), abi.encodeCall(TimelockController.cancel, (op)));
        assertFalse(d.timelock.isOperation(op));
    }

    function _terms(uint128 amount) internal view returns (AgreementTerms memory t) {
        t.asset = address(USDC);
        t.seller = seller;
        t.amount = amount;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.silentLongstop = 5 days;
        t.agreementHash = keccak256("rehearsal");
    }

    function _safe(string memory name, uint256 n, uint256 threshold, uint256[] storage keys) internal returns (ISafe) {
        address[] memory owners = new address[](n);
        for (uint256 i; i < n; ++i) {
            (address a, uint256 k) = makeAddrAndKey(string.concat(name, vm.toString(i)));
            owners[i] = a;
            keys.push(k);
        }
        bytes memory init = abi.encodeCall(
            ISafe.setup, (owners, threshold, address(0), "", HANDLER, address(0), 0, payable(address(0)))
        );
        return ISafe(FACTORY.createProxyWithNonce(SAFE_L2, init, uint256(keccak256(bytes(name)))));
    }

    /// Signs with the first `m` keys, ordered by owner address as Safe requires.
    function _exec(ISafe safe, uint256[] storage keys, uint256 m, address to, bytes memory data) internal {
        uint256[] memory signers = new uint256[](m);
        for (uint256 i; i < m; ++i) signers[i] = keys[i];
        for (uint256 i; i < m; ++i) {
            for (uint256 j = i + 1; j < m; ++j) {
                if (vm.addr(signers[j]) < vm.addr(signers[i])) (signers[i], signers[j]) = (signers[j], signers[i]);
            }
        }
        bytes32 h = safe.getTransactionHash(to, 0, data, 0, 0, 0, 0, address(0), address(0), safe.nonce());
        bytes memory sigs;
        for (uint256 i; i < m; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signers[i], h);
            sigs = abi.encodePacked(sigs, r, s, v);
        }
        assertTrue(safe.execTransaction(to, 0, data, 0, 0, 0, 0, address(0), payable(address(0)), sigs));
    }
}
