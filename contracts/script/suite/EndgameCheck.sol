// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";
import {EndgameConfig} from "./EndgameConfig.sol";
import {EndgameDeployment} from "./EndgameDeploy.sol";

/// @notice Reads the suite back from the chain and refuses it, with the reason,
///         the moment one role or value is not what the config says.
library EndgameCheck {
    /// @notice Right after the deploy: the timelock owns the hub and the
    ///         deployer key holds nothing.
    function deployed(EndgameDeployment memory d, EndgameConfig memory c, address deployer) internal view {
        KarwanHub h = d.hub;
        KarwanTimelock t = d.timelock;
        require(h.owner() == address(t), "hub owner is not the timelock");
        require(h.pendingOwner() == address(0), "hub has a pending owner");
        require(h.identity() == address(d.identity), "hub identity differs");
        require(h.record() == address(d.record), "hub record differs");
        require(h.stakeVault() == address(d.vault), "hub stake vault differs");
        require(t.getMinDelay() == c.minDelay, "timelock delay differs");
        require(t.hasRole(t.DEFAULT_ADMIN_ROLE(), address(t)), "timelock is not its own admin");
        require(t.hasRole(t.PROPOSER_ROLE(), c.ownerSafe), "owner Safe cannot propose");
        require(t.hasRole(t.EXECUTOR_ROLE(), c.ownerSafe), "owner Safe cannot execute");
        require(t.hasRole(t.CANCELLER_ROLE(), c.ownerSafe), "owner Safe cannot cancel");
        require(t.hasRole(t.CANCELLER_ROLE(), c.guardianSafe), "guardian Safe cannot cancel");
        require(!t.hasRole(t.PROPOSER_ROLE(), c.guardianSafe), "guardian Safe can propose");
        require(!t.hasRole(t.EXECUTOR_ROLE(), c.guardianSafe), "guardian Safe can execute");
        bytes32[4] memory roles = [t.DEFAULT_ADMIN_ROLE(), t.PROPOSER_ROLE(), t.EXECUTOR_ROLE(), t.CANCELLER_ROLE()];
        for (uint256 i; i < 4; ++i) {
            require(!t.hasRole(roles[i], deployer), "deployer holds a timelock role");
        }
    }

    /// @notice After the owner Safe has executed the first batch.
    function configured(EndgameDeployment memory d, EndgameConfig memory c) internal view {
        KarwanHub h = d.hub;
        require(h.guardian() == c.guardianSafe, "guardian is not the guardian Safe");
        require(h.reviewSafe() == c.reviewSafe, "review Safe differs");
        require(h.seniorSafe() == c.seniorSafe, "senior Safe differs");
        require(h.feeRecipient() == c.feeRecipient, "fee recipient differs");
        require(h.autoArbiter() == c.autoArbiter, "auto arbiter differs");
        require(h.assetAllowed(c.usdc), "USDC is not allowed");
        require(h.highValueOf(c.usdc) == c.highValue, "USDC high value differs");
        _money(h, address(d.agreement), c, "agreement");
        _money(h, address(d.time), c, "time");
        _money(h, address(d.jobs), c, "jobs");
        (bool tfRegistered,,,, uint16 tfFee) = h.families(address(d.tradeFinance));
        require(tfRegistered, "trade finance is not registered");
        require(tfFee == 0, "trade finance fee differs");
        if (address(d.verifier) != address(0)) {
            require(h.isVerifier(address(d.verifier)), "check verifier is not registered");
        }
        for (uint256 i; i < c.issuers.length; ++i) {
            require(h.isIssuer(c.issuers[i]), "an issuer is not registered");
        }
    }

    function _money(KarwanHub h, address family, EndgameConfig memory c, string memory name) private view {
        (bool registered,,,, uint16 fee) = h.families(family);
        require(registered, string.concat(name, " is not registered"));
        require(fee == c.feeBps, string.concat(name, " fee differs"));
        (uint128 perDeal, uint128 total) = h.capsOf(family, c.usdc);
        require(perDeal == c.perDealCap, string.concat(name, " per-deal cap differs"));
        require(total == c.totalCap, string.concat(name, " total cap differs"));
    }
}
