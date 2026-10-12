// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
    /// The verifier that reports checks, when review starts on a check.
    address verifier;
    bytes32 checkPolicy;
    /// Pay on delivery: keccak256(abi.encode(dealId, code)). 0 = none. The
    /// hash is public, so the code must be 32 random bytes, never a short number.
    bytes32 codeHash;
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
    bool codeUsed;
    uint32 revision;
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
    uint16 internal constant BPS = 10_000;
}
