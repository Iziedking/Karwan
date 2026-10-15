// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "../SuiteFixture.sol";
import {KarwanAgreementEscrow} from "../../../src/suite/KarwanAgreementEscrow.sol";
import {
    AgreementTerms, AgreementDeal, AgreementState, AgreementBounds
} from "../../../src/suite/agreement/AgreementTypes.sol";

abstract contract AgreementFixture is SuiteFixture {
    KarwanAgreementEscrow internal escrow;
    address internal buyer;
    uint256 internal buyerKey;
    uint64 internal buyerId;
    address internal seller;
    uint256 internal sellerKey;
    uint64 internal sellerId;
    address internal stranger = makeAddr("stranger");

    uint128 internal constant PRICE = 100e6;

    function _deployAgreement() internal {
        _deploySuite();
        escrow = new KarwanAgreementEscrow(address(hub), AgreementBounds(1 hours, 30 days, 365 days));
        hub.registerFamily(address(escrow), FEE_BPS);
        hub.setCaps(address(escrow), address(usdc), PER_DEAL, TOTAL);
        (buyer, buyerKey, buyerId) = _person("buyer");
        (seller, sellerKey, sellerId) = _person("seller");
        usdc.mint(buyer, 100_000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    /// One tranche, delivery in 10 days, 3-day review, two 1-day extensions,
    /// claim on the timer, 14-day silence longstop.
    function _terms() internal view returns (AgreementTerms memory t) {
        t.asset = address(usdc);
        t.seller = seller;
        t.amount = PRICE;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 2 days;
        t.reviewWindow = 3 days;
        t.maxExtensions = 2;
        t.extensionSecs = 1 days;
        t.silentLongstop = 14 days;
        t.agreementHash = keccak256("agreement");
    }

    function _fund(AgreementTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        vm.prank(buyer);
        id = escrow.fund(salt, t);
    }

    function _fundAccepted(AgreementTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        id = _fund(t, salt);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
    }

    function _deliver(bytes32 id) internal {
        vm.prank(seller);
        escrow.markDelivered(id, keccak256("proof"));
    }

    function _deal(bytes32 id) internal view returns (AgreementDeal memory) {
        return escrow.getDeal(id);
    }

    function _state(bytes32 id) internal view returns (AgreementState) {
        return escrow.getDeal(id).state;
    }
}
