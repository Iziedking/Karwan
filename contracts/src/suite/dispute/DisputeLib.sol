// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Who decides a deal's disputes, fixed when the deal opens.
struct DisputePanel {
    address arbiter;
    address reviewer;
}

/// One open dispute. Nothing here is money: the family pays the outcome.
struct Dispute {
    address opener;
    uint64 openedAt;
    bool proposed;
    bool escalated;
    uint16 proposedBps;
    uint64 proposedAt;
    uint64 escalatedAt;
}

struct DisputeStore {
    mapping(bytes32 => DisputePanel) panels;
    mapping(bytes32 => Dispute) disputes;
}

/// @title DisputeLib
/// @notice The dispute clock every family shares, linked once at deploy and
///         never changeable. The automatic arbiter may propose only an outcome
///         the deal's terms allow; it takes effect after a 72-hour appeal
///         window unless a side escalates. Escalated disputes go to the
///         reviewer fixed at opening, who has 5 days; after that the fallback
///         written into the terms applies. Every outcome is the seller's share
///         in basis points of the disputed amount, which the family pays out
///         only between the deal's parties.
library DisputeLib {
    uint64 internal constant PROPOSAL_WINDOW = 5 days;
    uint64 internal constant APPEAL_WINDOW = 72 hours;
    uint64 internal constant RULING_PERIOD = 5 days;
    /// The longest a dispute runs before someone can always end it.
    uint64 internal constant LONGEST = PROPOSAL_WINDOW + APPEAL_WINDOW + RULING_PERIOD;
    uint16 internal constant BPS = 10_000;

    event DisputeOpened(bytes32 indexed dealId, address indexed opener, bytes32 clauseHash);
    event RulingProposed(bytes32 indexed dealId, uint16 sellerBps, bytes32 rulingHash, uint64 appealEnds);
    event DisputeEscalated(bytes32 indexed dealId, address indexed by, uint64 rulingDue);
    event DisputeResolved(bytes32 indexed dealId, uint16 sellerBps, bytes32 rulingHash, uint8 how);

    error DisputeOpen();
    error NoDispute();
    error NotArbiter();
    error NotReviewer();
    error NotAllowed();
    error BadOutcome();
    error Early();
    error Late();

    uint8 internal constant BY_PROPOSAL = 1;
    uint8 internal constant BY_REVIEWER = 2;
    uint8 internal constant BY_FALLBACK = 3;

    function setPanel(DisputeStore storage ds, bytes32 dealId, address arbiter, address reviewer) external {
        ds.panels[dealId] = DisputePanel(arbiter, reviewer);
    }

    /// @notice Opens a dispute. The family has already checked the caller is a
    ///         party allowed to dispute now. With no arbiter, the dispute goes
    ///         straight to the reviewer.
    function open(DisputeStore storage ds, bytes32 dealId, bytes32 clauseHash) external {
        Dispute storage x = ds.disputes[dealId];
        if (x.openedAt != 0) revert DisputeOpen();
        x.opener = msg.sender;
        x.openedAt = uint64(block.timestamp);
        emit DisputeOpened(dealId, msg.sender, clauseHash);
        if (ds.panels[dealId].arbiter == address(0)) _escalate(x, dealId);
    }

    /// @notice The arbiter proposes once: a full refund, full payment, or the
    ///         partial share the terms name.
    function propose(DisputeStore storage ds, bytes32 dealId, uint16 sellerBps, bytes32 rulingHash, uint16 partialBps)
        external
    {
        if (msg.sender != ds.panels[dealId].arbiter) revert NotArbiter();
        Dispute storage x = _open(ds, dealId);
        if (x.escalated || x.proposed) revert NotAllowed();
        if (sellerBps != 0 && sellerBps != BPS && (partialBps == 0 || sellerBps != partialBps)) revert BadOutcome();
        x.proposed = true;
        x.proposedBps = sellerBps;
        x.proposedAt = uint64(block.timestamp);
        emit RulingProposed(dealId, sellerBps, rulingHash, uint64(block.timestamp) + APPEAL_WINDOW);
    }

    /// @notice Sends the dispute to the reviewer: a party appealing a proposal
    ///         within its window, anyone once the arbiter has let the proposal
    ///         window pass, or the arbiter itself at any time.
    function escalate(DisputeStore storage ds, bytes32 dealId, bool isParty) external {
        Dispute storage x = _open(ds, dealId);
        if (x.escalated) revert NotAllowed();
        if (msg.sender != ds.panels[dealId].arbiter) {
            if (x.proposed) {
                if (!isParty) revert NotAllowed();
                if (block.timestamp >= uint256(x.proposedAt) + APPEAL_WINDOW) revert Late();
            } else if (block.timestamp < uint256(x.openedAt) + PROPOSAL_WINDOW) {
                revert Early();
            }
        }
        _escalate(x, dealId);
    }

    /// @notice Anyone applies a proposal nobody appealed in time.
    function executeProposal(DisputeStore storage ds, bytes32 dealId) external returns (uint16 bps, uint64 openedAt) {
        Dispute storage x = _open(ds, dealId);
        if (x.escalated || !x.proposed) revert NotAllowed();
        if (block.timestamp < uint256(x.proposedAt) + APPEAL_WINDOW) revert Early();
        bps = x.proposedBps;
        openedAt = _close(ds, dealId, bps, bytes32(0), BY_PROPOSAL);
    }

    /// @notice The reviewer fixed at opening rules any share, within 5 days.
    function rule(DisputeStore storage ds, bytes32 dealId, uint16 sellerBps, bytes32 rulingHash)
        external
        returns (uint64 openedAt)
    {
        if (msg.sender != ds.panels[dealId].reviewer) revert NotReviewer();
        Dispute storage x = _open(ds, dealId);
        if (!x.escalated) revert NotAllowed();
        if (block.timestamp >= uint256(x.escalatedAt) + RULING_PERIOD) revert Late();
        if (sellerBps > BPS) revert BadOutcome();
        openedAt = _close(ds, dealId, sellerBps, rulingHash, BY_REVIEWER);
    }

    /// @notice Once the reviewer misses the ruling deadline, anyone applies
    ///         the fallback share written into the terms.
    function applyFallback(DisputeStore storage ds, bytes32 dealId, uint16 fallbackBps)
        external
        returns (uint64 openedAt)
    {
        Dispute storage x = _open(ds, dealId);
        if (!x.escalated) revert NotAllowed();
        if (block.timestamp < uint256(x.escalatedAt) + RULING_PERIOD) revert Early();
        openedAt = _close(ds, dealId, fallbackBps, bytes32(0), BY_FALLBACK);
    }

    /// @notice Ends a dispute the parties settled themselves, if one is open.
    function drop(DisputeStore storage ds, bytes32 dealId) external {
        delete ds.disputes[dealId];
    }

    function _open(DisputeStore storage ds, bytes32 dealId) private view returns (Dispute storage x) {
        x = ds.disputes[dealId];
        if (x.openedAt == 0) revert NoDispute();
    }

    function _escalate(Dispute storage x, bytes32 dealId) private {
        x.escalated = true;
        x.escalatedAt = uint64(block.timestamp);
        emit DisputeEscalated(dealId, msg.sender, uint64(block.timestamp) + RULING_PERIOD);
    }

    function _close(DisputeStore storage ds, bytes32 dealId, uint16 bps, bytes32 rulingHash, uint8 how)
        private
        returns (uint64 openedAt)
    {
        openedAt = ds.disputes[dealId].openedAt;
        delete ds.disputes[dealId];
        emit DisputeResolved(dealId, bps, rulingHash, how);
    }
}
