// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {SkimToken} from "./mocks/BlocklistToken.sol";

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
        KarwanSettlementBase.Account memory a = family.accountOf(DEAL);
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
}
