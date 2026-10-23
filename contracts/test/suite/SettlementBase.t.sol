// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {DealAccount} from "../../src/suite/settlement/SettlementLib.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {SkimToken} from "./mocks/BlocklistToken.sol";
import {SettlementSenderFeeToken} from "./mocks/SettlementSenderFeeToken.sol";
import {IKarwanHub, Outcome} from "../../src/suite/interfaces/IKarwanSuite.sol";

contract SettlementBaseTest is SuiteFixture {
    address internal buyer;
    uint256 internal buyerKey;
    uint64 internal buyerId;
    address internal seller;
    uint256 internal sellerKey;
    uint64 internal sellerId;
    address internal stranger = makeAddr("stranger");
    bytes32 internal constant DEAL = bytes32("deal-1");

    function setUp() public {
        _deploySuite();
        (buyer, buyerKey, buyerId) = _person("buyer");
        (seller, sellerKey, sellerId) = _person("seller");
        _funded(buyer, 100_000e6);
    }

    function _openAndFund(uint256 amount) internal {
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        family.fund(DEAL, amount);
        vm.stopPrank();
    }

    function test_open_snapshots_fee_recipient_and_caps() public {
        _openAndFund(500e6);
        hub.setFamilyFee(address(family), 1_000);
        hub.setFeeRecipient(stranger);
        hub.setCaps(address(family), address(usdc), 10e6, 10e6);
        DealAccount memory a = family.accountOf(DEAL);
        assertEq(a.feeBps, FEE_BPS);
        assertEq(a.feeRecipient, feeSafe);
        assertEq(a.perDealCap, PER_DEAL);
        assertEq(a.seniorSafe, seniorSafe);
        assertEq(a.payerId, buyerId);
    }

    function test_open_refused_while_paused_retired_or_asset_off() public {
        vm.prank(guardian);
        hub.pauseFamily(address(family));
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        hub.resumeFamily(address(family));
        hub.setAsset(address(usdc), false, 0);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
    }

    // The hub refuses a fee above 10% itself; the mock stands in for a hub that did not.
    function test_open_refuses_a_fee_above_ten_percent_even_from_the_hub() public {
        IKarwanHub.OpeningConfig memory cfg = hub.openingConfig(address(family), address(usdc));
        bytes memory call = abi.encodeCall(IKarwanHub.openingConfig, (address(family), address(usdc)));
        cfg.feeBps = 1_001;
        vm.mockCall(address(hub), call, abi.encode(cfg));
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.FeeTooHigh.selector);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        cfg.feeBps = 1_000;
        vm.mockCall(address(hub), call, abi.encode(cfg));
        vm.prank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        assertEq(family.accountOf(DEAL).feeBps, 1_000);
    }

    function test_open_refuses_bad_parties() public {
        address[] memory nine = new address[](9);
        for (uint256 i; i < 9; ++i) nine[i] = address(uint160(0x1000 + i));
        address[] memory twice = new address[](2);
        twice[0] = seller;
        twice[1] = seller;
        uint64 h = uint64(block.timestamp + 1 days);
        vm.startPrank(buyer);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.open(DEAL, address(usdc), nine, h);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.open(DEAL, address(usdc), twice, h);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.open(DEAL, address(usdc), _one(buyer), h);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.open(DEAL, address(usdc), _one(address(0)), h);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.open(DEAL, address(usdc), _one(address(family)), h);
        vm.expectRevert(KarwanSettlementBase.BadHorizon.selector);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp));
        vm.stopPrank();
    }

    function test_horizon_is_at_most_two_years_ahead() public {
        vm.startPrank(buyer);
        vm.expectRevert(KarwanSettlementBase.BadHorizon.selector);
        family.open(DEAL, address(usdc), _one(seller), type(uint64).max);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 730 days));
        vm.stopPrank();
        vm.warp(block.timestamp + 100 days);
        vm.expectRevert(KarwanSettlementBase.BadHorizon.selector);
        family.extendHorizon(DEAL, uint64(block.timestamp + 730 days + 1));
        family.extendHorizon(DEAL, uint64(block.timestamp + 730 days));
    }

    function test_horizon_cannot_move_on_a_closed_deal() public {
        _openAndFund(10e6);
        family.pay(DEAL, buyer, 10e6);
        family.close(DEAL);
        vm.expectRevert(KarwanSettlementBase.Closed.selector);
        family.extendHorizon(DEAL, uint64(block.timestamp + 60 days));
    }

    function test_payee_added_before_any_money_left() public {
        address[] memory none = new address[](0);
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), none, uint64(block.timestamp + 30 days));
        family.fund(DEAL, 100e6);
        vm.stopPrank();
        family.addPayee(DEAL, seller);
        family.pay(DEAL, seller, 100e6);
        assertEq(usdc.balanceOf(seller), 100e6);
    }

    function test_no_payee_added_after_money_left() public {
        _openAndFund(100e6);
        family.pay(DEAL, buyer, 1e6);
        vm.expectRevert(KarwanSettlementBase.NotAllowed.selector);
        family.addPayee(DEAL, makeAddr("late"));
    }

    function test_added_payees_pass_the_same_checks() public {
        _openAndFund(100e6);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.addPayee(DEAL, seller);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.addPayee(DEAL, buyer);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.addPayee(DEAL, address(family));
        for (uint256 i; i < 7; ++i) family.addPayee(DEAL, address(uint160(0x2000 + i)));
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.addPayee(DEAL, address(0x3000));
    }

    function test_only_a_payee_accepts() public {
        _openAndFund(10e6);
        vm.prank(stranger);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.accept(DEAL);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.accept(DEAL);
        vm.prank(seller);
        family.accept(DEAL);
        assertEq(family.accountOf(DEAL).consentMask, 1);
    }

    function test_open_refuses_same_person_on_both_sides() public {
        (address second, uint256 secondKey) = makeAddrAndKey("buyerSecond");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(buyerId, second, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(secondKey, d);
        vm.prank(buyer);
        identity.bind(second, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.open(DEAL, address(usdc), _one(second), uint64(block.timestamp + 1 days));
    }

    function test_a_deal_id_opens_once() public {
        _openAndFund(10e6);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.Exists.selector);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
    }

    function test_only_the_payer_funds() public {
        vm.prank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        _funded(stranger, 10e6);
        vm.prank(stranger);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.fund(DEAL, 10e6);
    }

    function test_funding_nothing_is_refused() public {
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 30 days));
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.fund(DEAL, 0);
        vm.stopPrank();
    }

    function test_per_deal_cap_is_snapshotted_total_cap_is_live() public {
        _openAndFund(600e6);
        hub.setCaps(address(family), address(usdc), 100e6, 10_000e6);
        vm.prank(buyer);
        family.fund(DEAL, 400e6);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.OverCap.selector);
        family.fund(DEAL, 1);

        bytes32 second = bytes32("deal-2");
        hub.setCaps(address(family), address(usdc), 1_000e6, 1_050e6);
        vm.startPrank(buyer);
        family.open(second, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        vm.expectRevert(KarwanSettlementBase.OverCap.selector);
        family.fund(second, 51e6);
        family.fund(second, 50e6);
        vm.stopPrank();
    }

    function test_the_per_deal_cap_counts_what_a_deal_holds_at_once() public {
        _openAndFund(600e6);
        family.pay(DEAL, seller, 500e6);
        vm.startPrank(buyer);
        family.fund(DEAL, 900e6);
        vm.expectRevert(KarwanSettlementBase.OverCap.selector);
        family.fund(DEAL, 1);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).funded, 1_500e6);
        assertEq(family.accountOf(DEAL).balance, PER_DEAL);
    }

    function test_paused_family_takes_no_money_but_pays_out() public {
        _openAndFund(100e6);
        vm.prank(guardian);
        hub.pauseFamily(address(family));
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.fund(DEAL, 1e6);
        family.pay(DEAL, seller, 60e6);
        family.pay(DEAL, buyer, 40e6);
        assertEq(usdc.balanceOf(seller), 60e6);
    }

    function test_retired_family_still_takes_money_for_open_deals() public {
        _openAndFund(100e6);
        hub.retireFamily(address(family));
        vm.prank(buyer);
        family.fund(DEAL, 50e6);
        family.pay(DEAL, seller, 150e6);
        assertEq(usdc.balanceOf(seller), 150e6);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.open(bytes32("deal-new"), address(usdc), _one(seller), uint64(block.timestamp + 1 days));
    }

    function test_zero_per_deal_cap_does_not_freeze_open_deals() public {
        _openAndFund(100e6);
        hub.setCaps(address(family), address(usdc), 0, TOTAL);
        vm.prank(buyer);
        family.fund(DEAL, 100e6);
        assertEq(family.accountOf(DEAL).funded, 200e6);
    }

    function test_revoked_family_takes_no_money() public {
        _openAndFund(100e6);
        hub.revokeFamily(address(family));
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        family.fund(DEAL, 1e6);
        family.pay(DEAL, buyer, 100e6);
    }

    function test_closing_a_deal_is_announced() public {
        _openAndFund(10e6);
        family.pay(DEAL, buyer, 10e6);
        vm.expectEmit(address(family));
        emit KarwanSettlementBase.AccountClosed(DEAL);
        family.close(DEAL);
    }

    function test_payouts_go_only_to_parties() public {
        _openAndFund(100e6);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.pay(DEAL, stranger, 1e6);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.pay(DEAL, feeSafe, 1e6);
    }

    function test_cannot_pay_more_than_the_deal_holds() public {
        _openAndFund(100e6);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.pay(DEAL, seller, 100e6 + 1);
    }

    function test_fee_stays_within_the_snapshotted_rate() public {
        _openAndFund(100e6);
        hub.setFamilyFee(address(family), 1_000);
        vm.expectRevert(KarwanSettlementBase.FeeTooHigh.selector);
        family.payFee(DEAL, 1e6 + 1);
        family.payFee(DEAL, 1e6);
        assertEq(usdc.balanceOf(feeSafe), 1e6);
        assertEq(family.feeLeft(DEAL), 0);
    }

    function test_blocked_payee_is_owed_and_only_they_withdraw() public {
        _openAndFund(100e6);
        usdc.setBlocked(seller, true);
        family.pay(DEAL, seller, 100e6);
        assertEq(family.owed(address(usdc), seller), 100e6);
        assertEq(family.owedTotal(address(usdc)), 100e6);
        assertEq(usdc.balanceOf(address(family)), 100e6);

        vm.prank(seller);
        vm.expectRevert();
        family.withdrawOwed(address(usdc));
        assertEq(family.owed(address(usdc), seller), 100e6);

        vm.prank(stranger);
        vm.expectRevert(KarwanSettlementBase.NothingOwed.selector);
        family.withdrawOwed(address(usdc));

        usdc.setBlocked(seller, false);
        vm.prank(seller);
        family.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(seller), 100e6);
        assertEq(family.owedTotal(address(usdc)), 0);
    }

    /// The family's cash falls below its books only if the asset takes more
    /// from the family than it was asked to move.
    function test_a_payout_neither_cash_nor_the_pool_covers_is_owed() public {
        SettlementSenderFeeToken token = new SettlementSenderFeeToken();
        hub.setAsset(address(token), true, 0);
        hub.setCaps(address(family), address(token), PER_DEAL, TOTAL);
        token.mint(buyer, 101e6);
        vm.startPrank(buyer);
        token.approve(address(family), type(uint256).max);
        family.open(DEAL, address(token), _one(seller), uint64(block.timestamp + 30 days));
        family.fund(DEAL, 100e6);
        vm.stopPrank();
        family.pay(DEAL, seller, 60e6);
        family.pay(DEAL, buyer, 40e6);
        assertEq(token.balanceOf(seller), 60e6);
        assertEq(token.balanceOf(buyer), 0);
        assertEq(family.owed(address(token), buyer), 40e6);
        assertEq(family.accountOf(DEAL).balance, 0);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.PoolBusy.selector);
        family.withdrawOwed(address(token));
        assertEq(family.owed(address(token), buyer), 40e6);
    }

    function test_a_longstop_split_names_one_amount_per_payee() public {
        _openAndFund(100e6);
        uint64 horizon = family.accountOf(DEAL).horizon;
        vm.warp(uint256(horizon) + 180 days);
        uint256[] memory none = new uint256[](0);
        uint256[] memory two = new uint256[](2);
        two[0] = 100e6;
        vm.startPrank(seniorSafe);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.longstopSplit(DEAL, 100e6, none);
        vm.expectRevert(KarwanSettlementBase.BadParties.selector);
        family.longstopSplit(DEAL, 0, two);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).balance, 100e6);
    }

    function test_an_outcome_for_a_party_the_deal_does_not_have_is_refused() public {
        _openAndFund(10e6);
        vm.expectRevert(KarwanSettlementBase.NotParty.selector);
        family.recordOutcome(DEAL, 2, Outcome.COMPLETED, 0);
    }

    function test_close_needs_an_empty_deal() public {
        _openAndFund(100e6);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.close(DEAL);
        family.pay(DEAL, buyer, 100e6);
        family.close(DEAL);
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.Closed.selector);
        family.fund(DEAL, 1e6);
    }

    function test_agent_payer_stays_within_its_signed_limits() public {
        (address agent, uint256 agentKey) = makeAddrAndKey("buyerAgent");
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(buyerId, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 50e6, 80e6, deadline);
        bytes memory s = _sig(agentKey, d);
        vm.prank(buyer);
        identity.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 50e6, 80e6, deadline, s);
        _funded(agent, 1_000e6);
        vm.startPrank(agent);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        vm.expectRevert(KarwanIdentityRegistry.OverLimit.selector);
        family.fund(DEAL, 51e6);
        family.fund(DEAL, 50e6);
        vm.expectRevert(KarwanIdentityRegistry.OverLimit.selector);
        family.fund(DEAL, 31e6);
        vm.stopPrank();
    }

    function test_a_token_that_delivers_less_is_refused() public {
        SkimToken skim = new SkimToken();
        hub.setAsset(address(skim), true, 0);
        hub.setCaps(address(family), address(skim), PER_DEAL, TOTAL);
        skim.mint(buyer, 100e6);
        vm.startPrank(buyer);
        skim.approve(address(family), type(uint256).max);
        family.open(DEAL, address(skim), _one(seller), uint64(block.timestamp + 1 days));
        vm.expectRevert(KarwanSettlementBase.BadDelivery.selector);
        family.fund(DEAL, 100e6);
        vm.stopPrank();
    }

    function test_no_function_takes_native_value() public {
        vm.prank(buyer);
        family.open(DEAL, address(usdc), _one(seller), uint64(block.timestamp + 1 days));
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        (bool ok,) = address(family).call{value: 1}(abi.encodeCall(family.fund, (DEAL, 1e6)));
        assertFalse(ok);
        (ok,) = address(family).call{value: 1}("");
        assertFalse(ok);
    }

    /// Every family publishes the limits the settlement rules hold it to.
    function test_the_settlement_limits_are_published() public view {
        assertEq(family.MAX_FEE_BPS(), 1_000);
        assertEq(family.MAX_PAYEES(), 8);
        assertEq(family.LONGSTOP(), 180 days);
        assertEq(family.MAX_HORIZON(), 730 days);
        assertEq(family.HOLD_STEP(), 7 days);
        assertEq(family.HOLD_BUDGET(), 30 days);
    }

    function test_a_cancelled_nonce_is_announced_with_the_payee() public {
        vm.expectEmit(true, true, true, true, address(family));
        emit KarwanSettlementBase.NonceCancelled(seller, 7);
        vm.prank(seller, makeAddr("relayer"));
        family.cancelNonce(7);
    }

    function test_only_the_payer_and_the_payees_are_parties() public {
        _openAndFund(500e6);
        assertTrue(family.isParty(DEAL, buyer));
        assertTrue(family.isParty(DEAL, seller));
        assertFalse(family.isParty(DEAL, stranger));
        assertFalse(family.isParty(bytes32("no-deal"), buyer));
    }

    // ------------------------------ Outcomes ------------------------------

    function test_lifting_a_hold_ends_it_now_even_after_2106() public {
        _openAndFund(100e6);
        vm.warp((uint256(1) << 32) + 50);
        vm.prank(guardian);
        family.hold(DEAL, bytes32("scan"));
        vm.prank(guardian);
        family.releaseHold(DEAL);
        assertEq(family.accountOf(DEAL).holdUntil, vm.getBlockTimestamp());
    }

    function test_the_payer_and_the_payees_are_parties_and_no_one_else_is() public {
        _openAndFund(100e6);
        assertTrue(family.isParty(DEAL, buyer));
        assertTrue(family.isParty(DEAL, seller));
        assertFalse(family.isParty(DEAL, stranger));
    }
}
