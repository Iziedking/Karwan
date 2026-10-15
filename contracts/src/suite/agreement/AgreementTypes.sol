// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DisputeStore} from "../dispute/DisputeLib.sol";

/// @notice What both sides agree before an Agreement deal is funded. The
///         seller accepts the hash of exactly these bytes.
struct AgreementTerms {
    address asset;
    address seller;
    uint128 amount;
    /// Share of the price per tranche, in basis points. Leading non-zero
    /// entries are the tranches; they sum to 10,000 and the rest are zero.
    uint16[12] trancheBps;
    /// The seller must accept before this time.
    uint64 acceptBy;
    /// When the next undelivered tranche is late. Required, after `acceptBy`;
    /// one deadline covers every tranche, and either side can move it later.
    uint64 deliveryDeadline;
    /// The seller's last chance after the deadline.
    uint32 reclaimGrace;
    /// The buyer's time to check each delivery.
    uint32 reviewWindow;
    /// For review on arrival or on a check: review starts anyway this long after delivery.
    uint32 startLongstop;
    uint32 extensionSecs;
    /// If the buyer neither releases nor disputes, the seller can claim this
    /// long after delivery, unless the deal is a deposit or a check failed
    /// first. It covers the start longstop, the review and every extension.
    uint32 silentLongstop;
    /// 0 = review starts at delivery, 1 = at the buyer's arrival confirmation,
    /// 2 = at a passing check from the deal's verifier.
    uint8 reviewStarts;
    uint8 maxExtensions;
    /// 0 = the last tranche can be claimed when its review ends,
    /// 1 = the last tranche needs the buyer, a ruling, or the silence longstop.
    uint8 finalRelease;
    /// 0 = a finished deal pays the seller, 1 = a refundable deposit.
    uint8 silenceOutcome;
    /// The partial refund an automatic ruling may propose, in basis points to
    /// the seller. 0 = none.
    uint16 partialBps;
    /// The seller's share of a disputed tranche if the reviewer misses the
    /// ruling deadline, in basis points.
    uint16 fallbackBps;
    /// Instalments: 0 = the whole price at funding, 2 to 12 = equal parts, the
    /// first at funding and one every `partEvery` seconds after it. The seller
    /// delivers only once every part is paid.
    uint8 parts;
    uint32 partEvery;
    /// What the seller keeps of the price if the buyer misses a part, in basis
    /// points, at most 20%. Karwan takes no fee on a cancelled plan.
    uint16 cancelFeeBps;
    /// The seller's stake behind the deal, for the buyer: reserved when the
    /// seller accepts, slashed only by a ruling in the buyer's favour, in
    /// proportion to the buyer's share, and freed at every other ending.
    /// At most the price. 0 = none.
    uint128 sellerStake;
    /// The verifier that reports checks, when review starts on a check.
    address verifier;
    bytes32 checkPolicy;
    /// Digest of the full signed agreement off chain.
    bytes32 agreementHash;
}

enum AgreementState {
    None,
    Funded,
    Accepted,
    Disputed,
    Settled,
    Refunded,
    Reclaimed,
    Split,
    Ruled,
    Longstopped
}

struct AgreementDeal {
    AgreementState state;
    uint8 count;
    uint8 paid;
    uint8 extUsed;
    uint8 extRequests;
    bool checkPassed;
    bool checkFailed;
    bool lateMark;
    uint8 partsPaid;
    uint32 revision;
    uint64 fundedAt;
    uint64 deadline;
    uint64 deliveredAt;
    uint64 reviewStartAt;
    uint64 reviewEnd;
    uint64 requestedDeadline;
    /// The deal's hold time already used when this delivery was marked, so a
    /// hold delays only the tranche it fell in.
    uint64 holdBase;
    uint128 sellerNet;
    uint128 feeTotal;
    uint128 released;
    uint128 feeReleased;
    bytes32 termsHash;
}

library AgreementCodes {
    uint8 internal constant START_ON_DELIVERY = 0;
    uint8 internal constant START_ON_ARRIVAL = 1;
    uint8 internal constant START_ON_CHECK = 2;
    uint8 internal constant FINAL_ON_TIMER = 0;
    uint8 internal constant FINAL_BY_BUYER = 1;
    uint8 internal constant SILENCE_PAYS_SELLER = 0;
    uint8 internal constant SILENCE_REFUNDS_BUYER = 1;
    uint8 internal constant MAX_TRANCHES = 12;
    uint8 internal constant MAX_EXTENSIONS = 3;
    uint8 internal constant MAX_PARTS = 12;
    uint16 internal constant MAX_CANCEL_FEE_BPS = 2_000;
    uint16 internal constant BPS = 10_000;
}

/// An offer holds only while no further tranche is paid.
struct SplitOffer {
    address proposer;
    uint16 sellerBps;
    bool active;
    uint8 paid;
}

/// @notice An Agreement family's own books.
struct AgreementStore {
    mapping(bytes32 => AgreementDeal) deals;
    mapping(bytes32 => AgreementTerms) terms;
    mapping(bytes32 => SplitOffer) splits;
    DisputeStore disputes;
    /// The stake vault the escrow reserved sellers' stakes in, set at the
    /// first staked acceptance. The hub wires its vault once.
    address stakeVault;
}

struct AgreementBounds {
    uint64 minReview;
    uint64 maxReview;
    uint64 maxHorizon;
}
