// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementTerms, AgreementDeal, AgreementState, AgreementCodes as C} from "./AgreementTypes.sol";

/// @notice Delivery, review and tranche clocks for Agreement deals. Linked once
///         at deploy. It changes only the deal's own clock fields and never
///         moves money: the escrow pays what `nextTranche` returns. The escrow
///         checks who is calling before it calls in.
library AgreementDeliveryLib {
    error BadState();
    error NotAllowed();
    error HashMismatch();
    error Exhausted();
    error Early();
    error Late();

    /// @notice The seller marks the current tranche delivered. Returns whether
    ///         the review started now.
    function mark(AgreementDeal storage d, AgreementTerms storage t, uint64 holdUsed)
        external
        returns (bool started)
    {
        if (d.state != AgreementState.Accepted || d.partsPaid < t.parts) revert BadState();
        if (block.timestamp > uint256(d.deadline) + t.reclaimGrace) revert Late();
        d.revision += 1;
        d.deliveredAt = uint64(block.timestamp);
        d.holdBase = holdUsed;
        d.lateMark = block.timestamp > d.deadline;
        d.checkPassed = false;
        d.checkFailed = false;
        d.extUsed = 0;
        d.reviewStartAt = 0;
        d.reviewEnd = 0;
        if (t.reviewStarts == C.START_ON_DELIVERY) {
            _start(d, t);
            started = true;
        }
    }

    /// @notice The buyer starts their own review: for goods, by confirming
    ///         arrival; for a checked deal, by reviewing it themselves instead
    ///         of waiting for the check, which waives the check.
    function buyerStart(AgreementDeal storage d, AgreementTerms storage t) external {
        if (d.state != AgreementState.Accepted || d.deliveredAt == 0 || d.reviewStartAt != 0) revert BadState();
        if (t.reviewStarts == C.START_ON_DELIVERY) revert NotAllowed();
        if (t.reviewStarts == C.START_ON_CHECK) {
            d.checkPassed = true;
            d.checkFailed = false;
        }
        _start(d, t);
    }

    /// @notice The verifier's result for one delivery revision. A pass starts
    ///         the review; a fail stops timer claims until the seller delivers
    ///         again. Once the silence longstop has passed, a fail comes too
    ///         late to stop the claim.
    function attest(AgreementDeal storage d, AgreementTerms storage t, uint32 revision, bool pass, uint64 holdSecs)
        external
        returns (bool started)
    {
        if (d.state != AgreementState.Accepted || d.deliveredAt == 0) revert BadState();
        if (revision != d.revision) revert HashMismatch();
        if (!pass) {
            if (block.timestamp >= uint256(d.deliveredAt) + t.silentLongstop + holdSecs) revert Late();
            if (!d.checkPassed) d.checkFailed = true;
            return false;
        }
        d.checkPassed = true;
        d.checkFailed = false;
        if (d.reviewStartAt == 0) {
            _start(d, t);
            started = true;
        }
    }

    function moreTime(AgreementDeal storage d, AgreementTerms storage t, uint64 holdSecs) external {
        if (d.state != AgreementState.Accepted || d.reviewStartAt == 0) revert BadState();
        if (block.timestamp >= uint256(d.reviewEnd) + holdSecs) revert Late();
        if (d.extUsed >= t.maxExtensions) revert Exhausted();
        d.extUsed += 1;
        d.reviewEnd += t.extensionSecs;
    }

    /// @notice When the seller may claim on the review clock, ignoring check
    ///         and final-release rules. 0 = not delivered.
    function reviewEnd(AgreementDeal storage d, AgreementTerms storage t, uint64 holdSecs)
        public
        view
        returns (uint64)
    {
        if (d.deliveredAt == 0) return 0;
        if (d.reviewStartAt != 0) return d.reviewEnd + holdSecs;
        return d.deliveredAt + t.startLongstop + t.reviewWindow + holdSecs;
    }

    /// @notice Why the seller cannot claim the next tranche on the clock now,
    ///         as an error selector; 0 when they can.
    function claimBar(AgreementDeal storage d, AgreementTerms storage t, uint64 holdSecs)
        public
        view
        returns (bytes4)
    {
        if (d.state != AgreementState.Accepted || d.deliveredAt == 0) return BadState.selector;
        if (t.silenceOutcome == C.SILENCE_REFUNDS_BUYER || d.checkFailed) return NotAllowed.selector;
        if (block.timestamp < reviewEnd(d, t, holdSecs)) return Early.selector;
        bool silence = block.timestamp >= uint256(d.deliveredAt) + t.silentLongstop + holdSecs;
        if (t.reviewStarts == C.START_ON_CHECK && !d.checkPassed && !silence) return Early.selector;
        if (d.paid + 1 == d.count && t.finalRelease == C.FINAL_BY_BUYER && !silence) return Early.selector;
        return 0;
    }

    /// @notice Why the buyer cannot take the rest back now; 0 when they can.
    ///         An unfinished instalment plan ends through a missed part instead.
    function reclaimBar(AgreementDeal storage d, AgreementTerms storage t) public view returns (bytes4) {
        if (d.state != AgreementState.Accepted || d.partsPaid < t.parts) return BadState.selector;
        if (block.timestamp <= uint256(d.deadline) + t.reclaimGrace) return Early.selector;
        if (t.silenceOutcome == C.SILENCE_REFUNDS_BUYER || d.deliveredAt == 0) return 0;
        if (!(t.reviewStarts == C.START_ON_CHECK && d.checkFailed && !d.checkPassed)) return NotAllowed.selector;
        return 0;
    }

    function checkClaim(AgreementDeal storage d, AgreementTerms storage t, uint64 holdSecs) external view {
        _revert(claimBar(d, t, holdSecs));
    }

    function checkReclaim(AgreementDeal storage d, AgreementTerms storage t) external view {
        _revert(reclaimBar(d, t));
    }

    /// @notice Moves the deal to the next tranche and returns what it pays.
    function nextTranche(AgreementDeal storage d, AgreementTerms storage t)
        external
        returns (uint256 sellerCut, uint256 feeCut, bool last)
    {
        uint8 i = d.paid;
        if (d.state != AgreementState.Accepted || i >= d.count) revert BadState();
        last = i + 1 == d.count;
        if (last) {
            sellerCut = d.sellerNet - d.released;
            feeCut = d.feeTotal - d.feeReleased;
        } else {
            uint16 b = t.trancheBps[i];
            sellerCut = (uint256(d.sellerNet) * b) / C.BPS;
            feeCut = (uint256(d.feeTotal) * b) / C.BPS;
        }
        d.released += uint128(sellerCut);
        d.feeReleased += uint128(feeCut);
        d.paid = i + 1;
        d.deliveredAt = 0;
        d.reviewStartAt = 0;
        d.reviewEnd = 0;
        d.checkPassed = false;
        d.checkFailed = false;
        d.extUsed = 0;
    }

    function _revert(bytes4 e) private pure {
        if (e == BadState.selector) revert BadState();
        if (e == NotAllowed.selector) revert NotAllowed();
        if (e == Early.selector) revert Early();
    }

    /// A review started after its start longstop counts from the longstop, so
    /// starting late never reopens a clock that has already run out.
    function _start(AgreementDeal storage d, AgreementTerms storage t) private {
        uint64 latest = d.deliveredAt + t.startLongstop;
        uint64 at = block.timestamp < latest ? uint64(block.timestamp) : latest;
        d.reviewStartAt = at;
        d.reviewEnd = at + t.reviewWindow;
    }
}
