// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KarwanReputation
/// @notice Records deal-completion outcomes. Companion to ERC-8004
///         ReputationRegistry. After the v2.D redeploy:
///           - Only the KarwanEscrow contract can write (C.4). Removes the
///             "any counterparty agent can write its own deal outcome"
///             vector that mattered once users could self-host agents.
///           - Outcome credit is SYMMETRIC across both parties (#210).
///             Today only one side accumulates credits per deal; v2 mirrors
///             both so a buyer who's done 50 clean deals has on-chain
///             evidence equal to a seller with the same record.
contract KarwanReputation {
    enum Outcome {
        None,
        Success,
        DisputeResolved,
        Failed
    }

    struct Score {
        uint256 successCount;
        uint256 disputedCount;
        uint256 failedCount;
    }

    /// @notice The KarwanEscrow contract authorised to record outcomes.
    ///         Set once after deploy via setEscrow (deployer-only, one-shot)
    ///         so the contract can be deployed before the escrow address is
    ///         known. KarwanEscrow's constructor needs this contract's
    ///         address, so we can't make escrow immutable without a CREATE2
    ///         dance. The one-shot setter is the simpler pattern and
    ///         matches KarwanVault.
    address public escrow;
    /// @notice Holds the right to call setEscrow exactly once. Zeroed after
    ///         binding so the escrow address becomes effectively immutable
    ///         post-setup.
    address public deployer;

    mapping(address => Score) public scores;
    /// @dev jobId -> already-recorded marker. One record per deal, ever.
    mapping(bytes32 => bool) public recorded;

    event CompletionRecorded(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed seller,
        Outcome outcome
    );
    event EscrowSet(address indexed escrow);

    error AlreadyRecorded();
    error InvalidOutcome();
    error NotEscrow();
    error NotDeployer();
    error EscrowAlreadySet();
    error ZeroAddress();

    constructor() {
        deployer = msg.sender;
    }

    /// @notice Bind the escrow that's allowed to call recordCompletion.
    ///         One-shot. Reverts on a second call so the linkage is
    ///         effectively immutable after deployment.
    function setEscrow(address _escrow) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (_escrow == address(0)) revert ZeroAddress();
        escrow = _escrow;
        deployer = address(0);
        emit EscrowSet(_escrow);
    }

    /// @notice Record a deal outcome against BOTH parties. Symmetric:
    ///           Success         -> buyer.successCount++,   seller.successCount++
    ///           DisputeResolved -> buyer.disputedCount++,  seller.disputedCount++
    ///           Failed          -> buyer.successCount++,   seller.failedCount++
    /// @dev    Failed semantics: the buyer paid in good faith and got their
    ///         money back via refund; they did nothing wrong. The seller is
    ///         the one who didn't deliver, so they alone take the failure
    ///         credit. This matches the credit-bureau intuition where the
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

    /// @notice Composite reputation: success-weighted, dispute neutral,
    ///         failure penalty. Returns a score in basis points (0–10000).
    ///         5000 = neutral. Kept for backward-compat with the legacy
    ///         frontend badge; the v2 engine uses the raw counts via the
    ///         scores() getter and runs its own composite.
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
