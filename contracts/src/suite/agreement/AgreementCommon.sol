// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, IKarwanStakeVault} from "../interfaces/IKarwanSuite.sol";
import {SettlementStore, SettlementLib} from "../settlement/SettlementLib.sol";
import {AgreementDeal, AgreementStore, AgreementTerms} from "./AgreementTypes.sol";

/// @notice Small steps the Agreement libraries share. Internal, so each library
///         carries its own copy and nothing extra is linked.
library AgreementCommon {
    uint8 internal constant BUYER = 0;
    uint8 internal constant SELLER = 1;
    /// A seller's stake stays reserved this long past the deal's long-stop.
    uint64 internal constant STAKE_SLACK = 30 days;
    uint8 internal constant STAKE_RELEASE = 0;
    uint8 internal constant STAKE_SLASH = 1;
    uint8 internal constant STAKE_KEEP = 2;

    event StakeHookFailed(bytes32 indexed dealId, uint8 hook);

    error OnHold();

    function stakeExpiry(SettlementStore storage s, bytes32 dealId) internal view returns (uint64) {
        return s.accounts[dealId].horizon + SettlementLib.LONGSTOP + STAKE_SLACK;
    }

    /// Frees the seller's stake at a deal's end. The vault is an outside
    /// contract to this deal, so a failure is logged and never blocks the exit.
    function releaseStake(IKarwanHub hub, AgreementTerms storage t, bytes32 dealId) internal {
        if (t.sellerStake == 0) return;
        try IKarwanStakeVault(hub.stakeVault()).release(dealId) {}
        catch {
            emit StakeHookFailed(dealId, STAKE_RELEASE);
        }
    }

    /// Pays `amount` of the seller's stake to the buyer, as a ruling decided.
    function slashStake(IKarwanHub hub, bytes32 dealId, uint256 amount) internal {
        if (amount == 0) return;
        try IKarwanStakeVault(hub.stakeVault()).slash(dealId, amount) returns (uint256) {}
        catch {
            emit StakeHookFailed(dealId, STAKE_SLASH);
        }
    }

    /// Moves the deal's horizon later, never earlier; a clock already past
    /// needs no room. A step that moves it ends with `keepStake`.
    function bumpHorizon(SettlementStore storage s, bytes32 dealId, uint256 horizon) internal {
        if (horizon <= block.timestamp) return;
        uint256 cap = block.timestamp + SettlementLib.MAX_HORIZON;
        SettlementLib.extendHorizon(s, dealId, uint64(horizon > cap ? cap : horizon));
    }

    /// Moves the seller's stake reservation to outlast the deal's horizon, as
    /// the last step of anything that can move the horizon. A vault that
    /// refuses is logged and never blocks the deal; `keepStake` on the escrow
    /// tries again.
    function keepStake(SettlementStore storage s, AgreementStore storage g, bytes32 dealId) internal {
        IKarwanStakeVault vault = IKarwanStakeVault(g.stakeVault);
        if (g.terms[dealId].sellerStake == 0 || address(vault) == address(0)) return;
        uint64 want = stakeExpiry(s, dealId);
        try vault.expiryOf(address(this), dealId) returns (uint64 until) {
            if (until == 0 || want <= until) return;
            try vault.extend(dealId, want) {}
            catch {
                emit StakeHookFailed(dealId, STAKE_KEEP);
            }
        } catch {
            emit StakeHookFailed(dealId, STAKE_KEEP);
        }
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
