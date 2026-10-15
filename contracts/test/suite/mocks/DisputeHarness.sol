// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DisputeStore, Dispute, DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";

/// @notice Runs the shared dispute clock on its own, the way a family would,
///         so its rules are tested apart from any family's money.
contract DisputeHarness {
    DisputeStore internal _ds;
    uint16 public lastBps;
    uint64 public lastOpenedAt;

    function setPanel(bytes32 dealId, address arbiter, address reviewer) external {
        DisputeLib.setPanel(_ds, dealId, arbiter, reviewer);
    }

    function open(bytes32 dealId) external {
        DisputeLib.open(_ds, dealId, keccak256("clause"));
    }

    function propose(bytes32 dealId, uint16 bps, uint16 partialBps) external {
        DisputeLib.propose(_ds, dealId, bps, keccak256("proposal"), partialBps);
    }

    function escalate(bytes32 dealId, bool isParty) external {
        DisputeLib.escalate(_ds, dealId, isParty);
    }

    function executeProposal(bytes32 dealId) external {
        (lastBps, lastOpenedAt) = DisputeLib.executeProposal(_ds, dealId);
    }

    function rule(bytes32 dealId, uint16 bps) external {
        lastBps = bps;
        lastOpenedAt = DisputeLib.rule(_ds, dealId, bps, keccak256("ruling"));
    }

    function applyFallback(bytes32 dealId, uint16 fallbackBps) external {
        lastBps = fallbackBps;
        lastOpenedAt = DisputeLib.applyFallback(_ds, dealId, fallbackBps);
    }

    function drop(bytes32 dealId) external {
        DisputeLib.drop(_ds, dealId);
    }

    function disputeOf(bytes32 dealId) external view returns (Dispute memory) {
        return _ds.disputes[dealId];
    }
}
