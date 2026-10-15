// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, Outcome} from "../interfaces/IKarwanSuite.sol";
import {SettlementStore, SettlementLib} from "../settlement/SettlementLib.sol";
import {
    AgreementTerms, AgreementDeal, AgreementState, AgreementStore, AgreementCodes as C
} from "./AgreementTypes.sol";
import {AgreementDeliveryLib} from "./AgreementDeliveryLib.sol";
import {AgreementCommon} from "./AgreementCommon.sol";
import {DisputeLib} from "../dispute/DisputeLib.sol";

/// @title AgreementDisputeLib
/// @notice How an Agreement deal's disputes run and how a ruling is paid,
///         linked once at deploy and never changeable. The dispute clock is the
///         shared `DisputeLib`; this library decides who may dispute when, and
///         pays only the disputed tranche, only between the deal's parties.
library AgreementDisputeLib {
    event TrancheRuled(bytes32 indexed dealId, uint8 tranche, uint16 sellerBps, uint256 toSeller, uint256 toBuyer);

    error BadState();
    error BadCaller();
    error Late();

    /// @notice A party disputes the delivered tranche while the other side
    ///         cannot yet take it on the clock: the buyer before the seller can
    ///         claim, the seller before the buyer can reclaim. The deal's
    ///         clocks stop until the dispute ends.
    function dispute(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, bytes32 clauseHash) external {
        AgreementDeal storage d = g.deals[dealId];
        AgreementTerms storage t = g.terms[dealId];
        if (d.state != AgreementState.Accepted || d.deliveredAt == 0) revert BadState();
        if (msg.sender == s.accounts[dealId].payer) {
            if (AgreementDeliveryLib.claimBar(d, t, AgreementCommon.holdSince(s, d, dealId)) == 0) revert Late();
        } else if (msg.sender == t.seller) {
            if (AgreementDeliveryLib.reclaimBar(d, t) == 0) revert Late();
        } else {
            revert BadCaller();
        }
        d.state = AgreementState.Disputed;
        DisputeLib.open(g.disputes, dealId, clauseHash);
        AgreementCommon.bumpHorizon(s, dealId, block.timestamp + DisputeLib.LONGEST);
        AgreementCommon.keepStake(s, g, dealId);
    }

    function proposeRuling(AgreementStore storage g, bytes32 dealId, uint16 sellerBps, bytes32 rulingHash) external {
        _disputed(g, dealId);
        DisputeLib.propose(g.disputes, dealId, sellerBps, rulingHash, g.terms[dealId].partialBps);
    }

    function escalate(SettlementStore storage s, AgreementStore storage g, bytes32 dealId) external {
        _disputed(g, dealId);
        bool party = msg.sender == s.accounts[dealId].payer || msg.sender == g.terms[dealId].seller;
        DisputeLib.escalate(g.disputes, dealId, party);
        AgreementCommon.bumpHorizon(s, dealId, block.timestamp + DisputeLib.RULING_PERIOD);
        AgreementCommon.keepStake(s, g, dealId);
    }

    function executeRuling(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId)
        external
    {
        AgreementCommon.notHeld(s, dealId);
        _disputed(g, dealId);
        (uint16 bps, uint64 openedAt) = DisputeLib.executeProposal(g.disputes, dealId);
        _ruleTranche(s, g, hub, dealId, bps, openedAt);
    }

    function rule(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 dealId,
        uint16 sellerBps,
        bytes32 rulingHash
    ) external {
        _disputed(g, dealId);
        uint64 openedAt = DisputeLib.rule(g.disputes, dealId, sellerBps, rulingHash);
        _ruleTranche(s, g, hub, dealId, sellerBps, openedAt);
    }

    function applyFallback(SettlementStore storage s, AgreementStore storage g, IKarwanHub hub, bytes32 dealId)
        external
    {
        AgreementCommon.notHeld(s, dealId);
        _disputed(g, dealId);
        uint16 bps = g.terms[dealId].fallbackBps;
        uint64 openedAt = DisputeLib.applyFallback(g.disputes, dealId, bps);
        _ruleTranche(s, g, hub, dealId, bps, openedAt);
    }

    /// A dispute ends: the deal runs again and its deadline moves by the time
    /// the dispute held it.
    function endDispute(SettlementStore storage s, AgreementStore storage g, bytes32 dealId, uint64 openedAt) public {
        AgreementDeal storage d = g.deals[dealId];
        AgreementTerms storage t = g.terms[dealId];
        d.state = AgreementState.Accepted;
        d.deadline += uint64(block.timestamp) - openedAt;
        AgreementCommon.bumpHorizon(s, dealId, uint256(d.deadline) + t.reclaimGrace + t.startLongstop + t.silentLongstop);
    }

    /// Pays the disputed tranche by the ruling: the seller's share to the
    /// seller with the fee in proportion, the rest to the buyer. Later
    /// tranches carry on.
    function _ruleTranche(
        SettlementStore storage s,
        AgreementStore storage g,
        IKarwanHub hub,
        bytes32 dealId,
        uint16 sellerBps,
        uint64 openedAt
    ) private {
        endDispute(s, g, dealId, openedAt);
        AgreementDeal storage d = g.deals[dealId];
        (uint256 net, uint256 fee, bool last) = AgreementDeliveryLib.nextTranche(d, g.terms[dealId]);
        uint256 toSeller = (net * sellerBps) / C.BPS;
        uint256 feeCut = (fee * sellerBps) / C.BPS;
        uint256 toBuyer = (net - toSeller) + (fee - feeCut);
        SettlementLib.payTo(s, dealId, g.terms[dealId].seller, toSeller);
        SettlementLib.payFee(s, dealId, feeCut);
        SettlementLib.payTo(s, dealId, s.accounts[dealId].payer, toBuyer);
        emit TrancheRuled(dealId, d.paid - 1, sellerBps, toSeller, toBuyer);
        AgreementTerms storage t = g.terms[dealId];
        if (t.sellerStake != 0) {
            // The buyer's share of this tranche's share of the stake.
            uint256 slash = (uint256(t.sellerStake) * (C.BPS - sellerBps) * net) / (uint256(C.BPS) * d.sellerNet);
            AgreementCommon.slashStake(hub, dealId, slash);
        }
        if (last) {
            d.state = AgreementState.Ruled;
            SettlementLib.close(s, dealId);
            AgreementCommon.releaseStake(hub, t, dealId);
            AgreementCommon.recordBoth(s, hub, dealId, Outcome.RULED, sellerBps);
        }
        AgreementCommon.keepStake(s, g, dealId);
    }

    function _disputed(AgreementStore storage g, bytes32 dealId) private view {
        if (g.deals[dealId].state != AgreementState.Disputed) revert BadState();
    }
}
