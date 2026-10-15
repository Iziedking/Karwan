// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementStore} from "../settlement/SettlementLib.sol";
import {DisputeLib} from "../dispute/DisputeLib.sol";
import {TimeStore} from "./TimeTypes.sol";
import {TimeLib} from "./TimeLib.sol";

/// @title TimeDisputeLib
/// @notice The dispute on a cycle's objected units, on the clock every family
///         shares: the arbiter fixed at opening proposes no pay, full pay or the
///         partial share the terms name; a side can appeal within 72 hours; the
///         reviewer rules within 5 days; otherwise the fallback in the terms
///         applies. Every outcome is the worker's share of the objected units'
///         price, and the cycle settles with it.
library TimeDisputeLib {
    error NotDisputed();

    function propose(TimeStore storage g, bytes32 id, uint16 k, uint16 workerBps, bytes32 rulingHash) external {
        _disputed(g, id, k);
        uint16 partialBps = g.terms[id][g.cycles[id][k].version].partialBps;
        DisputeLib.propose(g.disputes, TimeLib.cycleKey(id, k), workerBps, rulingHash, partialBps);
    }

    function escalate(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k) external {
        _disputed(g, id, k);
        bool party = msg.sender == s.accounts[id].payer || msg.sender == g.terms[id][0].worker;
        DisputeLib.escalate(g.disputes, TimeLib.cycleKey(id, k), party);
    }

    function executeRuling(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k) external {
        _disputed(g, id, k);
        TimeLib._notHeld(s, id);
        (uint16 bps,) = DisputeLib.executeProposal(g.disputes, TimeLib.cycleKey(id, k));
        TimeLib.payRuling(s, g, id, k, bps);
    }

    function rule(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k, uint16 workerBps, bytes32 rulingHash)
        external
    {
        _disputed(g, id, k);
        DisputeLib.rule(g.disputes, TimeLib.cycleKey(id, k), workerBps, rulingHash);
        TimeLib.payRuling(s, g, id, k, workerBps);
    }

    function applyFallback(SettlementStore storage s, TimeStore storage g, bytes32 id, uint16 k) external {
        _disputed(g, id, k);
        TimeLib._notHeld(s, id);
        uint16 bps = g.terms[id][g.cycles[id][k].version].fallbackBps;
        DisputeLib.applyFallback(g.disputes, TimeLib.cycleKey(id, k), bps);
        TimeLib.payRuling(s, g, id, k, bps);
    }

    function _disputed(TimeStore storage g, bytes32 id, uint16 k) private view {
        if (g.cycles[id][k].state != TimeLib.DISPUTED) revert NotDisputed();
    }
}
