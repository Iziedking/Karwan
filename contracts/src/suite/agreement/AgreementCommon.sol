// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub} from "../interfaces/IKarwanSuite.sol";
import {SettlementStore, SettlementLib} from "../settlement/SettlementLib.sol";
import {AgreementDeal} from "./AgreementTypes.sol";

/// @notice Small steps the Agreement libraries share. Internal, so each library
///         carries its own copy and nothing extra is linked.
library AgreementCommon {
    uint8 internal constant BUYER = 0;
    uint8 internal constant SELLER = 1;

    error OnHold();

    /// Moves the deal's horizon later, never earlier; a clock already past
    /// needs no room.
    function bumpHorizon(SettlementStore storage s, bytes32 dealId, uint256 horizon) internal {
        if (horizon <= block.timestamp) return;
        uint256 cap = block.timestamp + SettlementLib.MAX_HORIZON;
        SettlementLib.extendHorizon(s, dealId, uint64(horizon > cap ? cap : horizon));
    }

    function recordBoth(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, uint8 outcome, uint16 detail)
        internal
    {
        SettlementLib.recordOutcome(s, hub, dealId, BUYER, outcome, detail);
        SettlementLib.recordOutcome(s, hub, dealId, SELLER, outcome, detail);
    }

    /// Hold time used since the current delivery was marked.
    function holdSince(SettlementStore storage s, AgreementDeal storage d, bytes32 dealId)
        internal
        view
        returns (uint64)
    {
        return s.accounts[dealId].holdUsed - d.holdBase;
    }

    function notHeld(SettlementStore storage s, bytes32 dealId) internal view {
        if (s.accounts[dealId].holdUntil > block.timestamp) revert OnHold();
    }
}
