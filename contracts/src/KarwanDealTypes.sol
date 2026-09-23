// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The terms both sides agree before a deal is funded. Stored at
///         funding; the seller accepts by their hash, so both consent to the
///         same bytes. See docs/escrow-design.md.
struct DealTerms {
    address seller;
    /// Deal price in USDC (6 decimals), before fees.
    uint128 amount;
    /// Share of the price per milestone, in percent. Leading non-zero entries
    /// are the milestones; they sum to 100 and trailing entries are zero.
    uint8[5] pcts;
    /// Seller stake reserved as insurance: 0, or 5000..maxReservationBps.
    uint16 reservationBps;
    /// When the next undelivered milestone is late. 0 = no deadline.
    uint64 deliveryDeadline;
    /// Seller's last chance after the deadline.
    uint32 reclaimGrace;
    /// Buyer's time to check each delivery.
    uint32 reviewWindow;
    /// 0 = review starts at delivery, 1 = at the buyer's arrival confirmation,
    /// 2 = at a passing delivery check.
    uint8 reviewStarts;
    /// For reviewStarts 1 or 2: review starts anyway this long after delivery.
    uint32 startLongstop;
    /// How many times the buyer may extend a review, and by how much.
    uint8 maxExtensions;
    uint32 extensionSecs;
    /// 0 = the last milestone can be claimed when the review ends,
    /// 1 = the last milestone needs the buyer, a ruling, or the silence longstop.
    uint8 finalRelease;
    /// 0 = a finished deal pays the seller, 1 = a refundable deposit: the
    /// money goes back to the buyer at the end unless the seller's claim holds.
    uint8 silenceOutcome;
    /// If the buyer neither releases nor disputes, the seller can claim this
    /// long after delivery, whatever the other terms say.
    uint32 silentLongstop;
    /// Delivery check plan (policy id and version), when reviewStarts == 2.
    bytes32 checkPolicy;
    /// Digest of the full signed agreement off-chain.
    bytes32 agreementHash;
}

enum DealState {
    None,
    Funded,
    Accepted,
    Disputed,
    Settled,
    Refunded,
    Reclaimed,
    Split
}

struct Deal {
    address buyer;
    DealState state;
    uint8 count;
    uint8 paid;
    uint8 extUsed;
    uint8 buyerDisputed;
    uint8 sellerDisputed;
    bool checkPassed;
    bool lateMark;
    bool eligible;
    bool escalated;
    bool proposal;
    /// Disputes need the 2-of-4 review Safe; fixed at funding.
    bool senior;
    address seller;
    uint64 deliveredAt;
    uint32 revision;
    address buyerId;
    uint64 reviewStartAt;
    address sellerId;
    uint64 reviewEnd;
    uint64 deadline;
    uint64 disputedAt;
    uint64 proposedAt;
    uint64 holdExtra;
    uint16 proposedBps;
    uint128 sellerNet;
    uint128 feeTotal;
    uint128 released;
    uint128 feeReleased;
    uint128 reserved;
    uint128 eligibleAmount;
    bytes32 termsHash;
}


function isBuyerOf(Deal storage d, address a) view returns (bool) {
    return a == d.buyer || (d.buyerId != address(0) && a == d.buyerId);
}

function isSellerOf(Deal storage d, address a) view returns (bool) {
    return a == d.seller || (d.sellerId != address(0) && a == d.sellerId);
}

library DealTermsCodes {
    uint8 internal constant START_ON_DELIVERY = 0;
    uint8 internal constant START_ON_ARRIVAL = 1;
    uint8 internal constant START_ON_CHECK = 2;
    uint8 internal constant FINAL_ON_TIMER = 0;
    uint8 internal constant FINAL_BY_BUYER = 1;
    uint8 internal constant SILENCE_PAYS_SELLER = 0;
    uint8 internal constant SILENCE_REFUNDS_BUYER = 1;
}

/// @notice Terms validation, deployed once and linked, to keep the escrow
///         under the EIP-170 size limit.
library DealTermsLib {
    error BadTerms();

    struct Limits {
        uint16 maxReservationBps;
        uint64 minReview;
        uint64 maxReview;
        uint64 maxHorizon;
        uint128 highValue;
    }

    uint16 internal constant MIN_TRUSTED_BPS = 5_000;

    /// @notice Checks every bound on the terms and returns the milestone count.
    function validate(DealTerms calldata t, Limits calldata l) external view returns (uint8 count) {
        uint256 sum;
        for (uint8 i = 0; i < 5; i++) {
            uint8 p = t.pcts[i];
            if (p == 0) break;
            sum += p;
            count++;
        }
        for (uint8 i = count; i < 5; i++) {
            if (t.pcts[i] != 0) revert BadTerms();
        }
        if (count == 0 || sum != 100) revert BadTerms();
        if (t.reservationBps != 0 && (t.reservationBps < MIN_TRUSTED_BPS || t.reservationBps > l.maxReservationBps)) {
            revert BadTerms();
        }
        if (t.reviewWindow < l.minReview || t.reviewWindow > l.maxReview) revert BadTerms();
        if (t.reviewStarts > DealTermsCodes.START_ON_CHECK || t.finalRelease > DealTermsCodes.FINAL_BY_BUYER) {
            revert BadTerms();
        }
        if (t.silenceOutcome > DealTermsCodes.SILENCE_REFUNDS_BUYER) revert BadTerms();
        if (
            t.reviewStarts != DealTermsCodes.START_ON_DELIVERY
                && (t.startLongstop == 0 || t.startLongstop > l.maxHorizon)
        ) revert BadTerms();
        if (t.reviewStarts == DealTermsCodes.START_ON_CHECK && t.checkPolicy == bytes32(0)) revert BadTerms();
        if (t.extensionSecs > t.reviewWindow) revert BadTerms();
        if (t.reclaimGrace > l.maxReview) revert BadTerms();
        if (
            t.silentLongstop < uint256(t.reviewWindow) + uint256(t.maxExtensions) * t.extensionSecs
                || t.silentLongstop > l.maxHorizon
        ) revert BadTerms();
        if (t.deliveryDeadline != 0) {
            if (t.deliveryDeadline <= block.timestamp || t.deliveryDeadline > block.timestamp + l.maxHorizon) {
                revert BadTerms();
            }
        }
        if (t.agreementHash == bytes32(0)) revert BadTerms();
        if (l.highValue != 0 && t.amount >= l.highValue) {
            if (
                t.finalRelease != DealTermsCodes.FINAL_BY_BUYER || t.reviewStarts != DealTermsCodes.START_ON_CHECK
                    || t.deliveryDeadline == 0
            ) revert BadTerms();
        }
        // A refundable deposit ends at its deadline: without one the default
        // outcome could never happen.
        if (t.silenceOutcome == DealTermsCodes.SILENCE_REFUNDS_BUYER && t.deliveryDeadline == 0) revert BadTerms();
    }
}

/// @notice Dispute bookkeeping, deployed once and linked. Operates on the
///         escrow's own storage; the escrow emits the events.
library DealDisputeLib {
    error BadState();
    error BadCaller();
    error Exhausted();
    error Early();
    error Late();

    function _isBuyer(Deal storage d, address a) private view returns (bool) {
        return isBuyerOf(d, a);
    }

    function _isSeller(Deal storage d, address a) private view returns (bool) {
        return isSellerOf(d, a);
    }

    /// @notice Open a dispute on the current milestone. Each side once per
    ///         milestone. Returns whether the buyer opened it.
    function open(Deal storage d, address caller) external returns (bool byBuyer) {
        if (d.state != DealState.Accepted) revert BadState();
        uint8 bit = uint8(1) << d.paid;
        byBuyer = _isBuyer(d, caller);
        if (byBuyer) {
            if (d.buyerDisputed & bit != 0) revert Exhausted();
            d.buyerDisputed |= bit;
        } else if (_isSeller(d, caller)) {
            if (d.sellerDisputed & bit != 0) revert Exhausted();
            d.sellerDisputed |= bit;
        } else {
            revert BadCaller();
        }
        d.state = DealState.Disputed;
        d.disputedAt = uint64(block.timestamp);
        d.proposal = false;
        d.escalated = false;
    }

    /// @notice Send a dispute to admin review: a side appealing a proposal in
    ///         time, a side whose dispute got no proposal within the SLA, or the
    ///         engine itself.
    function escalate(Deal storage d, address caller, address autoArbiter, uint64 appealWindow, uint64 sla)
        external
    {
        if (d.state != DealState.Disputed || d.escalated) revert BadState();
        if (caller != autoArbiter) {
            if (!_isBuyer(d, caller) && !_isSeller(d, caller)) revert BadCaller();
            if (d.proposal) {
                if (block.timestamp >= uint256(d.proposedAt) + appealWindow) revert Late();
            } else if (block.timestamp < uint256(d.disputedAt) + sla) {
                revert Early();
            }
        }
        d.escalated = true;
        d.proposal = false;
    }

    /// @notice Resume after the dispute timeout. The deadline moves by the
    ///         frozen time unless the seller was already late. An on-time
    ///         delivery survives with a fresh review; a late one is wiped.
    function lapse(Deal storage d, address caller, uint64 disputeTimeout, uint32 reviewWindow)
        external
        returns (uint64 frozen)
    {
        if (d.state != DealState.Disputed) revert BadState();
        if (!_isBuyer(d, caller) && !_isSeller(d, caller)) revert BadCaller();
        if (block.timestamp < uint256(d.disputedAt) + disputeTimeout) revert Early();
        frozen = uint64(block.timestamp) - d.disputedAt;
        if (d.deadline != 0 && !d.lateMark) d.deadline += frozen;
        if (d.deliveredAt != 0) {
            if (d.lateMark) {
                d.deliveredAt = 0;
                d.reviewStartAt = 0;
                d.reviewEnd = 0;
            } else if (d.reviewStartAt != 0) {
                d.reviewStartAt = uint64(block.timestamp);
                d.reviewEnd = uint64(block.timestamp) + reviewWindow;
            } else {
                d.deliveredAt += frozen;
            }
        }
        d.disputedAt = 0;
        d.proposal = false;
        d.escalated = false;
        d.state = DealState.Accepted;
    }
}

/// @notice Delivery and review clocks, deployed once and linked. Never moves
///         money; the escrow emits the events.
library DealDeliveryLib {
    error BadState();
    error BadCaller();
    error NotAllowed();
    error HashMismatch();
    error Exhausted();
    error Early();
    error Late();

    /// @notice Seller marks the current milestone delivered. Returns whether
    ///         the review started now (reviewStarts == on delivery).
    function mark(Deal storage d, DealTerms storage t, address caller) external returns (bool started) {
        if (d.state != DealState.Accepted) revert BadState();
        if (!isSellerOf(d, caller)) revert BadCaller();
        if (d.deadline != 0 && block.timestamp > uint256(d.deadline) + t.reclaimGrace) revert Late();
        d.revision += 1;
        d.deliveredAt = uint64(block.timestamp);
        d.lateMark = d.deadline != 0 && block.timestamp > d.deadline;
        d.checkPassed = false;
        d.extUsed = 0;
        d.holdExtra = 0;
        d.reviewStartAt = 0;
        d.reviewEnd = 0;
        if (t.reviewStarts == DealTermsCodes.START_ON_DELIVERY) {
            _start(d, t);
            started = true;
        }
    }

    function buyerStart(Deal storage d, DealTerms storage t, address caller) external {
        if (d.state != DealState.Accepted || d.deliveredAt == 0 || d.reviewStartAt != 0) revert BadState();
        if (t.reviewStarts == DealTermsCodes.START_ON_DELIVERY) revert NotAllowed();
        if (!isBuyerOf(d, caller)) revert BadCaller();
        if (t.reviewStarts == DealTermsCodes.START_ON_CHECK) d.checkPassed = true;
        _start(d, t);
    }

    function attest(Deal storage d, DealTerms storage t, uint32 revision, bool pass) external returns (bool started) {
        if (d.state != DealState.Accepted || d.deliveredAt == 0) revert BadState();
        if (revision != d.revision) revert HashMismatch();
        if (!pass) return false;
        d.checkPassed = true;
        if (d.reviewStartAt == 0) {
            _start(d, t);
            started = true;
        }
    }

    function moreTime(Deal storage d, DealTerms storage t, address caller) external {
        if (d.state != DealState.Accepted || d.reviewStartAt == 0) revert BadState();
        if (!isBuyerOf(d, caller)) revert BadCaller();
        if (block.timestamp >= d.reviewEnd + d.holdExtra) revert Late();
        if (d.extUsed >= t.maxExtensions) revert Exhausted();
        d.extUsed += 1;
        d.reviewEnd += t.extensionSecs;
    }

    /// @notice When the seller may claim on the review clock, ignoring check
    ///         and final-release rules. 0 = not delivered.
    function reviewEnd(Deal storage d, DealTerms storage t) public view returns (uint64) {
        if (d.deliveredAt == 0) return 0;
        if (d.reviewStartAt != 0) return d.reviewEnd + d.holdExtra;
        return d.deliveredAt + t.startLongstop + t.reviewWindow + d.holdExtra;
    }

    /// @notice Reverts unless the seller may claim the next milestone now.
    function checkClaim(Deal storage d, DealTerms storage t, address caller) external view {
        if (d.state != DealState.Accepted || d.deliveredAt == 0) revert BadState();
        if (!isSellerOf(d, caller)) revert BadCaller();
        if (block.timestamp < reviewEnd(d, t)) revert Early();
        bool silenceReached = block.timestamp >= uint256(d.deliveredAt) + t.silentLongstop + d.holdExtra;
        if (t.reviewStarts == DealTermsCodes.START_ON_CHECK && !d.checkPassed && !silenceReached) revert Early();
        if (d.paid + 1 == d.count && t.finalRelease == DealTermsCodes.FINAL_BY_BUYER && !silenceReached) {
            revert Early();
        }
    }

    function _start(Deal storage d, DealTerms storage t) private {
        d.reviewStartAt = uint64(block.timestamp);
        d.reviewEnd = uint64(block.timestamp) + t.reviewWindow;
    }
}
