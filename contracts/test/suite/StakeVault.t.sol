// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {TestFamily} from "./mocks/TestFamily.sol";
import {BlocklistToken, SkimToken} from "./mocks/BlocklistToken.sol";

contract StakeVaultTest is SuiteFixture {
    address internal seller;
    uint256 internal sellerKey;
    uint64 internal sellerId;
    address internal buyer;
    address internal stranger = makeAddr("stranger");
    bytes32 internal constant REF = bytes32("deal-1");

    function setUp() public {
        _deploySuite();
        (seller, sellerKey, sellerId) = _person("seller");
        (buyer,,) = _person("buyer");
        usdc.mint(seller, 1_000e6);
        vm.prank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(seller);
        vault.stake(address(usdc), 100e6);
    }

    function _expiry() internal view returns (uint64) {
        return uint64(block.timestamp + 90 days);
    }

    function _sigFor(uint256 key, address fam, bytes32 ref, uint128 amount, uint64 expiresAt, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sig(key, vault.reserveDigest(fam, ref, address(usdc), amount, buyer, expiresAt, deadline));
    }

    function _reserve(bytes32 ref, uint128 amount) internal {
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigFor(sellerKey, address(family), ref, amount, expiresAt, deadline);
        vm.prank(address(family));
        vault.reserve(ref, seller, address(usdc), amount, buyer, expiresAt, deadline, sig);
    }

    // ------------------------------- Staking ------------------------------

    function test_a_person_stakes_and_strangers_or_agents_cannot() public {
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 100e6);
        usdc.mint(stranger, 10e6);
        vm.startPrank(stranger);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert(KarwanStakeVault.NotPerson.selector);
        vault.stake(address(usdc), 10e6);
        vm.stopPrank();
        (address agent, uint256 agentKey) = makeAddrAndKey("sellerAgent");
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(sellerId, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 10e6, 10e6, deadline);
        bytes memory s = _sig(agentKey, d);
        vm.prank(seller);
        identity.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 10e6, 10e6, deadline, s);
        usdc.mint(agent, 10e6);
        vm.startPrank(agent);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert(KarwanStakeVault.NotPerson.selector);
        vault.stake(address(usdc), 10e6);
        vm.stopPrank();
    }

    function test_only_an_allowed_asset_is_staked() public {
        BlocklistToken other = new BlocklistToken(6);
        other.mint(seller, 10e6);
        vm.startPrank(seller);
        other.approve(address(vault), type(uint256).max);
        vm.expectRevert(KarwanStakeVault.BadAmount.selector);
        vault.stake(address(other), 10e6);
        vm.stopPrank();
    }

    function test_a_token_that_delivers_less_is_never_staked() public {
        SkimToken skim = new SkimToken();
        hub.setAsset(address(skim), true, 0);
        skim.mint(seller, 100e6);
        vm.startPrank(seller);
        skim.approve(address(vault), type(uint256).max);
        vm.expectRevert(KarwanStakeVault.BadDelivery.selector);
        vault.stake(address(skim), 100e6);
        vm.stopPrank();
        assertEq(vault.stakeOf(sellerId, address(skim)).active, 0);
    }

    function test_a_withdrawal_waits_seven_days_and_can_be_cancelled() public {
        vm.startPrank(seller);
        vault.requestWithdraw(address(usdc), 40e6);
        vm.expectRevert(KarwanStakeVault.Early.selector);
        vault.withdraw(address(usdc));
        vault.cancelWithdraw(address(usdc));
        assertEq(vault.freeOf(sellerId, address(usdc)), 100e6);
        vault.requestWithdraw(address(usdc), 40e6);
        vm.warp(vm.getBlockTimestamp() + 7 days - 1);
        vm.expectRevert(KarwanStakeVault.Early.selector);
        vault.withdraw(address(usdc));
        vm.warp(vm.getBlockTimestamp() + 1);
        uint256 before = usdc.balanceOf(seller);
        vault.withdraw(address(usdc));
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), before + 40e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 60e6);
    }

    function test_another_wallet_of_the_same_person_withdraws() public {
        (address second, uint256 secondKey) = makeAddrAndKey("sellerSecond");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(sellerId, second, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(secondKey, d);
        vm.prank(seller);
        identity.bind(second, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
        vm.prank(second);
        vault.requestWithdraw(address(usdc), 25e6);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(second);
        vault.withdraw(address(usdc));
        assertEq(usdc.balanceOf(second), 25e6);
    }

    /// A wallet taken from its owner cannot take the stake out before the
    /// owner's recovery wallet takes the identity back.
    function test_a_withdrawal_waits_as_long_as_a_recovery() public view {
        assertEq(vault.COOLDOWN(), identity.RECOVERY_DELAY());
    }

    function test_reserved_and_cooling_stake_stays_put() public {
        _reserve(REF, 60e6);
        vm.startPrank(seller);
        vm.expectRevert(KarwanStakeVault.BadAmount.selector);
        vault.requestWithdraw(address(usdc), 41e6);
        vault.requestWithdraw(address(usdc), 40e6);
        vm.stopPrank();
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigFor(sellerKey, address(family), bytes32("deal-2"), 1, expiresAt, deadline);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.NotEnoughStake.selector);
        vault.reserve(bytes32("deal-2"), seller, address(usdc), 1, buyer, expiresAt, deadline, sig);
    }

    // ----------------------------- Reservations ---------------------------

    function test_only_a_registered_family_reserves() public {
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigFor(sellerKey, stranger, REF, 10e6, expiresAt, deadline);
        vm.prank(stranger);
        vm.expectRevert(KarwanStakeVault.NotFamily.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, expiresAt, deadline, sig);
    }

    function test_a_reservation_needs_the_stakers_own_signature_on_exactly_these_terms() public {
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        (, uint256 forgerKey) = makeAddrAndKey("forger");
        bytes memory forged = _sigFor(forgerKey, address(family), REF, 10e6, expiresAt, deadline);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.BadSignature.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, expiresAt, deadline, forged);
        bytes memory forTen = _sigFor(sellerKey, address(family), REF, 10e6, expiresAt, deadline);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.BadSignature.selector);
        vault.reserve(REF, seller, address(usdc), 50e6, buyer, expiresAt, deadline, forTen);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.BadSignature.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, stranger, expiresAt, deadline, forTen);
    }

    function test_a_reservation_of_nothing_is_refused() public {
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigFor(sellerKey, address(family), REF, 0, expiresAt, deadline);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.BadAmount.selector);
        vault.reserve(REF, seller, address(usdc), 0, buyer, expiresAt, deadline, sig);
    }

    function test_a_reservation_needs_a_beneficiary() public {
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = vault.reserveDigest(address(family), REF, address(usdc), 10e6, address(0), expiresAt, deadline);
        bytes memory sig = _sig(sellerKey, d);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.BadAmount.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, address(0), expiresAt, deadline, sig);
        assertFalse(vault.reservationUsed(vault.keyOf(address(family), REF)));
    }

    function test_a_reservation_is_made_once_ever() public {
        uint64 expiresAt = _expiry();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigFor(sellerKey, address(family), REF, 10e6, expiresAt, deadline);
        vm.startPrank(address(family));
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, expiresAt, deadline, sig);
        vault.release(REF);
        vm.expectRevert(KarwanStakeVault.Used.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, expiresAt, deadline, sig);
        vm.stopPrank();
    }

    function test_a_reservation_has_a_bounded_term_and_a_signing_deadline() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint64 now_ = uint64(block.timestamp);
        bytes memory sig = _sigFor(sellerKey, address(family), REF, 10e6, now_, deadline);
        vm.startPrank(address(family));
        vm.expectRevert(KarwanStakeVault.BadTerm.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, now_, deadline, sig);
        uint64 tooLong = now_ + vault.MAX_TERM() + 1;
        vm.expectRevert(KarwanStakeVault.BadTerm.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, tooLong, deadline, sig);
        vm.stopPrank();
        uint64 expiresAt = _expiry();
        bytes memory late = _sigFor(sellerKey, address(family), REF, 10e6, expiresAt, deadline);
        vm.warp(deadline + 1);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.Expired.selector);
        vault.reserve(REF, seller, address(usdc), 10e6, buyer, expiresAt, deadline, late);
    }

    function test_only_the_reserving_family_slashes_and_only_to_the_beneficiary() public {
        _reserve(REF, 60e6);
        TestFamily other = new TestFamily(address(hub));
        hub.registerFamily(address(other), FEE_BPS);
        vm.prank(address(other));
        vm.expectRevert(KarwanStakeVault.NotActive.selector);
        vault.slash(REF, 30e6);
        vm.prank(address(family));
        vault.slash(REF, 30e6);
        assertEq(usdc.balanceOf(buyer), 30e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 70e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).reserved, 30e6);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_a_slash_never_takes_more_than_the_reservation() public {
        _reserve(REF, 60e6);
        vm.prank(address(family));
        uint256 paid = vault.slash(REF, 1_000e6);
        assertEq(paid, 60e6);
        assertEq(usdc.balanceOf(buyer), 60e6);
        assertEq(vault.stakeOf(sellerId, address(usdc)).active, 40e6);
        assertFalse(vault.reservationOf(address(family), REF).active);
    }

    function test_no_slash_after_expiry_and_anyone_frees_it_then() public {
        _reserve(REF, 60e6);
        vm.expectRevert(KarwanStakeVault.Early.selector);
        vault.releaseStale(address(family), REF);
        vm.warp(uint256(_expiry()) + 1);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.Expired.selector);
        vault.slash(REF, 10e6);
        vm.prank(stranger);
        vault.releaseStale(address(family), REF);
        assertEq(vault.freeOf(sellerId, address(usdc)), 100e6);
    }

    function test_a_revoked_family_cannot_slash_and_anyone_frees_its_reservations() public {
        _reserve(REF, 60e6);
        hub.revokeFamily(address(family));
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.NotFamily.selector);
        vault.slash(REF, 10e6);
        vm.prank(stranger);
        vault.releaseStale(address(family), REF);
        assertEq(vault.freeOf(sellerId, address(usdc)), 100e6);
    }

    function test_a_reservation_moves_later_only() public {
        _reserve(REF, 60e6);
        uint64 expiresAt = _expiry();
        vm.startPrank(address(family));
        vm.expectRevert(KarwanStakeVault.BadTerm.selector);
        vault.extend(REF, expiresAt);
        vault.extend(REF, expiresAt + 30 days);
        vm.stopPrank();
        assertEq(vault.reservationOf(address(family), REF).expiresAt, expiresAt + 30 days);
        vm.prank(stranger);
        vm.expectRevert(KarwanStakeVault.NotActive.selector);
        vault.extend(REF, expiresAt + 60 days);
    }

    function test_an_expired_reservation_cannot_be_kept() public {
        _reserve(REF, 60e6);
        uint64 expiresAt = _expiry();
        vm.warp(uint256(expiresAt) + 1);
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.Expired.selector);
        vault.extend(REF, uint64(block.timestamp + 30 days));
    }

    function test_releasing_twice_does_nothing_more() public {
        _reserve(REF, 60e6);
        vm.startPrank(address(family));
        vault.release(REF);
        vault.release(REF);
        vm.stopPrank();
        assertEq(vault.stakeOf(sellerId, address(usdc)).reserved, 0);
        assertEq(vault.freeOf(sellerId, address(usdc)), 100e6);
    }

    function test_a_slash_to_a_blocked_beneficiary_waits_for_that_address() public {
        _reserve(REF, 60e6);
        usdc.setBlocked(buyer, true);
        vm.prank(address(family));
        vault.slash(REF, 20e6);
        assertEq(vault.owed(address(usdc), buyer), 20e6);
        assertEq(usdc.balanceOf(address(vault)), 100e6);
        vm.prank(stranger);
        vm.expectRevert(KarwanStakeVault.NothingOwed.selector);
        vault.withdrawOwed(address(usdc));
        usdc.setBlocked(buyer, false);
        vm.prank(buyer);
        vault.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(buyer), 20e6);
    }
}
