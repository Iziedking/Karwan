// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {Wallet1271} from "./mocks/Wallet1271.sol";
import {TestFamily} from "./mocks/TestFamily.sol";

contract SettlementAssignmentTest is SuiteFixture {
    address internal buyer;
    address internal seller;
    uint256 internal sellerKey;
    address internal financier = makeAddr("financier");
    bytes32 internal constant DEAL = bytes32("deal-a");

    function setUp() public {
        _deploySuite();
        (buyer,,) = _person("buyer");
        (seller, sellerKey,) = _person("seller");
        _funded(buyer, 10_000e6);
    }

    function _open(address payee) internal {
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), _one(payee), uint64(block.timestamp + 30 days));
        family.fund(DEAL, 100e6);
        vm.stopPrank();
    }

    function _signedAssign(address payee, uint256 key, uint128 amount) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = family.assignDigest(DEAL, payee, financier, amount, 1, deadline);
        bytes memory s = _sig(key, d);
        vm.prank(financier);
        family.assignPayout(DEAL, payee, financier, amount, 1, deadline, s);
    }

    function test_payee_assigns_directly_and_the_assignee_is_paid_first() public {
        _open(seller);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 70e6, 0, 0, "");
        family.pay(DEAL, seller, 50e6);
        family.pay(DEAL, seller, 50e6);
        assertEq(usdc.balanceOf(financier), 70e6);
        assertEq(usdc.balanceOf(seller), 30e6);
    }

    function test_assignment_by_eoa_signature() public {
        _open(seller);
        _signedAssign(seller, sellerKey, 40e6);
        family.pay(DEAL, seller, 100e6);
        assertEq(usdc.balanceOf(financier), 40e6);
        assertEq(usdc.balanceOf(seller), 60e6);
    }

    function test_assignment_by_smart_wallet_signature() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("walletOwner");
        Wallet1271 w = new Wallet1271(owner);
        _open(address(w));
        _signedAssign(address(w), ownerKey, 40e6);
        family.pay(DEAL, address(w), 100e6);
        assertEq(usdc.balanceOf(financier), 40e6);
    }

    function test_assignment_signed_by_delegated_eoa() public {
        (address d7702, uint256 k) = makeAddrAndKey("delegated");
        vm.etch(d7702, abi.encodePacked(hex"ef0100", address(0xBEEF)));
        _open(d7702);
        _signedAssign(d7702, k, 40e6);
        (address assignee,,) = family.assignmentOf(DEAL, d7702);
        assertEq(assignee, financier);
    }

    function test_nobody_else_can_assign_a_payees_money() public {
        _open(seller);
        (, uint256 strangerKey) = makeAddrAndKey("stranger");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = family.assignDigest(DEAL, seller, financier, 100e6, 1, deadline);
        bytes memory s = _sig(strangerKey, d);
        vm.expectRevert(KarwanSettlementBase.BadSignature.selector);
        family.assignPayout(DEAL, seller, financier, 100e6, 1, deadline, s);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.assignPayout(DEAL, buyer, financier, 100e6, 0, 0, "");
    }

    function test_signature_for_one_family_fails_on_another() public {
        TestFamily other = new TestFamily(address(hub));
        hub.registerFamily(address(other), FEE_BPS);
        hub.setCaps(address(other), address(usdc), PER_DEAL, TOTAL);
        _open(seller);
        vm.prank(buyer);
        other.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory s = _sig(sellerKey, family.assignDigest(DEAL, seller, financier, 10e6, 1, deadline));
        vm.expectRevert(KarwanSettlementBase.BadSignature.selector);
        other.assignPayout(DEAL, seller, financier, 10e6, 1, deadline, s);
        family.assignPayout(DEAL, seller, financier, 10e6, 1, deadline, s);
    }

    function test_signature_is_single_use_and_expires() public {
        _open(seller);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = family.assignDigest(DEAL, seller, financier, 10e6, 7, deadline);
        bytes memory s = _sig(sellerKey, d);
        family.assignPayout(DEAL, seller, financier, 10e6, 7, deadline, s);
        vm.prank(financier);
        family.releaseAssignment(DEAL, seller);
        vm.expectRevert(KarwanSettlementBase.NonceUsed.selector);
        family.assignPayout(DEAL, seller, financier, 10e6, 7, deadline, s);

        uint256 soon = block.timestamp + 10;
        bytes32 d2 = family.assignDigest(DEAL, seller, financier, 10e6, 8, soon);
        bytes memory s2 = _sig(sellerKey, d2);
        vm.warp(soon + 1);
        vm.expectRevert(KarwanSettlementBase.Expired.selector);
        family.assignPayout(DEAL, seller, financier, 10e6, 8, soon, s2);
    }

    function test_payee_cancels_a_signature_before_it_is_used() public {
        _open(seller);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = family.assignDigest(DEAL, seller, financier, 10e6, 3, deadline);
        bytes memory s = _sig(sellerKey, d);
        vm.prank(seller);
        family.cancelNonce(3);
        vm.prank(financier);
        vm.expectRevert(KarwanSettlementBase.NonceUsed.selector);
        family.assignPayout(DEAL, seller, financier, 10e6, 3, deadline, s);
    }

    function test_signatures_for_different_deals_work_in_any_order() public {
        _open(seller);
        bytes32 other = bytes32("deal-b");
        vm.startPrank(buyer);
        family.open(other, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        vm.stopPrank();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sa = _sig(sellerKey, family.assignDigest(DEAL, seller, financier, 10e6, 1, deadline));
        bytes memory sb = _sig(sellerKey, family.assignDigest(other, seller, financier, 10e6, 2, deadline));
        family.assignPayout(other, seller, financier, 10e6, 2, deadline, sb);
        family.assignPayout(DEAL, seller, financier, 10e6, 1, deadline, sa);
    }

    function test_the_family_itself_is_never_an_assignee() public {
        _open(seller);
        vm.prank(seller);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.assignPayout(DEAL, seller, address(family), 10e6, 0, 0, "");
    }

    function test_one_assignment_at_a_time_until_released() public {
        _open(seller);
        vm.startPrank(seller);
        family.assignPayout(DEAL, seller, financier, 10e6, 0, 0, "");
        vm.expectRevert(KarwanSettlementBase.Assigned.selector);
        family.assignPayout(DEAL, seller, makeAddr("other"), 10e6, 0, 0, "");
        vm.stopPrank();
        vm.prank(seller);
        vm.expectRevert(KarwanSettlementBase.NotAssignee.selector);
        family.releaseAssignment(DEAL, seller);
        vm.prank(financier);
        family.releaseAssignment(DEAL, seller);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, makeAddr("other"), 10e6, 0, 0, "");
    }

    function test_blocked_payee_with_assignment() public {
        _open(seller);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 30e6, 0, 0, "");
        usdc.setBlocked(seller, true);
        family.pay(DEAL, seller, 100e6);
        assertEq(usdc.balanceOf(financier), 30e6);
        assertEq(family.owed(address(usdc), seller), 70e6);
        assertEq(family.owed(address(usdc), financier), 0);
    }

    function test_blocked_assignee_is_owed_and_the_payee_still_paid() public {
        _open(seller);
        vm.prank(seller);
        family.assignPayout(DEAL, seller, financier, 30e6, 0, 0, "");
        usdc.setBlocked(financier, true);
        family.pay(DEAL, seller, 100e6);
        assertEq(family.owed(address(usdc), financier), 30e6);
        assertEq(usdc.balanceOf(seller), 70e6);
    }

    function test_no_assignment_on_a_closed_deal() public {
        _open(seller);
        family.pay(DEAL, buyer, 100e6);
        family.close(DEAL);
        vm.prank(seller);
        vm.expectRevert(KarwanSettlementBase.Closed.selector);
        family.assignPayout(DEAL, seller, financier, 10e6, 0, 0, "");
    }
}
