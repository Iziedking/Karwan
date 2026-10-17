// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementCommon} from "../../../src/suite/agreement/AgreementCommon.sol";
import {AgreementTermsLib} from "../../../src/suite/agreement/AgreementTermsLib.sol";
import {KarwanStakeVault} from "../../../src/suite/KarwanStakeVault.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";
import {AgreementRefusingVault} from "../mocks/AgreementRefusingVault.sol";

/// @notice An optional seller stake behind an Agreement deal, for the buyer:
///         reserved at acceptance, slashed only by a ruling for the buyer, in
///         proportion to the buyer's share of the tranche, freed otherwise.
contract AgreementStakeTest is AgreementFixture {
    uint128 internal constant STAKE = 20e6;
    uint256 internal constant NET = PRICE - 0.5e6;

    function setUp() public {
        _deployAgreement();
        usdc.mint(seller, 1_000e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), 50e6);
        vm.stopPrank();
    }

    function _staked() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.sellerStake = STAKE;
    }

    function _acceptWithStake(bytes32 id, AgreementTerms memory t) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint64 expiresAt = escrow.accountOf(id).horizon + 180 days + 30 days;
        bytes32 d = vault.reserveDigest(address(escrow), id, address(usdc), STAKE, buyer, expiresAt, deadline);
        bytes32 h = escrow.termsHashOf(t);
        bytes memory sig = _sig(sellerKey, d);
        vm.prank(seller);
        escrow.acceptWithStake(id, h, deadline, sig);
    }

    function _stakedDeal(AgreementTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        id = _fund(t, salt);
        _acceptWithStake(id, t);
    }

    function _freeStake() internal view returns (uint256) {
        return vault.freeOf(sellerId, address(usdc));
    }

    function test_acceptance_reserves_the_sellers_stake_for_the_buyer() public {
        AgreementTerms memory t = _staked();
        bytes32 id = _fund(t, bytes32("s"));
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.StakeNeeded.selector);
        escrow.accept(id, h);
        _acceptWithStake(id, t);
        KarwanStakeVault.Reservation memory r = vault.reservationOf(address(escrow), id);
        assertEq(r.amount, STAKE);
        assertEq(r.beneficiary, buyer);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
    }

    function test_a_stake_above_the_price_is_refused() public {
        AgreementTerms memory t = _terms();
        t.sellerStake = PRICE + 1;
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("s"), t);
    }

    function test_an_agent_cannot_put_up_the_sellers_stake() public {
        (address agent, uint256 agentKey) = makeAddrAndKey("sellerAgent");
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 bindDeadline = block.timestamp + 1 hours;
        bytes32 bd = identity.bindDigest(sellerId, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 1e6, 1e6, bindDeadline);
        bytes memory bs = _sig(agentKey, bd);
        vm.prank(seller);
        identity.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 1e6, 1e6, bindDeadline, bs);
        AgreementTerms memory t = _staked();
        t.seller = agent;
        bytes32 id = _fund(t, bytes32("s"));
        uint256 deadline = block.timestamp + 1 hours;
        uint64 expiresAt = escrow.accountOf(id).horizon + 180 days + 30 days;
        bytes32 d = vault.reserveDigest(address(escrow), id, address(usdc), STAKE, buyer, expiresAt, deadline);
        bytes memory sig = _sig(agentKey, d);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(agent);
        vm.expectRevert(KarwanStakeVault.NotPerson.selector);
        escrow.acceptWithStake(id, h, deadline, sig);
    }

    function test_a_ruling_for_the_buyer_slashes_the_buyers_share() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(reviewSafe);
        escrow.rule(id, 2_500, bytes32(0));
        uint256 toBuyer = (NET - (NET * 2_500) / 10_000) + (1e6 - (1e6 * 2_500) / 10_000);
        assertEq(usdc.balanceOf(buyer), before + toBuyer + 15e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 35e6);
        assertEq(_freeStake(), 35e6);
    }

    function test_a_ruling_on_one_of_two_tranches_slashes_that_tranches_share() public {
        AgreementTerms memory t = _staked();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        bytes32 id = _stakedDeal(t, bytes32("s"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        escrow.rule(id, 0, bytes32(0));
        assertEq(vault.reservationOf(address(escrow), id).amount, 10e6);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(_freeStake(), 40e6);
        assertFalse(vault.reservationOf(address(escrow), id).active);
    }

    function test_a_ruling_for_the_seller_slashes_nothing() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        escrow.rule(id, 10_000, bytes32(0));
        assertEq(_freeStake(), 50e6);
    }

    function test_completion_frees_the_stake() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        vm.prank(buyer);
        escrow.release(id);
        assertEq(_freeStake(), 50e6);
    }

    function test_a_refund_at_the_deadline_frees_the_stake() public {
        AgreementTerms memory t = _staked();
        bytes32 id = _stakedDeal(t, bytes32("s"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        escrow.reclaim(id);
        assertEq(_freeStake(), 50e6);
    }

    function test_an_agreed_split_frees_the_stake() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 3_000);
        vm.prank(seller);
        escrow.acceptSplit(id, 3_000);
        assertEq(_freeStake(), 50e6);
    }

    function test_the_longstop_frees_the_stake() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        vm.warp(uint256(escrow.accountOf(id).horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = NET;
        vm.prank(seniorSafe);
        escrow.longstopSplit(id, PRICE + 0.5e6 - NET, toPayees);
        assertEq(_freeStake(), 50e6);
    }

    function test_a_vault_that_refuses_never_blocks_the_ruling() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        hub.revokeFamily(address(escrow));
        vm.expectEmit(address(escrow));
        emit AgreementCommon.StakeHookFailed(id, AgreementCommon.STAKE_SLASH);
        vm.prank(reviewSafe);
        escrow.rule(id, 0, bytes32(0));
        assertEq(uint8(_state(id)), uint8(AgreementState.Ruled));
    }

    function test_the_stake_follows_a_later_deal_horizon_on_its_own() public {
        AgreementTerms memory t = _staked();
        bytes32 id = _stakedDeal(t, bytes32("s"));
        uint64 before = vault.reservationOf(address(escrow), id).expiresAt;
        vm.prank(buyer);
        escrow.extendDeadline(id, t.deliveryDeadline + 60 days);
        uint64 kept = vault.reservationOf(address(escrow), id).expiresAt;
        assertGt(kept, before);
        assertEq(kept, escrow.accountOf(id).horizon + 180 days + 30 days);
    }

    function test_the_stake_outlasts_the_horizon_through_delivery_and_a_dispute() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        uint64 accepted = escrow.accountOf(id).horizon;
        _deliver(id);
        uint64 delivered = escrow.accountOf(id).horizon;
        assertGt(delivered, accepted);
        assertEq(vault.reservationOf(address(escrow), id).expiresAt, delivered + 180 days + 30 days);
        vm.prank(buyer);
        escrow.dispute(id, bytes32("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);
        assertGe(vault.reservationOf(address(escrow), id).expiresAt, escrow.accountOf(id).horizon + 180 days + 30 days);
    }

    function test_a_lapsed_reservation_never_blocks_a_later_deadline() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        uint64 lapsed = vault.reservationOf(address(escrow), id).expiresAt;
        vm.warp(uint256(lapsed) + 1);
        uint64 later = lapsed + 10 days;
        vm.expectEmit(address(escrow));
        emit AgreementCommon.StakeHookFailed(id, AgreementCommon.STAKE_KEEP);
        vm.prank(buyer);
        escrow.extendDeadline(id, later);
        assertEq(_deal(id).deadline, later);
        assertEq(vault.reservationOf(address(escrow), id).expiresAt, lapsed);
    }

    function test_accepting_with_a_stake_needs_terms_that_ask_for_one() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fund(t, bytes32("u"));
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.acceptWithStake(id, h, block.timestamp + 1 hours, "");
        assertEq(uint8(_state(id)), uint8(AgreementState.Funded));
    }

    function test_keeping_a_stake_needs_a_staked_deal() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("u"));
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.keepStake(id);
    }

    function test_keeping_a_stake_waits_for_the_sellers_acceptance() public {
        bytes32 id = _fund(_staked(), bytes32("s"));
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.keepStake(id);
    }

    function test_keeping_a_stake_ends_with_the_deal() public {
        bytes32 id = _stakedDeal(_staked(), bytes32("s"));
        vm.prank(buyer);
        escrow.release(id);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.keepStake(id);
    }
}

/// @notice The same staked deals against a vault that fails the escrow's
///         calls: every exit and every deadline move still goes through.
contract AgreementStakeRefusingVaultTest is AgreementFixture {
    AgreementRefusingVault internal refusing;

    function setUp() public {
        _deployAgreement();
    }

    function _deploySuite() internal override {
        hub = new KarwanHub(address(this));
        identity = new KarwanIdentityRegistry(address(hub));
        record = new KarwanRecord(address(hub));
        refusing = new AgreementRefusingVault();
        hub.wire(address(identity), address(record), address(refusing));
        usdc = new BlocklistToken(6);
        hub.setFeeRecipient(feeSafe);
        hub.setGuardian(guardian);
        hub.setReviewers(reviewSafe, seniorSafe);
        hub.setAutoArbiter(arbiter);
        hub.setAsset(address(usdc), true, 5_000e6);
    }

    function _stakedDeal() internal returns (bytes32 id, AgreementTerms memory t) {
        t = _terms();
        t.sellerStake = 20e6;
        id = _fund(t, bytes32("v"));
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.acceptWithStake(id, h, block.timestamp + 1 hours, "");
    }

    function test_a_vault_that_refuses_to_free_the_stake_never_blocks_completion() public {
        (bytes32 id,) = _stakedDeal();
        refusing.setRefusals(true, false);
        vm.expectEmit(address(escrow));
        emit AgreementCommon.StakeHookFailed(id, AgreementCommon.STAKE_RELEASE);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
    }

    function test_a_vault_that_cannot_report_the_expiry_never_blocks_a_later_deadline() public {
        (bytes32 id, AgreementTerms memory t) = _stakedDeal();
        refusing.setRefusals(false, true);
        uint64 later = t.deliveryDeadline + 5 days;
        vm.expectEmit(address(escrow));
        emit AgreementCommon.StakeHookFailed(id, AgreementCommon.STAKE_KEEP);
        vm.prank(buyer);
        escrow.extendDeadline(id, later);
        assertEq(_deal(id).deadline, later);
    }
}
