// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KarwanReputation
/// @notice Records deal-completion outcomes. Companion to ERC-8004 ReputationRegistry.
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

    mapping(address => Score) public scores;
    mapping(bytes32 => bool) public recorded; // jobId → already-recorded marker

    event CompletionRecorded(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed seller,
        Outcome outcome
    );

    error AlreadyRecorded();
    error InvalidOutcome();
    error NotParty();

    function recordCompletion(bytes32 jobId, address buyer, address seller, Outcome outcome)
        external
    {
        if (recorded[jobId]) revert AlreadyRecorded();
        if (outcome == Outcome.None) revert InvalidOutcome();
        // Anti-self-dealing per ERC-8004: caller must be a counterparty,
        // not the subject they're rating.
        if (msg.sender != buyer && msg.sender != seller) revert NotParty();

        recorded[jobId] = true;

        // Caller rates the *other* party.
        address subject = msg.sender == buyer ? seller : buyer;
        Score storage s = scores[subject];
        if (outcome == Outcome.Success) s.successCount += 1;
        else if (outcome == Outcome.DisputeResolved) s.disputedCount += 1;
        else s.failedCount += 1;

        emit CompletionRecorded(jobId, buyer, seller, outcome);
    }

    /// @notice Composite reputation: success-weighted, dispute neutral, failure penalty.
    /// @dev Returns a score in basis points (0–10000). 5000 = neutral.
    function getReputationScore(address party) external view returns (uint256) {
        Score memory s = scores[party];
        uint256 total = s.successCount + s.disputedCount + s.failedCount;
        if (total == 0) return 5000;
        // weight: success=+1.0, dispute=0, failed=-1.0 → normalize to 0..10000
        uint256 numerator = s.successCount * 10000;
        uint256 denominator = total;
        // penalize failures by subtracting their share at full weight
        uint256 raw = numerator / denominator;
        uint256 penalty = (s.failedCount * 10000) / total;
        if (penalty >= raw) return 0;
        return raw - penalty;
    }
}
