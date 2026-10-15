// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub} from "../interfaces/IKarwanSuite.sol";
import {SettlementStore} from "../settlement/SettlementLib.sol";
import {DisputeLib} from "../dispute/DisputeLib.sol";
import {JobStore} from "./JobTypes.sol";
import {JobLib} from "./JobLib.sol";

/// @title JobDisputeLib
/// @notice The dispute on a rejected job, on the clock every family shares:
///         the arbiter fixed at funding proposes no pay, full pay or the
///         partial share the terms name; either side can appeal within 72
///         hours; the reviewer rules within 5 days; otherwise the fallback in
///         the terms applies. Every outcome is the provider's share of the
///         budget, and the job ends with it.
library JobDisputeLib {
    error NotDisputed();

    function propose(JobStore storage g, uint256 id, uint16 providerBps, bytes32 rulingHash) external {
        _disputed(g, id);
        DisputeLib.propose(g.disputes, bytes32(id), providerBps, rulingHash, g.jobs[id].partialBps);
    }

    function escalate(JobStore storage g, uint256 id) external {
        _disputed(g, id);
        bool party = msg.sender == g.jobs[id].client || msg.sender == g.jobs[id].provider;
        DisputeLib.escalate(g.disputes, bytes32(id), party);
    }

    function executeRuling(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id) external {
        _disputed(g, id);
        JobLib.notHeld(s, id);
        (uint16 bps,) = DisputeLib.executeProposal(g.disputes, bytes32(id));
        JobLib.payRuling(s, g, hub, id, bps);
    }

    function rule(
        SettlementStore storage s,
        JobStore storage g,
        IKarwanHub hub,
        uint256 id,
        uint16 providerBps,
        bytes32 rulingHash
    ) external {
        _disputed(g, id);
        DisputeLib.rule(g.disputes, bytes32(id), providerBps, rulingHash);
        JobLib.payRuling(s, g, hub, id, providerBps);
    }

    function applyFallback(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id) external {
        _disputed(g, id);
        JobLib.notHeld(s, id);
        DisputeLib.applyFallback(g.disputes, bytes32(id), g.jobs[id].fallbackBps);
        JobLib.payRuling(s, g, hub, id, g.jobs[id].fallbackBps);
    }

    function _disputed(JobStore storage g, uint256 id) private view {
        if (!g.jobs[id].disputed) revert NotDisputed();
    }
}
