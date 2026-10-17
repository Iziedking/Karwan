// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./agreement/AgreementFixture.sol";
import {AgreementTerms} from "../../src/suite/agreement/AgreementTypes.sol";
import {KarwanTradeFinance} from "../../src/suite/KarwanTradeFinance.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {SettlementLib} from "../../src/suite/settlement/SettlementLib.sol";

/// @notice Purchase-order financing and factoring against an Agreement deal:
///         the advance, the assignment and the stake happen together, the
///         financier is repaid first, and a shortfall comes out of the stake.
contract TradeFinanceTest is AgreementFixture {
    KarwanTradeFinance internal tf;
    address internal financier = makeAddr("financier");
    uint256 internal constant NET = PRICE - 0.5e6;

    function setUp() public {
        _deployAgreement();
        tf = new KarwanTradeFinance(address(hub));
        hub.registerFamily(address(tf), 0);
        usdc.mint(financier, 1_000e6);
        vm.prank(financier);
        usdc.approve(address(tf), type(uint256).max);
        usdc.mint(seller, 1_000e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), 50e6);
        vm.stopPrank();
    }

    function _expiresAt(bytes32 id) internal view returns (uint64) {
        return escrow.accountOf(id).horizon + 180 days + 30 days;
    }

    function _signed(bytes32 id, address to, uint128 advance, uint128 repay, uint128 stake)
        internal
        view
        returns (KarwanTradeFinance.Signed memory assign, KarwanTradeFinance.StakeSig memory reserve)
    {
        return _signedN(id, to, advance, repay, stake, 7);
    }

    function _signedN(bytes32 id, address to, uint128 advance, uint128 repay, uint128 stake, uint256 nonce)
        internal
        view
        returns (KarwanTradeFinance.Signed memory assign, KarwanTradeFinance.StakeSig memory reserve)
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 a = escrow.assignDigest(id, seller, to, repay, address(tf), nonce, deadline);
        assign = KarwanTradeFinance.Signed(nonce, deadline, _sig(sellerKey, a));
        bytes32 lineId = tf.lineIdFor(address(escrow), id, to, advance, repay, stake);
        bytes32 r = vault.reserveDigest(address(tf), lineId, address(usdc), stake, to, _expiresAt(id), deadline);
        reserve = KarwanTradeFinance.StakeSig(deadline, _sig(sellerKey, r));
    }

    function _open(bytes32 id, uint128 advance, uint128 repay, uint128 stake) internal returns (bytes32 lineId) {
        return _openN(id, advance, repay, stake, 7);
    }

    function _openN(bytes32 id, uint128 advance, uint128 repay, uint128 stake, uint256 nonce)
        internal
        returns (bytes32 lineId)
    {
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) =
            _signedN(id, financier, advance, repay, stake, nonce);
        uint64 expiresAt = _expiresAt(id);
        vm.prank(financier);
        lineId = tf.open(address(escrow), id, advance, repay, stake, expiresAt, a, r);
    }

    function test_a_line_pays_the_advance_assigns_the_repayment_and_reserves_stake_at_once() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        uint256 sellerBefore = usdc.balanceOf(seller);
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        assertEq(usdc.balanceOf(seller), sellerBefore + 50e6);
        (address assignee, uint128 amount,) = escrow.assignmentOf(id, seller);
        assertEq(assignee, financier);
        assertEq(amount, 60e6);
        KarwanStakeVault.Reservation memory res = vault.reservationOf(address(tf), lineId);
        assertTrue(res.active);
        assertEq(res.amount, 10e6);
        assertEq(res.beneficiary, financier);
        assertEq(usdc.balanceOf(address(tf)), 0);
    }

    function test_a_revoked_escrow_cannot_be_financed() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        uint64 expiresAt = _expiresAt(id);
        hub.revokeFamily(address(escrow));
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.NotFamily.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, expiresAt, a, r);
        assertEq(usdc.balanceOf(seller), sellerBefore);
    }

    function test_a_line_opens_once_on_the_same_terms() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        uint64 expiresAt = _expiresAt(id);
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.LineExists.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, expiresAt, a, r);
        assertEq(usdc.balanceOf(seller), sellerBefore);
        assertEq(tf.lineOf(lineId).state, 1);
    }

    function test_an_unaccepted_deal_cannot_be_financed() public {
        bytes32 id = _fund(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        uint64 expiresAt = _expiresAt(id);
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.NotFinanceable.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, expiresAt, a, r);
    }

    function test_an_unfinished_plan_cannot_be_financed() public {
        AgreementTerms memory t = _terms();
        t.parts = 4;
        t.partEvery = 7 days;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        bytes32 id = _fundAccepted(t, bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        uint64 expiresAt = _expiresAt(id);
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.NotFinanceable.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, expiresAt, a, r);
    }

    function test_the_repayment_must_fit_what_the_seller_is_still_owed() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        uint128 tooMuch = uint128(NET) + 1;
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, tooMuch, 10e6);
        uint64 expiresAt = _expiresAt(id);
        vm.startPrank(financier);
        vm.expectRevert(KarwanTradeFinance.BadTerms.selector);
        tf.open(address(escrow), id, 50e6, tooMuch, 10e6, expiresAt, a, r);
        vm.expectRevert(KarwanTradeFinance.BadTerms.selector);
        tf.open(address(escrow), id, 70e6, 60e6, 10e6, expiresAt, a, r);
        vm.stopPrank();
    }

    function test_stake_below_ten_percent_of_the_advance_is_refused() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 4.9e6);
        uint64 expiresAt = _expiresAt(id);
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.StakeTooLow.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 4.9e6, expiresAt, a, r);
    }

    function test_the_stake_must_outlast_the_deal() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        uint64 short = escrow.accountOf(id).horizon + 180 days;
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.BadTerms.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, short, a, r);
    }

    function test_another_financier_cannot_use_the_sellers_signatures() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        address rival = makeAddr("rival");
        usdc.mint(rival, 100e6);
        uint64 expiresAt = _expiresAt(id);
        vm.startPrank(rival);
        usdc.approve(address(tf), type(uint256).max);
        vm.expectRevert(SettlementLib.BadSignature.selector);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, expiresAt, a, r);
        vm.stopPrank();
    }

    function test_the_sellers_signature_binds_the_advance() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a, KarwanTradeFinance.StakeSig memory r) = _signed(id, financier, 50e6, 60e6, 10e6);
        uint64 expiresAt = _expiresAt(id);
        vm.prank(financier);
        vm.expectRevert(KarwanStakeVault.BadSignature.selector);
        tf.open(address(escrow), id, 5e6, 60e6, 10e6, expiresAt, a, r);
    }

    function test_a_completed_deal_repays_the_financier_first_and_frees_the_stake() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        uint256 financierBefore = usdc.balanceOf(financier);
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(financier), financierBefore + 60e6);
        assertEq(usdc.balanceOf(seller), sellerBefore + NET - 60e6);
        vm.prank(stranger);
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 2);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }

    function test_a_line_settles_only_after_the_deal_ends() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        vm.expectRevert(KarwanTradeFinance.StillLive.selector);
        tf.settle(lineId);
    }

    function test_a_refunded_order_defaults_and_the_stake_covers_the_financier() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        uint256 financierBefore = usdc.balanceOf(financier);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        escrow.reclaim(id);
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 3);
        assertEq(usdc.balanceOf(financier), financierBefore + 10e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 40e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).reserved, 0);
    }

    function test_a_split_takes_only_the_shortfall_from_the_stake() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        uint256 financierBefore = usdc.balanceOf(financier);
        vm.prank(buyer);
        escrow.proposeSplit(id, 6_000);
        vm.prank(seller);
        escrow.acceptSplit(id, 6_000);
        uint256 viaEscrow = (NET * 6_000) / 10_000;
        tf.settle(lineId);
        assertEq(usdc.balanceOf(financier), financierBefore + 60e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 50e6 - (60e6 - viaEscrow));
    }

    function test_the_financier_alone_waives_the_stake() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        vm.prank(stranger);
        vm.expectRevert(KarwanTradeFinance.NotFinancier.selector);
        tf.waive(lineId);
        vm.prank(financier);
        tf.waive(lineId);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
        vm.expectRevert(KarwanTradeFinance.NotOpen.selector);
        tf.settle(lineId);
    }

    function test_a_repaid_line_cannot_be_waived() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        vm.prank(buyer);
        escrow.release(id);
        tf.settle(lineId);
        vm.prank(financier);
        vm.expectRevert(KarwanTradeFinance.NotOpen.selector);
        tf.waive(lineId);
        assertEq(tf.lineOf(lineId).state, 2);
    }

    function test_a_waived_line_keeps_no_stake() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        vm.prank(financier);
        tf.waive(lineId);
        vm.expectRevert(KarwanTradeFinance.NotOpen.selector);
        tf.keepStake(lineId);
        assertFalse(vault.reservationOf(address(tf), lineId).active);
    }

    function test_the_stake_follows_a_later_deal_horizon() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        uint64 before = vault.reservationOf(address(tf), lineId).expiresAt;
        vm.prank(buyer);
        escrow.extendDeadline(id, t.deliveryDeadline + 60 days);
        tf.keepStake(lineId);
        assertGt(vault.reservationOf(address(tf), lineId).expiresAt, before);
    }

    function test_a_revoked_trade_finance_contract_lets_anyone_free_its_stakes() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        hub.revokeFamily(address(tf));
        vm.prank(stranger);
        vault.releaseStale(address(tf), lineId);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }

    function test_a_blocked_financier_is_still_repaid_through_an_owed_balance() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        usdc.setBlocked(financier, true);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.owed(address(usdc), financier), 60e6);
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 2);
    }

    function test_a_financier_who_gave_up_the_assignment_cannot_slash_the_stake() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 40e6);
        vm.prank(financier);
        escrow.releaseAssignment(id, seller);
        vm.prank(buyer);
        escrow.release(id);
        uint256 financierBefore = usdc.balanceOf(financier);
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 4);
        assertEq(usdc.balanceOf(financier), financierBefore);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }

    function test_the_sellers_assignment_cannot_be_used_outside_trade_finance() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        (KarwanTradeFinance.Signed memory a,) = _signed(id, financier, 50e6, 60e6, 10e6);
        vm.prank(financier);
        vm.expectRevert(SettlementLib.BadSignature.selector);
        escrow.assignPayout(id, seller, financier, 60e6, a.nonce, a.deadline, a.sig);
    }

    function test_a_new_line_on_the_same_deal_waives_the_line_it_replaced() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 first = _open(id, 50e6, 60e6, 10e6);
        vm.prank(financier);
        escrow.releaseAssignment(id, seller);
        bytes32 second = _openN(id, 20e6, 25e6, 5e6, 8);
        assertEq(tf.lineOf(first).state, 4);
        assertFalse(vault.reservationOf(address(tf), first).active);
        vm.prank(buyer);
        escrow.release(id);
        tf.settle(second);
        assertEq(tf.lineOf(second).state, 2);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }

    function test_a_reassignment_outside_trade_finance_waives_the_line() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        vm.prank(financier);
        escrow.releaseAssignment(id, seller);
        vm.prank(seller);
        escrow.assignPayout(id, seller, financier, 25e6, 0, 0, "");
        vm.prank(buyer);
        escrow.release(id);
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 4);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }

    function test_a_default_still_settles_after_the_stake_was_freed() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        uint64 expiresAt = vault.reservationOf(address(tf), lineId).expiresAt;
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        escrow.reclaim(id);
        vm.warp(uint256(expiresAt) + 1);
        vm.prank(stranger);
        vault.releaseStale(address(tf), lineId);
        uint256 financierBefore = usdc.balanceOf(financier);
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 3);
        assertEq(usdc.balanceOf(financier), financierBefore);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }

    function test_a_default_still_settles_after_trade_finance_was_revoked() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("f"));
        bytes32 lineId = _open(id, 50e6, 60e6, 10e6);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        escrow.reclaim(id);
        hub.revokeFamily(address(tf));
        tf.settle(lineId);
        assertEq(tf.lineOf(lineId).state, 3);
        assertEq(vault.freeOf(sellerId, address(usdc)), 50e6);
    }
}
