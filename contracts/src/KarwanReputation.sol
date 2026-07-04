// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KarwanReputation v2
/// @notice Records deal-completion outcomes. Companion to ERC-8004
///         ReputationRegistry.
///
///         v2 vs the v2.E deploy:
///           - Escrow pointer is OWNER-SETTABLE (audit D1) so a future escrow
///             redeploy is a repoint, not a one-shot cascade.
///           - Value-weighted scoring (audit M-1): recordCompletion carries the
///             deal amount; the contract accumulates per-identity settled value
///             alongside the raw counts. Deals below minCreditAmount still count
///             but add zero value weight.
///           - recordResolution(sellerBps) for arbiter outcomes: the escrow
///             hands the raw split and the contract bands it.
///           - Penalty annulment (audit L-3): recordPenalty assigns an id;
///             annulPenalty reverses it, gated to a securityCouncil.
///           - Two-step ownership; owner-gated backfill for the v1 -> v2
///             migration, self-locking via lockBackfill.
///
///         Preserved from v1:
///           - Only the wired KarwanEscrow may record trade outcomes (C.4).
///           - Outcome credit is SYMMETRIC across both parties (#210).
///           - ERC-8004 validator wallet separation: penalty + finance signers
///             are distinct one-shot roles.
contract KarwanReputation {
    enum Outcome {
        None,
        Success,
        DisputeResolved,
        Failed
    }

    enum FinanceOutcome {
        None,
        Repaid,
        Defaulted
    }

    struct Score {
        uint256 successCount;
        uint256 disputedCount;
        uint256 failedCount;
    }

    struct Financier {
        uint256 fundedCount;
        uint256 repaidCount;
        uint256 defaultedCount;
    }

    struct Penalty {
        address subject;
        uint8 severity;
        bool annulled;
    }

    // ------------------------------- Roles -------------------------------

    address public owner;
    address public pendingOwner;

    /// @notice The KarwanEscrow authorised to record outcomes. Owner-settable
    ///         (D1) so an escrow redeploy repoints instead of cascading.
    address public escrow;

    /// @notice Council that can annul a penalty (audit L-3). Owner-set.
    address public securityCouncil;

    /// @notice One-shot signer slots (validator separation preserved).
    address public securityAgentSigner;
    address public penaltyAdmin;
    address public financeSigner;
    address public financeAdmin;

    // ------------------------------- State -------------------------------

    mapping(address => Score) public scores;
    /// @notice Cumulative USDC value of creditable settled deals per identity
    ///         (audit M-1). The composite engine weights standing by real value.
    mapping(address => uint256) public settledValue;
    /// @notice Distinct settled counterparties per identity — the anti-farming
    ///         keystone. A self-dealing ring or a buddy pair inflates counts and
    ///         settledValue but never this, so the off-chain composite gates
    ///         ELITE/STRONG on distinct breadth, not raw volume. Bumped once, the
    ///         first time a given unordered pair settles.
    mapping(address => uint256) public distinctCounterparties;
    /// @notice Settled deal count per unordered {a,b} pair (keyed by _pairKey),
    ///         so a buyer/seller role swap across deals hits one slot. Drives the
    ///         composite's geometric per-pair diminishing returns (the k-th
    ///         same-pair deal is worth ~half the (k-1)-th).
    mapping(bytes32 => uint256) public pairDeals;
    mapping(address => Financier) public financiers;
    mapping(bytes32 => bool) public recorded;
    mapping(bytes32 => bool) public financingRecorded;
    mapping(address => uint256) public penaltySeverity;

    /// @notice Penalties by id, for annulment.
    mapping(uint256 => Penalty) public penalties;
    uint256 public penaltyCount;

    /// @notice Minimum deal size that earns value weight. Below it a completion
    ///         still increments counts but adds no settled value. Owner-set;
    ///         6-decimal USDC (default 25 USDC).
    uint256 public minCreditAmount = 25e6;

    /// @notice Migration backfill switch. Owner may seed v1 state until locked.
    bool public backfillLocked;

    // ------------------------------ Events -------------------------------

    event CompletionRecorded(
        bytes32 indexed jobId, address indexed buyer, address indexed seller, Outcome outcome, uint256 dealAmount
    );
    event ResolutionRecorded(
        bytes32 indexed jobId, address indexed buyer, address indexed seller, uint16 sellerBps, uint256 dealAmount
    );
    event EscrowSet(address indexed escrow);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SecurityCouncilSet(address indexed council);
    event MinCreditAmountSet(uint256 amount);
    event SecurityAgentSignerSet(address indexed signer);
    event FinanceSignerSet(address indexed signer);
    event FinancingRecorded(
        bytes32 indexed fundingId, address indexed financier, FinanceOutcome outcome, uint64 timestamp
    );
    event PenaltyRecorded(
        uint256 indexed penaltyId, address indexed subject, uint8 severity, bytes32 indexed reasonHash, uint64 timestamp
    );
    event PenaltyAnnulled(uint256 indexed penaltyId, address indexed subject, uint8 severity);
    event Backfilled(address indexed subject, uint256 successCount, uint256 disputedCount, uint256 failedCount, uint256 settledValue);
    /// @notice Emitted on every recorded outcome so an indexer can reconstruct
    ///         diversity without re-reading the pair map. pairCount is the new
    ///         {buyer,seller} total; the distinct fields are each side's running
    ///         distinct-counterparty count after this settlement.
    event PairSettled(
        address indexed buyer, address indexed seller, uint256 pairCount, uint256 buyerDistinct, uint256 sellerDistinct
    );
    event DiversityBackfilled(address indexed subject, uint256 partyCount);
    event BackfillLocked();

    // ------------------------------ Errors -------------------------------

    error AlreadyRecorded();
    error InvalidOutcome();
    error NotEscrow();
    error NotOwner();
    error EscrowNotSet();
    error ZeroAddress();
    error NotPenaltyAdmin();
    error SignerAlreadySet();
    error SignerNotSet();
    error NotSecurityAgentSigner();
    error NotSecurityCouncil();
    error InvalidSeverity();
    error InvalidBps();
    error NotFinanceAdmin();
    error NotFinanceSigner();
    error AlreadyAnnulled();
    error UnknownPenalty();
    error BackfillLockedError();
    error LengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        penaltyAdmin = msg.sender;
        financeAdmin = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------- Ownership ------------------------------

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    /// @notice Set (or repoint) the escrow allowed to record outcomes (D1).
    function setEscrow(address _escrow) external onlyOwner {
        if (_escrow == address(0)) revert ZeroAddress();
        escrow = _escrow;
        emit EscrowSet(_escrow);
    }

    function setSecurityCouncil(address council) external onlyOwner {
        if (council == address(0)) revert ZeroAddress();
        securityCouncil = council;
        emit SecurityCouncilSet(council);
    }

    function setMinCreditAmount(uint256 amount) external onlyOwner {
        minCreditAmount = amount;
        emit MinCreditAmountSet(amount);
    }

    // -------------------------- Trade outcomes ---------------------------

    /// @notice Record a deal outcome against BOTH parties, value-weighted.
    ///           Success         -> both successCount++; seller + buyer settledValue += dealAmount (if creditable)
    ///           DisputeResolved -> both disputedCount++
    ///           Failed          -> buyer successCount++, seller failedCount++
    function recordCompletion(
        bytes32 jobId,
        address buyer,
        address seller,
        Outcome outcome,
        uint256 dealAmount
    ) external {
        if (msg.sender != escrow) revert NotEscrow();
        if (recorded[jobId]) revert AlreadyRecorded();
        if (outcome == Outcome.None) revert InvalidOutcome();
        recorded[jobId] = true;
        _applyOutcome(buyer, seller, outcome, dealAmount);
        emit CompletionRecorded(jobId, buyer, seller, outcome, dealAmount);
    }

    /// @notice Record an arbiter resolution. The escrow passes the raw split;
    ///         this bands it into an outcome. >= 8000 seller-favoured = Success,
    ///         <= 2000 = Failed, else DisputeResolved.
    function recordResolution(
        bytes32 jobId,
        address buyer,
        address seller,
        uint16 sellerBps,
        uint256 dealAmount
    ) external {
        if (msg.sender != escrow) revert NotEscrow();
        if (recorded[jobId]) revert AlreadyRecorded();
        if (sellerBps > 10000) revert InvalidBps();
        recorded[jobId] = true;
        Outcome outcome = sellerBps >= 8000
            ? Outcome.Success
            : (sellerBps <= 2000 ? Outcome.Failed : Outcome.DisputeResolved);
        _applyOutcome(buyer, seller, outcome, dealAmount);
        emit ResolutionRecorded(jobId, buyer, seller, sellerBps, dealAmount);
    }

    /// @dev Order-independent key for a counterparty pair, so pairDeals[{a,b}]
    ///      is a single slot regardless of who was buyer vs seller on a deal.
    function _pairKey(address a, address b) private pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _applyOutcome(address buyer, address seller, Outcome outcome, uint256 dealAmount) internal {
        // Diversity accounting runs on EVERY outcome (success, disputed, failed):
        // a distinct real counterparty relationship exists regardless of how the
        // deal ended, and a failed deal can't be farmed for standing because it
        // still lands as failedCount on the seller. First time a pair settles,
        // both sides gain a distinct counterparty; repeats only deepen the pair.
        bytes32 pk = _pairKey(buyer, seller);
        if (pairDeals[pk] == 0) {
            distinctCounterparties[buyer] += 1;
            distinctCounterparties[seller] += 1;
        }
        pairDeals[pk] += 1;
        emit PairSettled(buyer, seller, pairDeals[pk], distinctCounterparties[buyer], distinctCounterparties[seller]);

        bool creditable = dealAmount >= minCreditAmount;
        if (outcome == Outcome.Success) {
            scores[buyer].successCount += 1;
            scores[seller].successCount += 1;
            if (creditable) {
                settledValue[buyer] += dealAmount;
                settledValue[seller] += dealAmount;
            }
        } else if (outcome == Outcome.DisputeResolved) {
            scores[buyer].disputedCount += 1;
            scores[seller].disputedCount += 1;
        } else {
            // Failed: buyer honoured in good faith, seller took the failure.
            scores[buyer].successCount += 1;
            scores[seller].failedCount += 1;
        }
    }

    // ----------------------------- Penalties -----------------------------

    function setSecurityAgentSigner(address _signer) external {
        if (msg.sender != penaltyAdmin) revert NotPenaltyAdmin();
        if (securityAgentSigner != address(0)) revert SignerAlreadySet();
        if (_signer == address(0)) revert ZeroAddress();
        securityAgentSigner = _signer;
        penaltyAdmin = address(0);
        emit SecurityAgentSignerSet(_signer);
    }

    /// @notice Record a confirmed-malicious penalty. Assigns an id so it can be
    ///         annulled later (audit L-3).
    function recordPenalty(address subject, uint8 severity, bytes32 reasonHash)
        external
        returns (uint256 penaltyId)
    {
        if (securityAgentSigner == address(0)) revert SignerNotSet();
        if (msg.sender != securityAgentSigner) revert NotSecurityAgentSigner();
        if (subject == address(0)) revert ZeroAddress();
        if (severity == 0) revert InvalidSeverity();

        penaltyId = ++penaltyCount;
        penalties[penaltyId] = Penalty({subject: subject, severity: severity, annulled: false});
        penaltySeverity[subject] += severity;
        emit PenaltyRecorded(penaltyId, subject, severity, reasonHash, uint64(block.timestamp));
    }

    /// @notice Reverse a penalty (audit L-3). securityCouncil-only, event-logged.
    ///         Idempotent-guarded: a second annul of the same id reverts.
    function annulPenalty(uint256 penaltyId) external {
        if (securityCouncil == address(0) || msg.sender != securityCouncil) revert NotSecurityCouncil();
        Penalty storage p = penalties[penaltyId];
        if (p.subject == address(0)) revert UnknownPenalty();
        if (p.annulled) revert AlreadyAnnulled();
        p.annulled = true;
        penaltySeverity[p.subject] -= p.severity;
        emit PenaltyAnnulled(penaltyId, p.subject, p.severity);
    }

    // ---------------------------- Financing ------------------------------

    function setFinanceSigner(address _signer) external {
        if (msg.sender != financeAdmin) revert NotFinanceAdmin();
        if (financeSigner != address(0)) revert SignerAlreadySet();
        if (_signer == address(0)) revert ZeroAddress();
        financeSigner = _signer;
        financeAdmin = address(0);
        emit FinanceSignerSet(_signer);
    }

    function recordFinancing(bytes32 fundingId, address financier, FinanceOutcome outcome) external {
        if (financeSigner == address(0)) revert SignerNotSet();
        if (msg.sender != financeSigner) revert NotFinanceSigner();
        if (financier == address(0)) revert ZeroAddress();
        if (outcome == FinanceOutcome.None) revert InvalidOutcome();
        if (financingRecorded[fundingId]) revert AlreadyRecorded();

        financingRecorded[fundingId] = true;
        financiers[financier].fundedCount += 1;
        if (outcome == FinanceOutcome.Repaid) {
            financiers[financier].repaidCount += 1;
        } else {
            financiers[financier].defaultedCount += 1;
        }
        emit FinancingRecorded(fundingId, financier, outcome, uint64(block.timestamp));
    }

    // ----------------------------- Migration -----------------------------

    /// @notice Seed a v1 identity's counts + settled value during migration.
    ///         Owner-only, additive, disabled once lockBackfill fires.
    function backfill(
        address subject,
        uint256 successCount,
        uint256 disputedCount,
        uint256 failedCount,
        uint256 settledValue_
    ) external onlyOwner {
        if (backfillLocked) revert BackfillLockedError();
        if (subject == address(0)) revert ZeroAddress();
        scores[subject].successCount += successCount;
        scores[subject].disputedCount += disputedCount;
        scores[subject].failedCount += failedCount;
        settledValue[subject] += settledValue_;
        emit Backfilled(subject, successCount, disputedCount, failedCount, settledValue_);
    }

    /// @notice Seed a v1 identity's distinct-counterparty history during the v2
    ///         migration. For each prior counterparty it seeds the unordered
    ///         pair count and, on a first-seen pair, bumps BOTH sides' distinct
    ///         count, so post-migration a repeat deal with a known partner is
    ///         correctly recognised (pairDeals > 0) instead of counting as new.
    ///         Additive and one-shot like backfill(): the migration script MUST
    ///         pass each unordered pair EXACTLY once (walk each identity's
    ///         adjacency list and skip a partner already processed as a subject)
    ///         or pair counts double. Disabled once lockBackfill fires.
    function backfillDiversity(address subject, address[] calldata parties, uint256[] calldata counts)
        external
        onlyOwner
    {
        if (backfillLocked) revert BackfillLockedError();
        if (subject == address(0)) revert ZeroAddress();
        uint256 n = parties.length;
        if (n != counts.length) revert LengthMismatch();
        for (uint256 i = 0; i < n; i++) {
            address party = parties[i];
            if (party == address(0)) revert ZeroAddress();
            uint256 cnt = counts[i];
            if (cnt == 0) continue;
            bytes32 pk = _pairKey(subject, party);
            if (pairDeals[pk] == 0) {
                distinctCounterparties[subject] += 1;
                distinctCounterparties[party] += 1;
            }
            pairDeals[pk] += cnt;
        }
        emit DiversityBackfilled(subject, n);
    }

    function lockBackfill() external onlyOwner {
        backfillLocked = true;
        emit BackfillLocked();
    }

    // ------------------------------- Views -------------------------------

    /// @notice Settled deal count between two identities, order-independent.
    ///         The composite reads this to apply per-pair diminishing returns.
    function pairDealCount(address a, address b) external view returns (uint256) {
        return pairDeals[_pairKey(a, b)];
    }

    /// @notice Legacy composite badge (0-10000, 5000 neutral). Kept for the
    ///         v1 frontend; the v2 engine reads scores() + settledValue().
    function getReputationScore(address party) external view returns (uint256) {
        Score memory s = scores[party];
        uint256 total = s.successCount + s.disputedCount + s.failedCount;
        if (total == 0) return 5000;
        uint256 raw = (s.successCount * 10000) / total;
        uint256 penalty = (s.failedCount * 10000) / total;
        if (penalty >= raw) return 0;
        return raw - penalty;
    }
}
