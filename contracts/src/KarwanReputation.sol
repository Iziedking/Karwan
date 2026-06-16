// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KarwanReputation
/// @notice Records deal-completion outcomes. Companion to ERC-8004
///         ReputationRegistry. v2.E bundle adds:
///           - recordPenalty(subject, severity, reasonHash) for confirmed
///             malicious behaviour (delivery scams, dispute fraud). Gated to
///             a separate securityAgentSigner role wired via a one-shot
///             setter so the SecurityAgent can ship later without another
///             reputation redeploy. See [[karwan_security_agent]].
///           - cumulative penaltySeverity per subject so the off-chain
///             composite engine can apply a slash multiplier without a
///             second on-chain lookup.
///
///         Already-shipped in v2.D (kept for context):
///           - Only the KarwanEscrow contract can write outcomes (audit C.4).
///           - Outcome credit is SYMMETRIC across both parties (#210).
contract KarwanReputation {
    enum Outcome {
        None,
        Success,
        DisputeResolved,
        Failed
    }

    /// @notice Financier funding outcome. Repaid = the financier got their
    ///         capital back (factoring repayment leg cleared, or a PO line
    ///         repaid on settlement). Defaulted = the funded receivable / PO
    ///         did not repay. Kept distinct from trade Outcome so the off-chain
    ///         engine can weight a financier's track record on its own axis.
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

    /// @notice A wallet's financing track record, built over time from the
    ///         invoices and POs it funds. Portable on the same address as its
    ///         trade Score, so one wallet that both trades and finances carries
    ///         a single reputation. The off-chain composite folds these in.
    struct Financier {
        uint256 fundedCount;
        uint256 repaidCount;
        uint256 defaultedCount;
    }

    /// @notice The KarwanEscrow contract authorised to record outcomes.
    ///         Set once after deploy via setEscrow (deployer-only, one-shot)
    ///         so the contract can be deployed before the escrow address is
    ///         known. The escrow constructor needs this contract's address,
    ///         so we can't make `escrow` immutable without a CREATE2 dance.
    address public escrow;
    /// @notice Holds the right to call setEscrow exactly once. Zeroed after
    ///         binding so the escrow address becomes effectively immutable
    ///         post-setup.
    address public deployer;

    /// @notice Address authorised to call recordPenalty. The SecurityAgent
    ///         service (off-chain) signs from this key after confirming a
    ///         delivery as malicious. Set once via setSecurityAgentSigner so
    ///         we can ship the contract today and wire the signer when the
    ///         agent service is built.
    address public securityAgentSigner;
    /// @notice Holds the right to call setSecurityAgentSigner exactly once.
    ///         Distinct from `deployer` so the operational dance is separable:
    ///         the deployer self-zeros after escrow binding (which is
    ///         atomic with deploy), while the signer slot can stay armable
    ///         for as long as it takes to ship the SecurityAgent service.
    address public penaltyAdmin;

    /// @notice Address authorised to call recordFinancing. The factoring +
    ///         PO-financing settlement watchers (off-chain) sign from this key
    ///         when a funded receivable repays or defaults. Set once via
    ///         setFinanceSigner so the financier-reputation layer can light up
    ///         without another reputation redeploy.
    address public financeSigner;
    /// @notice Holds the right to call setFinanceSigner exactly once. Distinct
    ///         from deployer + penaltyAdmin so each signer slot is armable on
    ///         its own schedule.
    address public financeAdmin;

    mapping(address => Score) public scores;
    /// @notice Per-wallet financing track record. Read by the off-chain
    ///         composite engine to score and tier a financier.
    mapping(address => Financier) public financiers;
    /// @dev jobId -> already-recorded marker. One outcome record per deal.
    mapping(bytes32 => bool) public recorded;
    /// @dev fundingId -> already-recorded marker. One outcome per funding.
    mapping(bytes32 => bool) public financingRecorded;

    /// @notice Cumulative severity per subject. Increments on every
    ///         recordPenalty by the severity of the call (1=held-for-review
    ///         confirmed malicious, 2=repeat offender, 3=active campaign).
    ///         The off-chain composite engine consumes this directly.
    mapping(address => uint256) public penaltySeverity;

    event CompletionRecorded(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed seller,
        Outcome outcome
    );
    event EscrowSet(address indexed escrow);
    event SecurityAgentSignerSet(address indexed signer);
    event FinanceSignerSet(address indexed signer);
    /// @notice Emitted when a financier's funding outcome is recorded.
    /// @param fundingId stable id of the factoring offer or PO line
    /// @param financier the wallet whose track record is updated
    /// @param outcome   Repaid or Defaulted
    event FinancingRecorded(
        bytes32 indexed fundingId,
        address indexed financier,
        FinanceOutcome outcome,
        uint64 timestamp
    );
    /// @notice Emitted on confirmed malicious behaviour.
    /// @param subject the address being slashed
    /// @param severity 1..255, higher is worse; off-chain engine multiplies
    /// @param reasonHash sha256 of a JSON {jobId, engines, verdicts, ts}.
    ///                   On-chain trail without leaking the original URL.
    event PenaltyRecorded(
        address indexed subject,
        uint8 severity,
        bytes32 indexed reasonHash,
        uint64 timestamp
    );

    error AlreadyRecorded();
    error InvalidOutcome();
    error NotEscrow();
    error NotDeployer();
    error EscrowAlreadySet();
    error ZeroAddress();
    error NotPenaltyAdmin();
    error SignerAlreadySet();
    error SignerNotSet();
    error NotSecurityAgentSigner();
    error InvalidSeverity();
    error NotFinanceAdmin();
    error NotFinanceSigner();

    constructor() {
        deployer = msg.sender;
        // penaltyAdmin + financeAdmin start as the deployer too; deployer
        // self-zeros after setEscrow, while each signer slot lives on until its
        // own one-shot setter binds the operational wallet.
        penaltyAdmin = msg.sender;
        financeAdmin = msg.sender;
    }

    /// @notice Bind the escrow that's allowed to call recordCompletion.
    ///         One-shot.
    function setEscrow(address _escrow) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (_escrow == address(0)) revert ZeroAddress();
        escrow = _escrow;
        deployer = address(0);
        emit EscrowSet(_escrow);
    }

    /// @notice Bind the SecurityAgent signer wallet. One-shot. Reverts on a
    ///         second call so the signer slot becomes effectively immutable
    ///         after binding. Use a Circle DCW or multi-sig here, anything
    ///         that can sign the recordPenalty calls when the off-chain
    ///         engine flags a malicious delivery.
    function setSecurityAgentSigner(address _signer) external {
        if (msg.sender != penaltyAdmin) revert NotPenaltyAdmin();
        if (securityAgentSigner != address(0)) revert SignerAlreadySet();
        if (_signer == address(0)) revert ZeroAddress();
        securityAgentSigner = _signer;
        penaltyAdmin = address(0);
        emit SecurityAgentSignerSet(_signer);
    }

    /// @notice Record a deal outcome against BOTH parties.
    ///           Success         -> buyer.successCount++,   seller.successCount++
    ///           DisputeResolved -> buyer.disputedCount++,  seller.disputedCount++
    ///           Failed          -> buyer.successCount++,   seller.failedCount++
    /// @dev    Failed semantics: the buyer paid in good faith and got their
    ///         money back via refund; they did nothing wrong. The seller is
    ///         the one who didn't deliver, so they alone take the failure
    ///         credit. This matches credit-bureau intuition where the
    ///         honoring party gets a check mark even when the deal goes
    ///         sideways.
    function recordCompletion(bytes32 jobId, address buyer, address seller, Outcome outcome)
        external
    {
        if (msg.sender != escrow) revert NotEscrow();
        if (recorded[jobId]) revert AlreadyRecorded();
        if (outcome == Outcome.None) revert InvalidOutcome();

        recorded[jobId] = true;

        if (outcome == Outcome.Success) {
            scores[buyer].successCount += 1;
            scores[seller].successCount += 1;
        } else if (outcome == Outcome.DisputeResolved) {
            scores[buyer].disputedCount += 1;
            scores[seller].disputedCount += 1;
        } else {
            // Outcome.Failed
            scores[buyer].successCount += 1;
            scores[seller].failedCount += 1;
        }

        emit CompletionRecorded(jobId, buyer, seller, outcome);
    }

    /// @notice Record a confirmed-malicious penalty against a subject. Only
    ///         callable by the SecurityAgent signer. Subject is typically a
    ///         seller's identity wallet flagged for shipping a phishing URL
    ///         or similar.
    ///
    /// @param subject     identity wallet of the slashed party
    /// @param severity    1=held-for-review confirmed, 2=repeat, 3=campaign
    /// @param reasonHash  sha256 of a JSON {jobId, engines, verdicts, ts}
    ///                    so a third party can verify off-chain
    function recordPenalty(address subject, uint8 severity, bytes32 reasonHash) external {
        if (securityAgentSigner == address(0)) revert SignerNotSet();
        if (msg.sender != securityAgentSigner) revert NotSecurityAgentSigner();
        if (subject == address(0)) revert ZeroAddress();
        if (severity == 0) revert InvalidSeverity();

        penaltySeverity[subject] += severity;
        emit PenaltyRecorded(subject, severity, reasonHash, uint64(block.timestamp));
    }

    /// @notice Bind the finance signer wallet. One-shot, mirrors
    ///         setSecurityAgentSigner. Use a Circle DCW the factoring + PO
    ///         settlement watchers control.
    function setFinanceSigner(address _signer) external {
        if (msg.sender != financeAdmin) revert NotFinanceAdmin();
        if (financeSigner != address(0)) revert SignerAlreadySet();
        if (_signer == address(0)) revert ZeroAddress();
        financeSigner = _signer;
        financeAdmin = address(0);
        emit FinanceSignerSet(_signer);
    }

    /// @notice Record a financier's funding outcome. Only callable by the
    ///         finance signer. One record per fundingId, so a re-submit can't
    ///         double-count. Repaid builds the financier's standing; Defaulted
    ///         counts against it. The off-chain composite engine reads the
    ///         financiers() getter and folds the track record into the
    ///         financier's portable score.
    /// @param fundingId  stable id of the factoring offer or PO line
    /// @param financier  wallet whose track record is updated
    /// @param outcome    Repaid or Defaulted
    function recordFinancing(bytes32 fundingId, address financier, FinanceOutcome outcome)
        external
    {
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

    /// @notice Composite reputation: success-weighted, dispute neutral,
    ///         failure penalty. Returns a score in basis points (0–10000).
    ///         5000 = neutral. Kept for backward-compat with the legacy
    ///         frontend badge; the v2 engine uses the raw counts via the
    ///         scores() getter and runs its own composite that also folds
    ///         in penaltySeverity.
    function getReputationScore(address party) external view returns (uint256) {
        Score memory s = scores[party];
        uint256 total = s.successCount + s.disputedCount + s.failedCount;
        if (total == 0) return 5000;
        uint256 numerator = s.successCount * 10000;
        uint256 denominator = total;
        uint256 raw = numerator / denominator;
        uint256 penalty = (s.failedCount * 10000) / total;
        if (penalty >= raw) return 0;
        return raw - penalty;
    }
}
