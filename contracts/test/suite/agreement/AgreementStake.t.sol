// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementCommon} from "../../../src/suite/agreement/AgreementCommon.sol";
import {AgreementTermsLib} from "../../../src/suite/agreement/AgreementTermsLib.sol";
import {KarwanStakeVault} from "../../../src/suite/KarwanStakeVault.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";

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
}
