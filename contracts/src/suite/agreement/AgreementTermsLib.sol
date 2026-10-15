// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementTerms, AgreementCodes as C} from "./AgreementTypes.sol";

/// @notice Checks every bound on an Agreement deal's terms. Linked once at
///         deploy; it reads nothing but its arguments and moves no money.
library AgreementTermsLib {
    error BadTerms();

    struct Limits {
        uint64 minReview;
        uint64 maxReview;
        uint64 maxHorizon;
        uint128 highValue;
    }

    /// @notice Returns the number of tranches, or reverts on any bound.
    function validate(AgreementTerms calldata t, Limits calldata l) external view returns (uint8 count) {
        uint256 sum;
        for (uint8 i; i < C.MAX_TRANCHES; ++i) {
            uint16 b = t.trancheBps[i];
            if (b == 0) break;
            sum += b;
            count++;
        }
        for (uint8 i = count; i < C.MAX_TRANCHES; ++i) {
            if (t.trancheBps[i] != 0) revert BadTerms();
        }
        if (count == 0 || sum != C.BPS || t.seller == address(0) || t.amount == 0) revert BadTerms();
        if (t.acceptBy <= block.timestamp || t.acceptBy > block.timestamp + l.maxHorizon) revert BadTerms();
        if (t.reviewWindow < l.minReview || t.reviewWindow > l.maxReview) revert BadTerms();
        if (
            t.reviewStarts > C.START_ON_CHECK || t.finalRelease > C.FINAL_BY_BUYER
                || t.silenceOutcome > C.SILENCE_REFUNDS_BUYER || t.maxExtensions > C.MAX_EXTENSIONS
        ) revert BadTerms();
        if (t.reviewStarts != C.START_ON_DELIVERY && (t.startLongstop == 0 || t.startLongstop > l.maxHorizon)) {
            revert BadTerms();
        }
        if (t.reviewStarts == C.START_ON_CHECK) {
            if (t.verifier == address(0) || t.checkPolicy == bytes32(0)) revert BadTerms();
        } else if (t.verifier != address(0)) {
            revert BadTerms();
        }
        if (t.extensionSecs > t.reviewWindow || t.reclaimGrace > l.maxReview) revert BadTerms();
        if (
            t.silentLongstop
                < uint256(t.startLongstop) + t.reviewWindow + uint256(t.maxExtensions) * t.extensionSecs
                || t.silentLongstop > l.maxHorizon
        ) revert BadTerms();
        if (t.deliveryDeadline <= t.acceptBy || t.deliveryDeadline > block.timestamp + l.maxHorizon) revert BadTerms();
        if (t.agreementHash == bytes32(0) || t.partialBps >= C.BPS || t.fallbackBps > C.BPS) revert BadTerms();
        _checkParts(t);
        if (
            l.highValue != 0 && t.amount >= l.highValue
                && (t.finalRelease != C.FINAL_BY_BUYER || t.reviewStarts != C.START_ON_CHECK)
        ) revert BadTerms();
    }

    /// An instalment plan has 2 to 12 parts, is never a deposit, and its
    /// delivery deadline falls after the last part and its grace.
    function _checkParts(AgreementTerms calldata t) private view {
        if (t.parts == 0) {
            if (t.partEvery != 0 || t.cancelFeeBps != 0) revert BadTerms();
            return;
        }
        if (
            t.parts < 2 || t.parts > C.MAX_PARTS || t.partEvery == 0 || t.cancelFeeBps > C.MAX_CANCEL_FEE_BPS
                || t.silenceOutcome == C.SILENCE_REFUNDS_BUYER
                || t.deliveryDeadline <= block.timestamp + uint256(t.parts - 1) * t.partEvery + t.reclaimGrace
        ) revert BadTerms();
    }
}
